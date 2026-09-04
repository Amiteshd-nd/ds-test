/**
 * The en-route warning — audio first, zero interaction.
 *
 * Ravi is on a two-wheeler, helmeted, four seconds of attention and both hands
 * on the bars. He cannot tap a card, cannot read a list, and must not look down.
 * So the warning is spoken, and the card is only there for a pillion or a
 * stopped rider to glance at. Nothing on it can be pressed, because anything
 * pressable invites pressing it at 30 km/h.
 *
 * Each event is announced once. A warning that repeats becomes noise, and noise
 * gets the whole app muted.
 */
import { closestPointOnLine, type LngLat } from '../report/geo';
import { Sensors } from '../report/sensors';
import type { Fix } from '../report/types';
import { OBSTRUCTION_LABELS } from '../report/types';
import type { BlockageEvent, SegmentFacts } from '../state/types';

/** Far enough ahead to still turn off, close enough to be about this road. */
const WARN_RADIUS_M = 180;

export interface EnrouteContext {
  segments: Map<string, SegmentFacts>;
  geometry: Map<string, LngLat[]>;
  events: () => BlockageEvent[];
}

export class Enroute {
  private card: HTMLElement;
  private announced = new Set<string>();
  private on = false;
  private sensors = new Sensors();
  private off: (() => void) | null = null;

  constructor(private ctx: EnrouteContext) {
    this.card = document.createElement('div');
    this.card.className = 'enroute';
    this.card.hidden = true;
    this.card.setAttribute('role', 'alert');
    document.body.append(this.card);
  }

  get active() {
    return this.on;
  }

  /** Owns its own position watch: warnings must keep working with the capture
      screen closed, which is the entire point of them. */
  async start() {
    this.on = true;
    this.announced.clear();
    this.off = this.sensors.subscribe((s) => this.update(s.fix));
    await this.sensors.start();
  }

  stop() {
    this.on = false;
    this.off?.();
    this.off = null;
    this.sensors.stop();
    this.card.hidden = true;
    window.speechSynthesis?.cancel();
  }

  /** Call on every position update. Cheap: a handful of segments, no allocation. */
  update(fix: Fix | null) {
    if (!this.on || !fix) return;
    const here: LngLat = [fix.lng, fix.lat];

    for (const ev of this.ctx.events()) {
      if (ev.severity === 'clear') continue;
      if (this.announced.has(ev.id)) continue;

      const line = this.ctx.geometry.get(ev.segment_id);
      if (!line) continue;
      if (closestPointOnLine(here, line).distance_m > WARN_RADIUS_M) continue;

      this.announced.add(ev.id);
      this.announce(ev);
      return; // one at a time; two spoken warnings at once is neither
    }
  }

  private announce(ev: BlockageEvent) {
    const seg = this.ctx.segments.get(ev.segment_id);
    const cause = OBSTRUCTION_LABELS[ev.obstruction_type].toLowerCase();
    const road = seg?.name.replace(/^unnamed \w+ off /, '') ?? 'the road ahead';

    // Cause, place, consequence — the same order as the panel, so what he hears
    // and what he would have read are the same sentence.
    const spoken =
      ev.severity === 'blocked'
        ? `${cause} on ${road}. A car cannot pass.`
        : `${cause} on ${road}. Bikes pass, cars queue.`;

    this.speak(spoken);

    this.card.innerHTML = `
      <p class="enroute__cause">${OBSTRUCTION_LABELS[ev.obstruction_type]}</p>
      <p class="enroute__road">${road}</p>
      <p class="enroute__consequence">${
        ev.severity === 'blocked' ? 'A car cannot pass' : 'Bikes pass, cars queue'
      }</p>`;
    this.card.className = `enroute enroute--${ev.severity}`;
    this.card.hidden = false;
    setTimeout(() => (this.card.hidden = true), 9000);
  }

  private speak(text: string) {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'en-IN';
    utter.rate = 0.95;
    synth.cancel();
    synth.speak(utter);
  }
}
