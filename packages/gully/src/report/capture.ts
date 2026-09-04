/**
 * The capture flow. Camera first, one thumb, four seconds.
 *
 * The whole screen is the control. There is no form and no dropdown on the
 * primary path: shutter → the phone works out what and where → one chip sends
 * it. Everything that could block — classification, snapping, redaction — runs
 * on the device, so the only thing between the shutter and the queue is the
 * reporter's own tap.
 *
 * Correction is a chip row rather than a picker: when the classifier is wrong,
 * or missing entirely, choosing the right type is still one tap and still sends.
 */
import { loadClassifier, type Classifier } from './classify';
import { dataStatement, redact } from './redact';
import { MOVING_MPS, Sensors, simulatedFix } from './sensors';
import { snap, type SnapIndex } from './snap';
import { saveReport, remoteConfigured } from './store';
import { listen, speechAvailable, streetScore, VOICE_LANGS, type VoiceLang } from './voice';
import {
  OBSTRUCTION_LABELS,
  OBSTRUCTION_ORDER,
  type Classification,
  type Fix,
  type LocalReport,
  type ObstructionType,
  type PhotoRedaction,
  type SnapResult,
} from './types';

export interface SegmentLookup {
  (id: string): { name: string; width_m: number; tanker_gap_m: number } | undefined;
}

export interface CaptureContext {
  index: SnapIndex;
  lookup: SegmentLookup;
  /** Desk fallback: the map's current centre, used when there is no usable fix. */
  mapCentre: () => { lat: number; lng: number };
  onSaved: (report: LocalReport) => void;
}

interface Pending {
  fix: Fix;
  snapped: SnapResult;
  classification: Classification;
  redaction: PhotoRedaction | null;
  photo: Blob | null;
  source: 'photo' | 'voice';
  t0: number;
  transcript?: string;
}

const html = (strings: TemplateStringsArray, ...v: unknown[]) =>
  strings.reduce((out, s, i) => out + s + (v[i] ?? ''), '');

export class Capture {
  private root: HTMLElement;
  private sensors = new Sensors();
  private classifier: Classifier | null = null;
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private pending: Pending | null = null;
  private unsubscribe: (() => void) | null = null;
  private sensing = false;
  private lang: VoiceLang = (localStorage.getItem('gully.voice_lang') as VoiceLang) ?? 'en-IN';

  constructor(private ctx: CaptureContext) {
    this.root = document.createElement('div');
    this.root.className = 'capture';
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', 'Report what is blocking the road');
    document.body.append(this.root);

    this.root.addEventListener('click', (e) => this.onClick(e));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.root.hidden) this.close();
    });
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────

  async open() {
    this.root.hidden = false;
    document.body.classList.add('is-capturing');
    this.renderLive();

    // Kick off the slow things in parallel with the camera warming up.
    if (!this.classifier) void loadClassifier().then((c) => (this.classifier = c));
    this.unsubscribe = this.sensors.subscribe(() => this.renderStatus());
    await this.ensureSensors();
    await this.startCamera();
  }

  private async ensureSensors() {
    if (this.sensing) return;
    this.sensing = true;
    await this.sensors.start();
  }

  /** Give the GPS a moment before falling back to the map centre. */
  private waitForFix(ms = 1500): Promise<void> {
    if (this.sensors.current.fix) return Promise.resolve();
    return new Promise((resolve) => {
      const off = this.sensors.subscribe((s) => {
        if (s.fix) { off(); clearTimeout(timer); resolve(); }
      });
      const timer = setTimeout(() => { off(); resolve(); }, ms);
    });
  }

  /**
   * "Just drove through, it's fine" — one tap from the map, no screen in
   * between. Most crowdsourced systems make the negative report expensive and
   * then over-report blockages as a result (PRD §7 Phase 2).
   */
  async quickClear(): Promise<void> {
    const t0 = performance.now();
    await this.ensureSensors();
    await this.waitForFix();

    const placed = this.resolveFix();
    const snapped = placed && snap(placed.fix, this.ctx.index);
    if (!placed || !snapped) return this.toast('Could not place you on a road in the pilot layout.');

    const saved = await saveReport({
      kind: 'clear',
      source: 'tap',
      fix: placed.fix,
      snap: snapped,
      obstruction_type: null,
      classifier_conf: null,
      corrected: false,
      capture_ms: Math.round(performance.now() - t0),
      redaction: null,
      photo: null,
    });
    this.ctx.onSaved(saved);
    this.toast(`${this.ctx.lookup(snapped.segment_id)?.name ?? snapped.segment_id} marked clear.`);
  }

  private toast(text: string) {
    const node = el(html`<p class="report-toast" role="status">${text}</p>`);
    document.body.append(node);
    setTimeout(() => node.remove(), 3200);
  }

  close() {
    this.stopCamera();
    this.sensors.stop();
    this.sensing = false;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.pending = null;
    this.root.hidden = true;
    this.root.innerHTML = '';
    document.body.classList.remove('is-capturing');
  }

  private async startCamera() {
    const shell = this.root.querySelector('.capture__viewfinder');
    if (!shell) return;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
        audio: false,
      });
      const video = document.createElement('video');
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      video.srcObject = this.stream;
      this.video = video;
      shell.replaceChildren(video);
    } catch {
      shell.replaceChildren(
        el(html`<p class="capture__nocam">
          No camera here. The voice path and <b>Road is clear</b> still work, and both
          produce the same report.
        </p>`),
      );
    }
  }

  private stopCamera() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video = null;
  }

  // ── position ──────────────────────────────────────────────────────────────

  /**
   * A real fix if there is one on a pilot road; otherwise the map centre, clearly
   * labelled as a stand-in. Without this, the flow is untestable anywhere but
   * Kaggadasapura, and an untestable flow does not get tested.
   */
  private resolveFix(): { fix: Fix; simulated: boolean } | null {
    const live = this.sensors.current.fix;
    if (live && snap(live, this.ctx.index)) return { fix: live, simulated: false };
    const c = this.ctx.mapCentre();
    return { fix: simulatedFix(c.lat, c.lng, live?.heading_deg ?? null), simulated: true };
  }

  // ── the three actions ─────────────────────────────────────────────────────

  private async shutter() {
    const t0 = performance.now();
    if (this.sensors.current.moving) return; // gate, not a nag

    const frame = this.grabFrame();
    if (!frame) return;

    this.renderWorking();

    const { canvas, redaction } = await redact(frame);
    const classification =
      (await this.classifier?.classify(canvas)) ?? ({ type: 'tanker', conf: 0, by: 'unavailable' } as Classification);

    const placed = this.resolveFix();
    if (!placed) return this.renderLive('Waiting for a position fix.');
    const snapped = snap(placed.fix, this.ctx.index);
    if (!snapped) return this.renderLive('You are not on a road in the pilot layout.');

    const photo = redaction.complete
      ? await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.82))
      : null;

    this.pending = { fix: placed.fix, snapped, classification, redaction, photo, source: 'photo', t0 };
    this.renderConfirm(canvas, placed.simulated);
  }

  private async voice() {
    if (!speechAvailable()) return;
    const t0 = performance.now();
    this.renderListening();

    const session = listen(this.lang);
    const heard = await session.done;
    if (!heard) return this.renderLive('Did not catch that.');

    const placed = this.resolveFix();
    if (!placed) return this.renderLive('Waiting for a position fix.');

    // A heard street name outranks raw distance: "3rd cross" is a stronger
    // signal than a 15 m GPS fix on a grid of 4 m roads.
    let snapped = snap(placed.fix, this.ctx.index);
    if (heard.street && snapped) {
      const better = [snapped, ...snapped.alternatives.map((a) => ({ ...snapped!, ...a }))]
        .map((s) => ({ s, score: streetScore(this.ctx.lookup(s.segment_id)?.name ?? '', heard.street) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)[0];
      if (better) snapped = { ...better.s, decided_by: 'heading' };
    }
    if (!snapped) return this.renderLive('You are not on a road in the pilot layout.');

    if (heard.clear) {
      await this.submitClear(placed.fix, snapped, t0);
      return;
    }

    this.pending = {
      fix: placed.fix,
      snapped,
      classification: { type: heard.type ?? 'tanker', conf: heard.type ? 0.9 : 0, by: 'voice' },
      redaction: null,
      photo: null,
      source: 'voice',
      t0,
      transcript: heard.transcript,
    };
    this.renderConfirm(null, placed.simulated);
  }

  /** "Just drove through, it's fine." One tap, no confirmation step. */
  private async clear() {
    const t0 = performance.now();
    const placed = this.resolveFix();
    if (!placed) return this.renderLive('Waiting for a position fix.');
    const snapped = snap(placed.fix, this.ctx.index);
    if (!snapped) return this.renderLive('You are not on a road in the pilot layout.');
    await this.submitClear(placed.fix, snapped, t0);
  }

  private async submitClear(fix: Fix, snapped: SnapResult, t0: number) {
    const saved = await saveReport({
      kind: 'clear',
      source: 'tap',
      fix,
      snap: snapped,
      obstruction_type: null,
      classifier_conf: null,
      corrected: false,
      capture_ms: Math.round(performance.now() - t0),
      redaction: null,
      photo: null,
    });
    this.ctx.onSaved(saved);
    this.renderSent(saved, `${this.ctx.lookup(snapped.segment_id)?.name ?? snapped.segment_id} marked clear.`);
  }

  private async submit(type: ObstructionType) {
    const p = this.pending;
    if (!p) return;
    const saved = await saveReport({
      kind: 'obstruction',
      source: p.source,
      fix: p.fix,
      snap: p.snapped,
      obstruction_type: type,
      classifier_conf: p.classification.by === 'unavailable' ? null : p.classification.conf,
      corrected: type !== p.classification.type,
      capture_ms: Math.round(performance.now() - p.t0),
      redaction: p.redaction,
      photo: p.photo,
    });
    this.pending = null;
    this.ctx.onSaved(saved);
    this.renderSent(saved, `${OBSTRUCTION_LABELS[type]} on ${this.ctx.lookup(saved.segment_id)?.name ?? saved.segment_id}.`);
  }

  private grabFrame(): HTMLCanvasElement | null {
    if (!this.video || !this.video.videoWidth) return null;
    const w = Math.min(1280, this.video.videoWidth);
    const h = Math.round((this.video.videoHeight / this.video.videoWidth) * w);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(this.video, 0, 0, w, h);
    return canvas;
  }

  // ── views ─────────────────────────────────────────────────────────────────

  private renderLive(notice?: string) {
    this.root.innerHTML = html`
      <div class="capture__viewfinder"></div>
      <button class="capture__close" data-act="close" aria-label="Close">Close</button>
      <div class="capture__status" id="capture-status"></div>
      ${notice ? html`<p class="capture__notice">${notice}</p>` : ''}
      <div class="capture__actions">
        <button class="capture__clear" data-act="clear">Road is clear</button>
        <button class="capture__shutter" data-act="shutter" aria-label="Take the photo"></button>
        <button class="capture__voice" data-act="voice" ${speechAvailable() ? '' : 'disabled'}>
          Speak<span class="capture__lang">${VOICE_LANGS.find((l) => l.code === this.lang)?.label}</span>
        </button>
      </div>
    `;
    if (this.video) this.root.querySelector('.capture__viewfinder')!.replaceChildren(this.video);
    else void this.startCamera();
    this.renderStatus();
  }

  private renderStatus() {
    const el = this.root.querySelector('#capture-status');
    if (!el) return;
    const { fix, error, moving } = this.sensors.current;

    if (moving) {
      el.className = 'capture__status capture__status--gate';
      el.innerHTML = html`<b>Moving — camera is off.</b> Stop, or use <b>Speak</b>. Reporting can wait; the road cannot.`;
      return;
    }
    el.className = 'capture__status';
    if (error) return void (el.textContent = error);
    if (!fix) return void (el.textContent = 'Finding your position…');

    const s = snap(fix, this.ctx.index);
    const name = s ? this.ctx.lookup(s.segment_id)?.name : null;
    el.textContent = s
      ? `${name ?? s.segment_id} · ${s.snap_distance_m} m away · ±${fix.accuracy_m} m fix`
      : `Outside the pilot layout · ±${fix.accuracy_m} m fix`;
  }

  private renderWorking() {
    const actions = this.root.querySelector('.capture__actions');
    if (actions) actions.innerHTML = html`<p class="capture__working">Reading the photo on this phone…</p>`;
  }

  private renderListening() {
    this.root.innerHTML = html`
      <div class="capture__viewfinder"></div>
      <button class="capture__close" data-act="close" aria-label="Close">Close</button>
      <div class="capture__listening">
        <div class="capture__pulse" aria-hidden="true"></div>
        <p>Listening — say what is there and which cross.</p>
        <p class="capture__eg">“Tanker on 3rd cross”</p>
      </div>
    `;
  }

  private renderConfirm(frame: HTMLCanvasElement | null, simulated: boolean) {
    const p = this.pending!;
    const seg = this.ctx.lookup(p.snapped.segment_id);
    const top = p.classification;
    const alternates = OBSTRUCTION_ORDER.filter((t) => t !== top.type);

    const certainty =
      top.by === 'model' ? `${Math.round(top.conf * 100)}% sure from the photo`
      : top.by === 'voice' ? `heard “${p.transcript}”`
      : 'no classifier on this phone yet — check this is right';

    this.root.innerHTML = html`
      <div class="capture__frame"></div>
      <button class="capture__close" data-act="close" aria-label="Close">Close</button>

      <div class="capture__sheet">
        <p class="capture__where">
          <b>${seg?.name ?? p.snapped.segment_id}</b>
          <span>${seg ? `${seg.width_m.toFixed(1)} m road · a tanker leaves ${seg.tanker_gap_m.toFixed(1)} m` : ''}</span>
          <span class="capture__snapmeta">
            snapped ${p.snapped.snap_distance_m} m by ${p.snapped.decided_by === 'heading' ? 'heading' : 'distance'}${simulated ? ' · position simulated from the map' : ''}
          </span>
        </p>

        <button class="capture__send" data-act="send" data-type="${top.type}">
          <span>${OBSTRUCTION_LABELS[top.type]}</span>
          <small>${certainty} · tap to send</small>
        </button>

        <p class="capture__correct">Not that?</p>
        <div class="capture__chips">
          ${alternates.map((t) => html`<button class="capture__chip" data-act="send" data-type="${t}">${OBSTRUCTION_LABELS[t]}</button>`).join('')}
        </div>

        <p class="capture__privacy">${dataStatement(p.redaction)}</p>
        <button class="capture__retake" data-act="retake">Retake</button>
      </div>
    `;

    if (frame) {
      frame.className = 'capture__still';
      this.root.querySelector('.capture__frame')!.replaceChildren(frame);
    }
  }

  private renderSent(saved: LocalReport, line: string) {
    this.root.innerHTML = html`
      <div class="capture__sent">
        <p class="capture__sentline">${line}</p>
        <p class="capture__senttime">
          ${(saved.capture_ms / 1000).toFixed(1)} s from ${saved.source === 'tap' ? 'tap' : saved.source === 'voice' ? 'first word' : 'shutter'} to sent ·
          ${remoteConfigured ? 'syncing' : 'queued on this phone'}
        </p>
        <button class="capture__again" data-act="again">Report another</button>
        <button class="capture__done" data-act="close">Done</button>
      </div>
    `;
    setTimeout(() => {
      if (!this.root.hidden && this.root.querySelector('.capture__sent')) this.close();
    }, 4000);
  }

  private onClick(e: Event) {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!btn) return;
    switch (btn.dataset.act) {
      case 'close': return this.close();
      case 'shutter': return void this.shutter();
      case 'voice': return void this.voice();
      case 'clear': return void this.clear();
      case 'retake': return this.renderLive();
      case 'again': return this.renderLive();
      case 'send': return void this.submit(btn.dataset.type as ObstructionType);
    }
  }
}

function el(markup: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild as HTMLElement;
}

export { MOVING_MPS };
