/**
 * The decide panel.
 *
 * Rows, not a map. Meena is at the table with twenty seconds and two ways out of
 * her layout; she does not want to read geometry, she wants to know which one to
 * take. So this is a list of her exits, and every row answers in the same order:
 *
 *     cause  ->  duration  ->  consequence
 *
 * That order is the product's argument. Every navigation app leads with delay
 * and never states a cause, which collapses "tanker, gone by 08:37" and
 * "permanent bottleneck" into the same orange line. Leading with the cause is
 * what makes the two different decisions again.
 *
 * The uncertainty treatment here is the evidence variant. The two rejected
 * alternatives are written up in docs/uncertainty-variants.md.
 */
import { liveEvents } from '../state/engine';
import { lookup, rhythmSentence, type Rhythm } from '../rhythm/aggregate';
import { dwellP90Min, PRIORS_ARE_PLACEHOLDERS, PRIORS_PROVENANCE } from '../state/priors';
import { isSeeded } from '../state/seed';
import type { BlockageEvent, Exit, SegmentFacts } from '../state/types';
import { OBSTRUCTION_LABELS, type ObstructionType } from '../report/types';
import { loadExits, MAX_EXITS, removeExit, suggestExits, addExit } from './exits';

export interface DecideContext {
  segments: Map<string, SegmentFacts>;
  /** All events, freshly folded — the panel never caches state. */
  events: () => BlockageEvent[];
  onRecheck: (segmentId: string, type: ObstructionType, stillThere: boolean) => Promise<void>;
  demo: () => boolean;
  onToggleDemo: () => void;
  onPickExit: () => void;
  onFocus: (segmentId: string) => void;
  /** Compass direction of a segment from the layout centre, for exit labels. */
  directionOf: (segmentId: string) => import('./exits').Direction;
  /** Rhythm aggregates, for the pre-departure forecast. */
  rhythm: () => Rhythm;
  /** Fired whenever a recommendation is on screen, for the pilot metrics. */
  onViewed: (recommendedExitId: string | null) => void;
  onChanged: () => void;
}

const clock = (t: number) =>
  new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const DOW_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const whenLabel = (d: Date) =>
  `${DOW_LABELS[d.getDay()]} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

function minutesSince(t: number, now: number): string {
  const m = Math.max(0, Math.round((now - t) / 60_000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

interface RowView {
  exit: Exit;
  events: BlockageEvent[];
  worst: 'blocked' | 'squeeze' | 'clear';
}

export class Decide {
  private root: HTMLElement | null = null;
  /** null = leaving now. A Date = the pre-departure forecast for that slot. */
  private departAt: Date | null = null;

  constructor(private ctx: DecideContext) {}

  mount(root: HTMLElement) {
    this.root = root;
    root.addEventListener('click', (e) => void this.onClick(e));
    root.addEventListener('change', (e) => this.onChange(e));
    this.render();
  }

  render() {
    if (!this.root) return;
    const now = Date.now();
    const exits = loadExits();
    const all = this.ctx.events();
    // Leaving later is a different question: nothing reported *now* says
    // nothing about 08:40, so the forecast replaces the live state rather than
    // sitting beside it.
    const live = this.departAt ? [] : liveEvents(all);

    const rows: RowView[] = exits.map((exit) => {
      const evs = live.filter((e) => exit.segment_ids.includes(e.segment_id));
      // Leaving later, the severity of a row is its forecast, not its live
      // state — which is empty by construction. Reading it from `evs` would
      // recommend the road the history says is blocked most mornings.
      const worst = this.departAt
        ? this.forecastSeverity(exit)
        : evs.some((e) => e.severity === 'blocked')
          ? ('blocked' as const)
          : evs.some((e) => e.severity === 'squeeze')
            ? ('squeeze' as const)
            : ('clear' as const);
      return { exit, events: evs, worst };
    });

    // Recommend rather than re-sort: a list that reorders itself under your
    // thumb has to be re-read every time, which costs more than it saves.
    const best = rows.find((r) => r.worst === 'clear') ?? rows.find((r) => r.worst === 'squeeze');

    this.root.innerHTML = `
      <div class="decide__head">
        <h2>${this.departAt ? 'Leaving later' : 'Leaving now'}</h2>
        <p class="decide__now">${this.departAt ? whenLabel(this.departAt) : clock(now)}</p>
        <button class="decide__demo${this.ctx.demo() ? ' is-on' : ''}" data-decide="demo">
          Demo data ${this.ctx.demo() ? 'on' : 'off'}
        </button>
      </div>

      <div class="decide__when">
        <button class="${this.departAt ? '' : 'is-on'}" data-decide="now">Now</button>
        <button class="${this.departAt ? 'is-on' : ''}" data-decide="later">Later</button>
        ${
          this.departAt
            ? `<select data-decide="dow" aria-label="Day">
                 ${DOW_LABELS.map(
                   (d, i) =>
                     `<option value="${i}"${i === this.departAt!.getDay() ? ' selected' : ''}>${d}</option>`,
                 ).join('')}
               </select>
               <input type="time" step="900" data-decide="time"
                      value="${String(this.departAt.getHours()).padStart(2, '0')}:${String(this.departAt.getMinutes()).padStart(2, '0')}"
                      aria-label="Time of day" />`
            : ''
        }
      </div>

      ${this.placeholderBanner()}
      ${exits.length ? '' : this.emptyState()}

      <ul class="decide__list">
        ${rows.map((r) => this.row(r, now, r === best && rows.length > 1)).join('')}
      </ul>

      ${
        exits.length && exits.length < MAX_EXITS
          ? `<button class="decide__add" data-decide="pick">Add another exit</button>`
          : ''
      }

      ${this.recheckQueue(live, now)}
    `;

    this.ctx.onViewed(best?.exit.id ?? null);
  }

  // ── a row ─────────────────────────────────────────────────────────────────

  private row(r: RowView, now: number, recommended: boolean): string {
    const seg = this.ctx.segments.get(r.exit.segment_ids[0]);
    const ev = r.events.slice().sort((a, b) => a.effective_gap_m - b.effective_gap_m)[0];

    return `
      <li class="decide__row decide__row--${r.worst}">
        <div class="decide__rowhead">
          <p class="decide__label">${esc(r.exit.label)}${
            r.exit.via ? `<span class="decide__via">${esc(r.exit.via)}</span>` : ''
          }</p>
          ${recommended ? '<p class="decide__pick">Take this one</p>' : ''}
          <button class="decide__drop" data-decide="drop" data-id="${esc(r.exit.id)}"
                  aria-label="Remove ${esc(r.exit.label)} from my exits">Remove</button>
        </div>

        ${ev ? this.blocked(ev, now) : this.departAt ? this.forecast(r.exit, seg) : this.clear(seg)}

        <button class="decide__show" data-decide="focus" data-id="${esc(r.exit.segment_ids[0])}">
          Show on the layout
        </button>
      </li>`;
  }

  /**
   * Cause, then duration, then consequence — in that order, every time, so the
   * shape of a row is learnable and the eye stops needing to search it.
   */
  private blocked(ev: BlockageEvent, now: number): string {
    const seg = this.ctx.segments.get(ev.segment_id);
    const cause = OBSTRUCTION_LABELS[ev.obstruction_type];
    const demo = ev.reporters.some(isSeeded);

    // Duration, or an explicit unknown. Never a silent omission: a row with no
    // duration reads as "no delay", which is the opposite of what it means.
    const usualMax = dwellP90Min(ev.obstruction_type);
    const duration = ev.awaiting_recheck
      ? `Past the ${usualMax} min these usually last — <b>nobody has checked since</b>`
      : ev.expected_clear_at
        ? `Usually clears by <b>${clock(ev.expected_clear_at)}</b>`
        : '<b>How long is unknown</b>';

    const consequence =
      ev.severity === 'blocked'
        ? 'A car cannot pass.'
        : ev.severity === 'squeeze'
          ? 'Bikes pass, cars queue.'
          : 'Traffic still flows.';

    const evidence = [
      `${ev.confirmations} report${ev.confirmations === 1 ? '' : 's'} from ${ev.reporters.length} ${ev.reporters.length === 1 ? 'person' : 'people'}`,
      ev.state === 'possible' ? 'not yet corroborated' : 'corroborated',
      ev.segment_history_n > 1 ? `${ev.segment_history_n} past stops here` : null,
    ]
      .filter(Boolean)
      .join(' · ');

    return `
      <p class="decide__cause">${esc(cause)} since ${clock(ev.started_at)}
        <span>${minutesSince(ev.started_at, now)} ago</span></p>
      <p class="decide__duration">${duration}</p>
      <p class="decide__consequence">
        ${seg ? `${seg.width_m.toFixed(1)} m road, ${ev.effective_gap_m.toFixed(1)} m gap. ` : ''}${consequence}
      </p>
      <p class="decide__evidence">${esc(evidence)}${demo ? ' · <em>demo data</em>' : ''}</p>`;
  }

  /**
   * The cold-start answer: useful with zero live reports.
   *
   * It states a rate rather than a prediction — "blocked on 62% of Tuesdays
   * around 08:45, 13 of 21 days seen" — because that is what the aggregate
   * actually knows. A single "likely blocked" would be the confidence tier
   * again, and it was rejected for the same reason.
   */
  private worstCell(exit: Exit) {
    const at = this.departAt!;
    const rhythm = this.ctx.rhythm();
    let worst: ReturnType<typeof lookup> = null;
    for (const id of exit.segment_ids) {
      const cell = lookup(rhythm, id, at);
      if (cell && (!worst || cell.p_blocked > worst.p_blocked)) worst = cell;
    }
    return worst;
  }

  /** Thresholds match the row wording: usually / sometimes / usually clear. */
  private forecastSeverity(exit: Exit): 'blocked' | 'squeeze' | 'clear' {
    const cell = this.worstCell(exit);
    if (!cell) return 'clear';
    return cell.p_blocked >= 0.5 ? 'blocked' : cell.p_blocked >= 0.2 ? 'squeeze' : 'clear';
  }

  private forecast(exit: Exit, seg: SegmentFacts | undefined): string {
    const at = this.departAt!;
    const worst = this.worstCell(exit);

    const headline = !worst
      ? 'Not enough history'
      : worst.p_blocked >= 0.5
        ? 'Usually blocked'
        : worst.p_blocked >= 0.2
          ? 'Sometimes blocked'
          : 'Usually clear';

    return `
      <p class="decide__cause${worst && worst.p_blocked >= 0.5 ? '' : ' decide__cause--clear'}">
        ${headline} <span>at ${whenLabel(at)}</span></p>
      <p class="decide__duration">${esc(rhythmSentence(worst, at))}</p>
      <p class="decide__consequence">${
        seg ? `${seg.width_m.toFixed(1)} m road. A tanker here leaves ${(seg.width_m - 2.5).toFixed(1)} m.` : ''
      }</p>
      <p class="decide__evidence">Forecast from past reports, not from anything happening now.</p>`;
  }

  private clear(seg: SegmentFacts | undefined): string {
    return `
      <p class="decide__cause decide__cause--clear">Nothing reported <span>right now</span></p>
      <p class="decide__duration">No obstruction on record. <b>Whether anyone has looked is unknown.</b></p>
      <p class="decide__consequence">${
        seg ? `${seg.width_m.toFixed(1)} m road. A tanker here would leave ${(seg.width_m - 2.5).toFixed(1)} m.` : ''
      }</p>`;
  }

  // ── the recheck ask ───────────────────────────────────────────────────────

  /**
   * PRD §7: auto-expire, but ask before expiring a *confirmed* event. Somebody
   * corroborated it; dropping that silently teaches people the app is not
   * listening, and they stop reporting.
   */
  private recheckQueue(live: BlockageEvent[], now: number): string {
    const asks = live.filter((e) => e.awaiting_recheck);
    if (!asks.length) return '';
    return `
      <section class="decide__recheck">
        <h3>Still there?</h3>
        <p class="decide__recheckwhy">
          These were confirmed by more than one person but have run past how long
          they usually last. Nobody has looked since.
        </p>
        ${asks
          .map((e) => {
            const seg = this.ctx.segments.get(e.segment_id);
            return `
              <div class="decide__ask">
                <p>${esc(OBSTRUCTION_LABELS[e.obstruction_type])} on ${esc(seg?.name ?? e.segment_id)}
                  <span>reported ${minutesSince(e.started_at, now)} ago</span></p>
                <div class="decide__askbtns">
                  <button data-decide="still" data-id="${esc(e.segment_id)}"
                          data-type="${esc(e.obstruction_type)}">Still there</button>
                  <button data-decide="gone" data-id="${esc(e.segment_id)}"
                          data-type="${esc(e.obstruction_type)}">It has gone</button>
                </div>
              </div>`;
          })
          .join('')}
      </section>`;
  }

  // ── framing ───────────────────────────────────────────────────────────────

  private placeholderBanner(): string {
    if (!PRIORS_ARE_PLACEHOLDERS) return '';
    return `
      <p class="decide__placeholder">
        <b>Clearing times are estimates, not measurements.</b>
        ${esc(PRIORS_PROVENANCE)}. Every “usually clears by” below inherits that.
      </p>`;
  }

  private emptyState(): string {
    const suggestions = suggestExits([...this.ctx.segments.values()]);
    return `
      <div class="decide__empty">
        <p>Pick the two or three ways you actually leave. This panel is a choice
          between them, so it only works once it knows what they are.</p>
        <button class="decide__add" data-decide="pick">Choose from the layout</button>
        ${
          suggestions.length
            ? `<p class="decide__suggesthead">Or start with the narrowest named roads:</p>
               <div class="decide__suggest">
                 ${suggestions
                   .map(
                     (s) =>
                       `<button data-decide="quickadd" data-id="${esc(s.id)}">${esc(s.name)} <span>${s.width_m.toFixed(1)} m</span></button>`,
                   )
                   .join('')}
               </div>`
            : ''
        }
      </div>`;
  }

  // ── events ────────────────────────────────────────────────────────────────

  /** The day and time inputs are `change` events, not clicks. */
  private onChange(e: Event) {
    const el = e.target as HTMLSelectElement | HTMLInputElement;
    const what = el.dataset.decide;
    if (!this.departAt || (what !== 'dow' && what !== 'time')) return;

    const next = new Date(this.departAt);
    if (what === 'dow') {
      // Move to that weekday without caring which calendar week it lands in;
      // the rhythm lookup only reads the day of week.
      next.setDate(next.getDate() + ((Number(el.value) - next.getDay() + 7) % 7));
    } else {
      const [h, m] = el.value.split(':').map(Number);
      next.setHours(h || 0, m || 0, 0, 0);
    }
    this.departAt = next;
    this.render();
  }

  private async onClick(e: Event) {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-decide]');
    if (!btn) return;
    const id = btn.dataset.id ?? '';
    const type = (btn.dataset.type ?? 'other') as ObstructionType;

    switch (btn.dataset.decide) {
      case 'demo':
        return this.ctx.onToggleDemo();
      case 'now':
        this.departAt = null;
        return this.render();
      case 'later': {
        // Default to the morning peak, which is the slot the product exists for.
        const d = new Date();
        d.setHours(8, 45, 0, 0);
        this.departAt = d;
        return this.render();
      }
      case 'pick':
        return this.ctx.onPickExit();
      case 'quickadd': {
        const seg = this.ctx.segments.get(id);
        if (seg) addExit(seg, this.ctx.directionOf(id));
        return this.ctx.onChanged();
      }
      case 'drop':
        removeExit(id);
        return this.ctx.onChanged();
      case 'focus':
        return this.ctx.onFocus(id);
      case 'still':
        await this.ctx.onRecheck(id, type, true);
        return this.ctx.onChanged();
      case 'gone':
        await this.ctx.onRecheck(id, type, false);
        return this.ctx.onChanged();
    }
  }
}
