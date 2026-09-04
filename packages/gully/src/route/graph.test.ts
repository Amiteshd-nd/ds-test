/**
 * The router's cost model, pinned on a diamond:
 *
 *        2
 *   A ↗     ↘ B        top path  1→2→3: 100 m + 100 m
 *   1         3
 *   C ↘     ↗ D        bottom    1→4→3: 150 m + 150 m
 *        4
 *
 * All roads 8 m wide unless a test says otherwise, so the width penalty is a
 * near-constant factor and path choice is driven by what each test changes.
 */
import { describe, expect, it } from 'vitest';
import { RoadGraph, SQUEEZE_PENALTY, type RoutableSegment } from './graph';

const seg = (
  id: string,
  from_node: number,
  to_node: number,
  length_m: number,
  over: Partial<RoutableSegment> = {},
): RoutableSegment => ({
  id,
  name: id,
  width_m: 8,
  lanes: null,
  oneway: false,
  length_m,
  from_node,
  to_node,
  ...over,
});

const diamond = () =>
  new RoadGraph([
    seg('A', 1, 2, 100),
    seg('B', 2, 3, 100),
    seg('C', 1, 4, 150),
    seg('D', 4, 3, 150),
  ]);

describe('routing', () => {
  it('takes the shorter path when nothing is in the way', () => {
    const r = diamond().route({ from_node: 1, to_node: 3 })!;
    expect(r.segment_ids).toEqual(['A', 'B']);
    expect(r.distance_m).toBe(200);
  });

  it('a blocked segment is removed, not merely expensive', () => {
    const r = diamond().route({ from_node: 1, to_node: 3, blocked: new Set(['A']) })!;
    expect(r.segment_ids).toEqual(['C', 'D']);
    expect(r.segment_ids).not.toContain('A');
  });

  it('a squeeze diverts when an alternative exists…', () => {
    const r = diamond().route({ from_node: 1, to_node: 3, squeeze: new Set(['A']) })!;
    // top: 100×3 + 100 = 400-equivalent; bottom: 300-equivalent → bottom wins
    expect(r.segment_ids).toEqual(['C', 'D']);
  });

  it('…but is still used when it is the only way — a squeeze is never an exclusion', () => {
    const graph = new RoadGraph([seg('A', 1, 2, 100), seg('B', 2, 3, 100)]);
    const r = graph.route({ from_node: 1, to_node: 3, squeeze: new Set(['A']) })!;
    expect(r.segment_ids).toEqual(['A', 'B']);
    expect(r.squeezed).toEqual(['A']);
    expect(Number.isFinite(SQUEEZE_PENALTY)).toBe(true);
  });

  it('everything blocked returns null, never a route through the tanker', () => {
    expect(diamond().route({ from_node: 1, to_node: 3, blocked: new Set(['A', 'C']) })).toBeNull();
  });

  it('narrow roads cost more than wide ones of the same length', () => {
    // Equal 100 m paths: one 3 m road vs one 8 m road.
    const graph = new RoadGraph([
      seg('narrow', 1, 3, 100, { width_m: 3 }),
      seg('wide', 1, 3, 100, { width_m: 8 }),
    ]);
    expect(graph.route({ from_node: 1, to_node: 3 })!.segment_ids).toEqual(['wide']);
  });

  it('oneway is respected against the grain', () => {
    const graph = new RoadGraph([seg('A', 1, 2, 100, { oneway: true })]);
    expect(graph.route({ from_node: 1, to_node: 2 })).not.toBeNull();
    expect(graph.route({ from_node: 2, to_node: 1 })).toBeNull();
  });
});

describe('disconnected components', () => {
  const split = () =>
    new RoadGraph([
      seg('A', 1, 2, 100),
      seg('Z', 8, 9, 100), // an island the polygon edge created
    ]);

  it('routing across components returns null', () => {
    expect(split().route({ from_node: 1, to_node: 9 })).toBeNull();
  });

  it('reachableFrom sees only its own island', () => {
    const reach = split().reachableFrom(1);
    expect(reach.has(2)).toBe(true);
    expect(reach.has(9)).toBe(false);
  });

  it("connectedOriginFor never picks a 'home' the destination cannot be reached from", () => {
    const coords = (id: string): [number, number][] =>
      id === 'A'
        ? [
            [77.0, 12.0],
            [77.001, 12.0],
          ]
        : [
            [77.5, 12.5],
            [77.501, 12.5],
          ];
    // Ask for an origin near the ISLAND's coordinates, destined for node 2 on
    // the mainland: the nearest node is on the island, but it must not be chosen.
    const origin = split().connectedOriginFor(2, 77.5, 12.5, coords);
    expect(origin).toBe(1);
  });
});
