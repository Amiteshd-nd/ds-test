import manifest from './maps.manifest.json';
import { TILEMAP_FILE_URLS } from './index';

/**
 * A map's contract with the game code: which Tiled layers must exist, which one
 * is the collision stencil, and which spawn objects the scenes rely on.
 */
export interface MapDefinition {
  /** Phaser cache key, e.g. "airport_map". */
  key: string;
  /** Tiled export filename, relative to src/assets/tilemaps/. */
  file: string;
  /** Bundled URL for the .tmj. */
  url: string;
  /** Tile layers that must be present, matched by exact name. */
  requiredLayers: string[];
  /** Layer used as the (invisible) collision stencil. */
  collisionLayer?: string;
  /** Object layer holding spawn points. */
  spawnLayer?: string;
  /** Spawn object names the scene code depends on. */
  requiredSpawns: string[];
}

interface ManifestMap {
  file: string;
  requiredLayers: string[];
  collisionLayer?: string;
  spawnLayer?: string;
  requiredSpawns?: string[];
}

export const TILE_SIZE_FROM_MANIFEST: number = manifest.tileSize;

const build = (): Record<string, MapDefinition> => {
  const entries = Object.entries(manifest.maps as Record<string, ManifestMap>);

  return Object.fromEntries(
    entries.map(([key, def]) => {
      const basename = def.file.replace(/\.[^.]+$/, '');
      const url = TILEMAP_FILE_URLS[basename];

      // A manifest entry with no matching file is a build-time mistake, but the
      // validator only runs in CI/build — fail loudly here too rather than
      // handing Phaser `undefined` and debugging a blank screen.
      if (!url) {
        throw new Error(
          `Map "${key}" references ${def.file}, which is not in src/assets/tilemaps/`,
        );
      }

      return [
        key,
        {
          key,
          file: def.file,
          url,
          requiredLayers: def.requiredLayers,
          collisionLayer: def.collisionLayer,
          spawnLayer: def.spawnLayer,
          requiredSpawns: def.requiredSpawns ?? [],
        } satisfies MapDefinition,
      ];
    }),
  );
};

/** Every map the game knows about, keyed by Phaser cache key. */
export const MAPS: Record<string, MapDefinition> = build();

export const AIRPORT_MAP = MAPS.airport_map;
