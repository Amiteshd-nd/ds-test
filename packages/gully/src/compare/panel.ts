/**
 * The incumbent comparison — PRD §7 Phase 4.
 *
 * Same moment, same two points, two answers side by side. The argument is not
 * that Gully's route is better; on a 400 m layout it is often the same road.
 * The argument is about the *shape* of the answer:
 *
 *   a navigation app says   "9 min · heavy traffic"
 *   Gully says              "tanker since 08:15, usually clears by 08:37,
 *                            1.5 m gap, a car cannot pass"
 *
 * One of those is a number to accept. The other is a decision you can make —
 * wait six minutes, or take the other cross. Collapsing them into an orange
 * line is the gap this product exists in.
 *
 * The Google side is display-only and nothing from it is stored (PRD §9).
 */
import { askIncumbent, incumbentConfigured, incumbentSentence, type Incumbent } from './incumbent';
import { liveEvents } from '../state/engine';
import { RoadGraph, type RouteResult } from '../route/graph';
import { valhallaConfigured } from '../route/valhalla';
import type { LngLat } from '../report/geo';
import type { BlockageEvent, Exit, SegmentFacts } from '../state/types';
import { OBSTRUCTION_LABELS } from '../report/types';
import { loadExits } from '../decide/exits';

export interface CompareContext {
  graph: RoadGraph;
  segments: Map<string, SegmentFacts>;
  geometry: Map<string, LngLat[]>;
  nodeOf: (segmentId: string, end: 'from' | 'to') => number;
  /**
   * Where the trip starts. Resolved against the destination rather than fixed,
   * because a pilot polygon cuts the graph into components and a "home" in the
   * wrong one makes every route look blocked.
   */
  originFor: (destination: number) => number | null;
  pointOfNode: (node: number) => LngLat | null;
  events: () => BlockageEvent[];
  onShowRoute: (lines: LngLat[][]) => void;
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const clock = (t: number) =>
  new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export class Compare {
  private root: HTMLElement | null = null;
  private exitIndex = 0;
  private incumbent: Incumbent | null = null;

  constructor(private ctx: CompareContext) {}

  mount(root: HTMLElement) {
    this.root = root;
    root.addEventListener('click', (e) => void this.onClick(e));
    root.addEventListener('change', (e) => void this.onChange(e));
  }

  async render() {
    if (!this.root) return;
    const exits = loadExits();

    if (!exits.length) {
      this.root.innerHTML = `
        <div class="compare__empty">
          <h2>Nothing to compare yet</h2>
          <p>Pick an exit on the Decide tab first. The comparison routes from the
            middle of the layout to one of your exits, and shows what a navigation
            app would say about the same trip at the same moment.</p>
        </div>`;
      return;
    }

    const exit = exits[Math.min(this.exitIndex, exits.length - 1)];
    const live = liveEvents(this.ctx.events());
    const blocked = new Set(live.filter((e) => e.severity === 'blocked').map((e) => e.segment_id));
    const squeeze = new Set(live.filter((e) => e.severity === 'squeeze').map((e) => e.segment_id));

    const to = this.ctx.nodeOf(exit.segment_ids[exit.segment_ids.length - 1], 'to');
    const from = this.ctx.originFor(to);

    // Two routes: what the graph says today, and what it would say with nothing
    // on it. The difference is the cost of the obstruction, which is the number
    // a navigation app would report as "delay" without ever saying why.
    const withBlockages =
      from === null ? null : this.ctx.graph.route({ from_node: from, to_node: to, blocked, squeeze });
    const clean =
      from === null ? null : this.ctx.graph.route({ from_node: from, to_node: to });

    this.root.innerHTML = `
      <div class="compare__head">
        <h2>Same trip, two answers</h2>
        <select data-compare="exit" aria-label="Which exit">
          ${exits
            .map(
              (x, i) =>
                `<option value="${i}"${i === this.exitIndex ? ' selected' : ''}>to ${esc(x.label)}</option>`,
            )
            .join('')}
        </select>
        <p class="compare__moment">${clock(Date.now())}</p>
      </div>

      <div class="compare__grid">
        ${this.incumbentCard()}
        ${this.gullyCard(exit, live, withBlockages, clean)}
      </div>

      <p class="compare__note">
        The Google side is fetched live and thrown away — nothing from it is stored,
        and nothing derived from it reaches the road data (PRD §9). Routing here runs
        on ${valhallaConfigured ? 'Valhalla' : 'the built-in graph router over the pilot segments'}.
      </p>

      ${withBlockages ? `<button class="compare__show" data-compare="show">Show both routes on the layout</button>` : ''}
    `;

    // Fetched after first paint so the comparison is readable while it lands.
    if (!this.incumbent && from !== null) void this.loadIncumbent(from, to);
  }

  private async loadIncumbent(from: number, to: number) {
    const a = this.ctx.pointOfNode(from);
    const b = this.ctx.pointOfNode(to);
    if (!a || !b) return;
    this.incumbent = await askIncumbent(a, b);
    const slot = this.root?.querySelector('[data-slot="incumbent"]');
    if (slot) slot.innerHTML = this.incumbentBody();
  }

  private incumbentCard(): string {
    return `
      <section class="compare__card compare__card--them">
        <h3>What a navigation app says</h3>
        <div data-slot="incumbent">${this.incumbentBody()}</div>
      </section>`;
  }

  private incumbentBody(): string {
    if (!this.incumbent) {
      return incumbentConfigured
        ? `<p class="compare__loading">Asking Google Routes…</p>`
        : `<p class="compare__answer compare__answer--muted">— min · traffic colour</p>
           <p class="compare__why">
             No Google Routes key configured, so this is the shape of the answer rather
             than a live one: a duration and a colour band. See MANUAL.md §11.
           </p>`;
    }

    if (!this.incumbent.live) {
      return `<p class="compare__answer compare__answer--muted">— min · traffic colour</p>
              <p class="compare__why">${esc(this.incumbent.reason)}</p>`;
    }

    return `
      <p class="compare__answer compare__answer--${this.incumbent.band}">
        ${esc(incumbentSentence(this.incumbent))}
      </p>
      <p class="compare__why">
        No cause. No duration for the cause. A colour that means the same thing whether
        a tanker is unloading for twenty minutes or the road is permanently too narrow.
      </p>`;
  }

  private gullyCard(
    exit: Exit,
    live: BlockageEvent[],
    withBlockages: RouteResult | null,
    clean: RouteResult | null,
  ): string {
    const onExit = live.filter((e) => exit.segment_ids.includes(e.segment_id));
    const ev = onExit.sort((a, b) => a.effective_gap_m - b.effective_gap_m)[0];
    const seg = this.ctx.segments.get(exit.segment_ids[0]);

    // Three different nothings, and they must not read alike: a road cut off by
    // an obstruction, a road the pilot data never joined up, and an open road.
    const detour =
      withBlockages && clean && withBlockages.distance_m !== clean.distance_m
        ? `${withBlockages.distance_m - clean.distance_m} m further than the direct way`
        : withBlockages
          ? 'the direct way is open'
          : clean
            ? 'no way through — every route to it is blocked'
            : 'not connected to the rest of the pilot layout in this data';

    const cause = ev
      ? `${OBSTRUCTION_LABELS[ev.obstruction_type]} since ${clock(ev.started_at)}`
      : 'Nothing reported';

    const duration = ev
      ? ev.expected_clear_at
        ? `Usually clears by ${clock(ev.expected_clear_at)}`
        : 'How long is unknown'
      : 'Whether anyone has looked is unknown';

    const consequence = ev
      ? ev.severity === 'blocked'
        ? `${ev.effective_gap_m.toFixed(1)} m gap. A car cannot pass.`
        : `${ev.effective_gap_m.toFixed(1)} m gap. Bikes pass, cars queue.`
      : seg
        ? `${seg.width_m.toFixed(1)} m road, nothing on it.`
        : '';

    return `
      <section class="compare__card compare__card--us">
        <h3>What Gully says</h3>
        <p class="compare__answer">${esc(cause)}</p>
        <p class="compare__duration">${esc(duration)}</p>
        <p class="compare__consequence">${esc(consequence)}</p>
        <p class="compare__route">
          Route ${withBlockages ? `${withBlockages.distance_m} m` : '—'} · ${esc(detour)}
          ${withBlockages?.squeezed.length ? ` · through ${withBlockages.squeezed.length} squeeze` : ''}
        </p>
        <p class="compare__why">
          A cause, a time it should end, and what it means for a car. Enough to decide
          between waiting six minutes and taking the other cross.
        </p>
      </section>`;
  }

  private async onChange(e: Event) {
    const el = e.target as HTMLSelectElement;
    if (el.dataset.compare !== 'exit') return;
    this.exitIndex = Number(el.value);
    this.incumbent = null; // a different destination is a different question
    await this.render();
  }

  private async onClick(e: Event) {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-compare]');
    if (btn?.dataset.compare !== 'show') return;

    const exits = loadExits();
    const exit = exits[Math.min(this.exitIndex, exits.length - 1)];
    if (!exit) return;

    const live = liveEvents(this.ctx.events());
    const blocked = new Set(live.filter((x) => x.severity === 'blocked').map((x) => x.segment_id));
    const squeeze = new Set(live.filter((x) => x.severity === 'squeeze').map((x) => x.segment_id));
    const to = this.ctx.nodeOf(exit.segment_ids[exit.segment_ids.length - 1], 'to');
    const from = this.ctx.originFor(to);
    if (from === null) return;

    const route = this.ctx.graph.route({ from_node: from, to_node: to, blocked, squeeze });
    if (!route) return;

    this.ctx.onShowRoute(
      route.segment_ids.map((id) => this.ctx.geometry.get(id) ?? []).filter((l) => l.length > 1),
    );
  }
}
