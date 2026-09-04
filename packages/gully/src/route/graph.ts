/**
 * A router over our own segment graph.
 *
 * PRD §5 chooses Valhalla with `exclude_polygons`, and that is the right answer
 * for a product that has to route beyond the pilot. It is the wrong answer for
 * a 61-segment layout demo: it needs a server, an OSM extract and a tile build
 * before anything moves on screen.
 *
 * So this is the default, and Valhalla is an optional upgrade behind config
 * (see ./valhalla.ts). Dijkstra over 61 segments is instant, needs nothing, and
 * routes on *our* width data — which, for a product whose whole argument is that
 * width is the missing variable, is arguably the more honest demonstration.
 *
 * The cost model is the point:
 *
 *   blocked  ->  removed from the graph entirely (the exclude_polygons analogue)
 *   squeeze  ->  kept, but penalised (PRD §7: a cost penalty, not an exclusion)
 *   narrow   ->  penalised in proportion to how little room a car has
 */
import type { SegmentFacts } from '../state/types';
import { CAR_REFUSAL_GAP_M } from '../state/priors';

export interface RoutableSegment extends SegmentFacts {
  length_m: number;
  from_node: number;
  to_node: number;
}

export interface RouteRequest {
  from_node: number;
  to_node: number;
  /** Segments a car cannot pass. Removed from the graph. */
  blocked?: Set<string>;
  /** Segments where one direction is lost. Costed higher, never excluded. */
  squeeze?: Set<string>;
}

export interface RouteResult {
  segment_ids: string[];
  nodes: number[];
  distance_m: number;
  /** Cost in metres-equivalent, after penalties. Comparable between routes. */
  cost: number;
  /** Segments on the route that are a squeeze — the price of this detour. */
  squeezed: string[];
}

/**
 * A squeeze is passable but slow: one direction is gone, so you queue. Three
 * times the metres is a placeholder standing in for "you will wait", pending
 * anything measured. It has to be finite — an infinite penalty is an exclusion
 * wearing a disguise, and PRD §7 is explicit that a squeeze is not excluded.
 */
export const SQUEEZE_PENALTY = 3;

/**
 * Roads that are narrow before anything parks on them still cost more: a 3.5 m
 * cross with cars either side is slower than a 9 m road even on a clear day.
 * Scaled so a road at the car-refusal threshold costs double.
 */
function widthPenalty(width_m: number): number {
  const room = width_m - CAR_REFUSAL_GAP_M;
  if (room <= 0) return 4;
  return 1 + Math.min(1, 3 / room) ;
}

interface Edge {
  segment_id: string;
  to: number;
  cost: number;
  length_m: number;
  squeeze: boolean;
}

export class RoadGraph {
  private adjacency = new Map<number, Edge[]>();

  constructor(private segments: RoutableSegment[]) {}

  /** Rebuilt per request: the exclusions change every time an event does. */
  private build(req: RouteRequest) {
    this.adjacency = new Map();
    const blocked = req.blocked ?? new Set<string>();
    const squeeze = req.squeeze ?? new Set<string>();

    const link = (from: number, edge: Edge) => {
      let list = this.adjacency.get(from);
      if (!list) this.adjacency.set(from, (list = []));
      list.push(edge);
    };

    for (const s of this.segments) {
      if (blocked.has(s.id)) continue; // the exclude_polygons analogue

      const isSqueeze = squeeze.has(s.id);
      const cost = s.length_m * widthPenalty(s.width_m) * (isSqueeze ? SQUEEZE_PENALTY : 1);
      const edge = { segment_id: s.id, to: s.to_node, cost, length_m: s.length_m, squeeze: isSqueeze };

      link(s.from_node, edge);
      // Oneway is respected: on a 4 m cross it is the difference between a
      // legal detour and telling somebody to drive at the tanker.
      if (!s.oneway) {
        link(s.to_node, { ...edge, to: s.from_node });
      }
    }
  }

  route(req: RouteRequest): RouteResult | null {
    this.build(req);

    const dist = new Map<number, number>([[req.from_node, 0]]);
    const prev = new Map<number, { node: number; edge: Edge }>();
    const done = new Set<number>();

    // A binary heap would be faster; at 61 segments a linear scan is not the
    // thing worth optimising, and this stays readable.
    for (;;) {
      let node: number | null = null;
      let best = Infinity;
      for (const [n, d] of dist) {
        if (!done.has(n) && d < best) {
          best = d;
          node = n;
        }
      }
      if (node === null) break;
      if (node === req.to_node) break;
      done.add(node);

      for (const edge of this.adjacency.get(node) ?? []) {
        const next = best + edge.cost;
        if (next < (dist.get(edge.to) ?? Infinity)) {
          dist.set(edge.to, next);
          prev.set(edge.to, { node, edge });
        }
      }
    }

    if (!dist.has(req.to_node) || !prev.has(req.to_node)) return null;

    const segment_ids: string[] = [];
    const nodes: number[] = [req.to_node];
    const squeezed: string[] = [];
    let distance_m = 0;
    let at = req.to_node;

    while (at !== req.from_node) {
      const step = prev.get(at);
      if (!step) return null;
      segment_ids.unshift(step.edge.segment_id);
      nodes.unshift(step.node);
      distance_m += step.edge.length_m;
      if (step.edge.squeeze) squeezed.unshift(step.edge.segment_id);
      at = step.node;
    }

    return {
      segment_ids,
      nodes,
      distance_m: Math.round(distance_m),
      cost: Math.round(dist.get(req.to_node)!),
      squeezed,
    };
  }

  /**
   * Every node you can reach from `node`, ignoring exclusions.
   *
   * A pilot polygon cuts roads at its edge and a layout has genuine cul-de-sacs,
   * so the graph is several components rather than one. Routing between two of
   * them returns nothing, which reads as "blocked" when it actually means
   * "these roads were never joined in the first place".
   */
  reachableFrom(node: number): Set<number> {
    this.build({ from_node: node, to_node: node });
    const seen = new Set([node]);
    const queue = [node];
    while (queue.length) {
      for (const edge of this.adjacency.get(queue.pop()!) ?? []) {
        if (seen.has(edge.to)) continue;
        seen.add(edge.to);
        queue.push(edge.to);
      }
    }
    return seen;
  }

  /**
   * The node nearest `lng`/`lat` that can actually drive to `destination`.
   *
   * "Home" has to be somewhere a trip could start from, or the comparison is
   * measuring the polygon's clipping rather than the traffic.
   */
  connectedOriginFor(
    destination: number,
    lng: number,
    lat: number,
    coordsOf: (id: string) => [number, number][],
  ): number | null {
    const reachable = this.reachableFrom(destination);
    let best: { node: number; d: number } | null = null;

    for (const s of this.segments) {
      const line = coordsOf(s.id);
      if (!line?.length) continue;
      for (const [node, point] of [
        [s.from_node, line[0]],
        [s.to_node, line[line.length - 1]],
      ] as const) {
        if (!reachable.has(node) || node === destination) continue;
        const d = (point[0] - lng) ** 2 + (point[1] - lat) ** 2;
        if (!best || d < best.d) best = { node, d };
      }
    }
    return best?.node ?? null;
  }

  /** Nearest graph node to a point, for turning a map tap into an origin. */
  nearestNode(lng: number, lat: number, coordsOf: (id: string) => [number, number][]): number | null {
    let best: { node: number; d: number } | null = null;
    for (const s of this.segments) {
      const line = coordsOf(s.id);
      if (!line?.length) continue;
      for (const [node, point] of [
        [s.from_node, line[0]],
        [s.to_node, line[line.length - 1]],
      ] as const) {
        const d = (point[0] - lng) ** 2 + (point[1] - lat) ** 2;
        if (!best || d < best.d) best = { node, d };
      }
    }
    return best?.node ?? null;
  }
}
