/**
 * Validates Tiled exports against src/assets/maps.manifest.json.
 *
 * Tiled failures are quiet: a renamed layer renders an empty floor, a tileset
 * whose `name` no longer matches its PNG basename renders nothing at all, and
 * a missing spawn drops the player at a hard-coded fallback. None of these
 * throw. This turns every one of them into a build error with a fix in it.
 *
 * Exit code 0 = all maps valid. 1 = at least one problem.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const assetsDir = resolve(here, '../src/assets');
const mapsDir = join(assetsDir, 'tilemaps');
const tilesetsDir = join(assetsDir, 'tilesets');

/** Collect problems for one map. Pure, so tests can drive it directly. */
export function validateMap(mapKey, def, tmj, availableTilesets, tileSize, layerOrder = []) {
  const problems = [];
  const layerNames = (tmj.layers ?? []).map((l) => l.name);

  if (tmj.tilewidth !== tileSize || tmj.tileheight !== tileSize) {
    problems.push(
      `tile size is ${tmj.tilewidth}x${tmj.tileheight}, expected ${tileSize}x${tileSize} ` +
        `— re-export from Tiled with a ${tileSize}px grid`,
    );
  }

  if (tmj.orientation && tmj.orientation !== 'orthogonal') {
    problems.push(`orientation is "${tmj.orientation}", expected "orthogonal"`);
  }

  if (tmj.infinite) {
    problems.push('map is infinite — Phaser needs a fixed-size map (Map > Properties > uncheck Infinite)');
  }

  for (const required of def.requiredLayers ?? []) {
    if (!layerNames.includes(required)) {
      const near = layerNames.find(
        (n) => n.toLowerCase().replace(/\s+/g, '') === required.toLowerCase().replace(/\s+/g, ''),
      );
      problems.push(
        `missing layer "${required}"` +
          (near ? ` — found "${near}", which differs in case or spacing` : ` (has: ${layerNames.join(', ')})`),
      );
    }
  }

  // A layer named outside the taxonomy is a typo or a drift — either way the
  // game will never draw it, and silently ignoring it is how maps rot.
  if (layerOrder.length) {
    const known = new Set([...layerOrder, def.spawnLayer].filter(Boolean));
    for (const layer of tmj.layers ?? []) {
      if (!known.has(layer.name)) {
        problems.push(
          `layer "${layer.name}" is not in the layer taxonomy ` +
            `(${layerOrder.join(' → ')}) — rename it in Tiled or add it to maps.manifest.json`,
        );
      }
    }

    // Out-of-order layers render behind or in front of the wrong things.
    const present = (tmj.layers ?? [])
      .filter((l) => layerOrder.includes(l.name))
      .map((l) => l.name);
    const expected = layerOrder.filter((n) => present.includes(n));
    if (present.join(',') !== expected.join(',')) {
      problems.push(
        `layer order is ${present.join(' → ')}, expected ${expected.join(' → ')} ` +
          '— reorder them in Tiled so draw order matches the taxonomy',
      );
    }
  }

  if (def.collisionLayer) {
    const layer = (tmj.layers ?? []).find((l) => l.name === def.collisionLayer);
    if (layer && layer.visible) {
      problems.push(
        `collision layer "${def.collisionLayer}" is visible — hide it in Tiled so the stencil does not render`,
      );
    }
  }

  if (def.spawnLayer) {
    const layer = (tmj.layers ?? []).find((l) => l.name === def.spawnLayer);
    if (!layer) {
      problems.push(`missing object layer "${def.spawnLayer}"`);
    } else if (layer.type !== 'objectgroup') {
      problems.push(`"${def.spawnLayer}" is a ${layer.type}, expected an object layer`);
    } else {
      const names = (layer.objects ?? []).map((o) => o.name);
      for (const spawn of def.requiredSpawns ?? []) {
        if (!names.includes(spawn)) {
          problems.push(
            `missing spawn object "${spawn}" in "${def.spawnLayer}" (has: ${names.join(', ') || 'none'})`,
          );
        }
      }
    }
  }

  for (const ts of tmj.tilesets ?? []) {
    if (ts.source) {
      problems.push(
        `tileset "${ts.source}" is an external .tsx — re-export with "Embed tilesets" enabled`,
      );
      continue;
    }
    if (!ts.name) {
      problems.push('a tileset has no name field');
      continue;
    }
    if (!availableTilesets.includes(ts.name)) {
      problems.push(
        `tileset "${ts.name}" has no matching image — expected src/assets/tilesets/${ts.name}.png ` +
          `(available: ${availableTilesets.join(', ')})`,
      );
    }
  }

  return problems.map((p) => `${mapKey}: ${p}`);
}

export function runValidation({ manifest, mapsDir: md, tilesetsDir: td }) {
  const availableTilesets = existsSync(td)
    ? readdirSync(td).filter((f) => f.endsWith('.png')).map((f) => f.replace(/\.png$/, ''))
    : [];

  const problems = [];
  for (const [mapKey, def] of Object.entries(manifest.maps ?? {})) {
    const path = join(md, def.file);
    if (!existsSync(path)) {
      problems.push(`${mapKey}: ${def.file} not found in src/assets/tilemaps/`);
      continue;
    }

    let tmj;
    try {
      tmj = JSON.parse(readFileSync(path, 'utf8'));
    } catch (err) {
      problems.push(`${mapKey}: ${def.file} is not valid JSON — ${err.message}`);
      continue;
    }

    problems.push(
      ...validateMap(mapKey, def, tmj, availableTilesets, manifest.tileSize, manifest.layerOrder ?? []),
    );
  }
  return problems;
}

// Only run when invoked directly, so tests can import the functions above.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const manifest = JSON.parse(readFileSync(join(assetsDir, 'maps.manifest.json'), 'utf8'));
  const problems = runValidation({ manifest, mapsDir, tilesetsDir });

  if (problems.length) {
    console.error(`\n✗ Tilemap validation failed (${problems.length} problem${problems.length > 1 ? 's' : ''}):\n`);
    for (const p of problems) console.error(`  • ${p}`);
    console.error('');
    process.exit(1);
  }

  const count = Object.keys(manifest.maps ?? {}).length;
  console.log(`✓ ${count} tilemap${count === 1 ? '' : 's'} valid`);
}
