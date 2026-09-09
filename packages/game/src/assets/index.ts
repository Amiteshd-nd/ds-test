// Asset URLs, resolved by the bundler.
//
// The reference project loads these from `public/` by relative path, which only
// works when the game is the site root. This package is also consumed as a
// library by personal-doc, whose build does not copy this package's public/
// directory — a relative 'assets/…' path there would resolve against the host
// route (/game/bangalore-times/assets/…) and 404. Importing through the bundler
// hands it a correct, hashed URL in both dev and build.

// Character sheets are discovered too. Every file in sprites/ is a 4x4 grid of
// 32x48 frames (down, left, right, up), so adding a character is dropping a PNG
// in — BootScene registers its animations automatically.
const spriteModules = import.meta.glob('./sprites/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

// Tilesets and tilemaps are discovered rather than listed. Dropping a PNG into
// tilesets/ whose basename matches the tileset `name` in Tiled is all that is
// needed to use it — no import to add here, no loader line in BootScene.
const tilesetModules = import.meta.glob('./tilesets/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const tilemapModules = import.meta.glob('./tilemaps/*.tmj', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

/** "./tilesets/luggage-belt.png" -> "luggage-belt" */
const basename = (path: string): string =>
  path.split('/').pop()!.replace(/\.[^.]+$/, '');

const byBasename = (modules: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(modules).map(([path, url]) => [basename(path), url]));

/**
 * Tileset image URLs keyed by basename. Each key MUST match the `name` field of
 * the corresponding tileset in the .tmj — Phaser matches them by name when the
 * layers are built, and a mismatch silently renders an empty layer. The
 * validator enforces this at build time.
 */
export const TILESET_URLS: Record<string, string> = byBasename(tilesetModules);

/** Character spritesheet URLs keyed by basename, e.g. "citizen". */
export const SPRITE_URLS: Record<string, string> = byBasename(spriteModules);

/** Tilemap URLs keyed by file basename, e.g. "airport_interior". */
export const TILEMAP_FILE_URLS: Record<string, string> = byBasename(tilemapModules);
