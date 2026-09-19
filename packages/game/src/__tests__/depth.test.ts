import { describe, expect, it } from 'vitest';
import { characterZY, depthForZY, objectZY } from '../core/depth';
import { DEPTH } from '../utils/constants';
import { OBJECTS, objectFrames, getObject, STREET_TILE_IDS } from '../data';

describe('depth sorting', () => {
  it('keeps every entity depth inside one band above the world layers', () => {
    for (const zY of [0, 1, 500, 640, 99_999]) {
      const d = depthForZY(zY);
      expect(d).toBeGreaterThanOrEqual(DEPTH.ENTITIES);
      expect(d).toBeLessThan(DEPTH.ENTITIES + 1);
      expect(d).toBeGreaterThan(DEPTH.OBJECTS);
      expect(d).toBeLessThan(DEPTH.ABOVE_PLAYER);
    }
  });

  it('sorts strictly by bottom edge', () => {
    expect(depthForZY(100)).toBeLessThan(depthForZY(200));
    expect(depthForZY(0)).toBeLessThan(depthForZY(1));
  });

  it('clamps out-of-range values rather than escaping the band', () => {
    expect(depthForZY(-500)).toBe(DEPTH.ENTITIES);
    expect(depthForZY(1e9)).toBeLessThan(DEPTH.ENTITIES + 1);
  });

  it('takes a character\'s zY from its feet, not its centre', () => {
    // A 48px-tall sprite centred at y=100 has its feet at 124.
    expect(characterZY({ y: 100, displayHeight: 48 })).toBe(124);
  });

  it('takes an object\'s zY from the bottom of its footprint', () => {
    // A 1x2 tree whose top tile is row 6 has its trunk bottom at row 8.
    expect(objectZY(6, 2, 32)).toBe(256);
  });

  it('puts a character below a prop in front of it, and above it behind', () => {
    const bench = depthForZY(objectZY(16, 1, 32)); // bench bottom = 544
    const above = depthForZY(characterZY({ y: 506, displayHeight: 48 })); // feet 530
    const below = depthForZY(characterZY({ y: 570, displayHeight: 48 })); // feet 594
    expect(bench).toBeGreaterThan(above); // bench occludes the player
    expect(bench).toBeLessThan(below);    // player occludes the bench
  });
});

describe('object manifests', () => {
  it('loads every authored object', () => {
    expect(Object.keys(OBJECTS)).toEqual(
      expect.arrayContaining(['STREET_TREE', 'BENCH', 'STREETLIGHT', 'SHOP_AWNING']),
    );
  });

  it('resolves tile names to frame indices', () => {
    const frames = objectFrames(getObject('STREET_TREE'));
    expect(frames).toEqual([STREET_TILE_IDS.tree_canopy, STREET_TILE_IDS.tree_trunk]);
  });

  it('lists exactly tilesWide * tilesTall frames for every variant', () => {
    for (const def of Object.values(OBJECTS)) {
      for (const [variant, names] of Object.entries(def.tiles)) {
        expect(names, `${def.id}/${variant}`).toHaveLength(def.tilesWide * def.tilesTall);
      }
    }
  });

  it('leaves every solid object at least one footprint row', () => {
    for (const def of Object.values(OBJECTS)) {
      if (!def.solid) continue;
      expect(def.tilesTall - def.backgroundTiles, def.id).toBeGreaterThan(0);
    }
  });

  it('throws on an unknown object or variant', () => {
    expect(() => getObject('SPACESHIP')).toThrow(/Unknown object/);
    expect(() => objectFrames(getObject('BENCH'), 'chrome')).toThrow(/no variant "chrome"/);
  });

  it('a tree blocks at the trunk, not across the canopy', () => {
    const tree = getObject('STREET_TREE');
    expect(tree.backgroundTiles).toBe(1);
    expect(tree.tilesTall - tree.backgroundTiles).toBe(1);
  });
});
