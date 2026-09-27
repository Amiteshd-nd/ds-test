/**
 * The owner's own photographs.
 *
 * This is the fix for the single worst thing about a generated site: Picsum
 * returns a real photograph chosen at random by a seed, so a hedgelaying page
 * gets a flat lay of sunglasses. Every surface said so, which was honest and
 * did not make the page any better.
 *
 * A small business already has the photographs. They are on the owner's phone -
 * the hedge they laid last winter, the bakery at six in the morning, the van.
 * So the fix is not a better generator, it is somewhere to put them.
 *
 * Uploads live in `.runner/assets/<project>/`. `seedSite` copies them into the
 * site project's `public/assets/`, which Astro copies into `dist/`, so the same
 * path works in the preview, in the deployed site, and in a tarball handed to
 * somebody else. No rewriting at serve time and no broken links.
 */

import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export interface Asset {
  /** The filename, which is also its path under `/assets/`. */
  file: string;
  /** What the photograph is of, in the owner's words. Becomes the alt text. */
  alt: string;
  width: number;
  height: number;
  bytes: number;
  uploaded_at: string;
}

const MANIFEST = 'assets.json';
/** Formats a browser will render and Astro will copy untouched. */
const ALLOWED = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);
const MAX_BYTES = 12 * 1024 * 1024;

export function assetsDir(projectId: string): string {
  return path.join(process.cwd(), '.runner', 'assets', projectId);
}

export async function listAssets(projectId: string): Promise<Asset[]> {
  const file = path.join(assetsDir(projectId), MANIFEST);
  if (!existsSync(file)) return [];
  try {
    return JSON.parse(await readFile(file, 'utf8')) as Asset[];
  } catch {
    return [];
  }
}

async function writeManifest(projectId: string, assets: Asset[]): Promise<void> {
  await mkdir(assetsDir(projectId), { recursive: true });
  await writeFile(
    path.join(assetsDir(projectId), MANIFEST),
    JSON.stringify(assets, null, 2),
    'utf8',
  );
}

export async function addAsset(
  projectId: string,
  input: { filename: string; alt: string; bytes: Buffer },
): Promise<Asset> {
  const extension = path.extname(input.filename).toLowerCase();
  if (!ALLOWED.has(extension)) {
    throw new Error(
      `${extension || 'that'} is not an image format a browser will show. Use jpg, png, webp or avif.`,
    );
  }
  if (input.bytes.length > MAX_BYTES) {
    throw new Error(`that file is ${Math.round(input.bytes.length / 1024 / 1024)}MB. The limit is 12MB.`);
  }

  const size = imageSize(input.bytes);
  if (!size) {
    throw new Error('that does not look like an image. The file may be corrupt or misnamed.');
  }
  // A hero photograph at 400px wide looks like a mistake on a retina screen.
  if (size.width < 800) {
    throw new Error(
      `that image is ${size.width}px wide. Anything under 800 looks soft as a hero. ` +
        'Send the original rather than a resized copy.',
    );
  }

  const alt = input.alt.trim();
  if (alt.split(/\s+/).filter(Boolean).length < 3) {
    throw new Error(
      'describe what the photograph shows, in a few words. It becomes the alt text, and the ' +
        'builder uses it to decide where the photograph belongs.',
    );
  }

  const file = safeName(input.filename);
  await mkdir(assetsDir(projectId), { recursive: true });
  await writeFile(path.join(assetsDir(projectId), file), input.bytes);

  const asset: Asset = {
    file,
    alt,
    width: size.width,
    height: size.height,
    bytes: input.bytes.length,
    uploaded_at: new Date().toISOString(),
  };

  const assets = (await listAssets(projectId)).filter((a) => a.file !== file);
  await writeManifest(projectId, [...assets, asset]);
  return asset;
}

export async function removeAsset(projectId: string, file: string): Promise<void> {
  const name = safeName(file);
  await rm(path.join(assetsDir(projectId), name), { force: true });
  await writeManifest(
    projectId,
    (await listAssets(projectId)).filter((a) => a.file !== name),
  );
}

/**
 * Copy a project's photographs into a site project.
 *
 * Into `public/assets/`, because Astro copies `public/` into `dist/` verbatim.
 * The page then references `/assets/<file>`, which is a root-relative path -
 * and `serve-file.ts` already rewrites those for the preview and the local
 * deployment, so one path works everywhere.
 */
export async function copyAssetsInto(projectId: string, sitePublic: string): Promise<Asset[]> {
  const assets = await listAssets(projectId);
  if (assets.length === 0) return [];

  const target = path.join(sitePublic, 'assets');
  await mkdir(target, { recursive: true });

  const copied: Asset[] = [];
  for (const asset of assets) {
    const from = path.join(assetsDir(projectId), asset.file);
    if (!existsSync(from)) continue;
    await copyFile(from, path.join(target, asset.file));
    copied.push(asset);
  }
  return copied;
}

/** How the builder is told what it has to work with. */
export function describeAssets(assets: Asset[]): string {
  if (assets.length === 0) return '';
  return [
    `The owner has supplied ${assets.length} photograph${assets.length === 1 ? '' : 's'}. ` +
      'Use these rather than placeholders wherever one fits:',
    '',
    ...assets.map((a) => `- \`/assets/${a.file}\` (${a.width}x${a.height}) - ${a.alt}`),
    '',
    'The alt text above is the owner\'s own description. Use it, or tighten it, but do not ' +
      'invent a different subject. If there is no photograph for a slot, fall back to a Picsum ' +
      'seed and say in your summary which slots are still placeholders.',
  ].join('\n');
}

/* --------------------------------------------------------------- headers */

/**
 * Image dimensions from the file header.
 *
 * Hand-rolled rather than pulled from a library, because all this needs is the
 * first few bytes of four formats, and `sharp` is a native build and forty
 * megabytes to answer "how wide is it".
 */
export function imageSize(bytes: Buffer): { width: number; height: number } | null {
  // PNG: IHDR is always the first chunk, at a fixed offset.
  if (bytes.length > 24 && bytes.toString('ascii', 1, 4) === 'PNG') {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }

  // JPEG: walk the segment markers to the start-of-frame.
  if (bytes.length > 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      // SOF0 through SOF15, excluding the four that are not frame headers.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
      }
      offset += 2 + bytes.readUInt16BE(offset + 2);
    }
    return null;
  }

  // WebP: the dimensions sit in the VP8/VP8L/VP8X chunk, each encoded differently.
  if (bytes.length > 30 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = bytes.toString('ascii', 12, 16);
    if (chunk === 'VP8X') {
      return {
        width: (bytes.readUIntLE(24, 3) & 0xffffff) + 1,
        height: (bytes.readUIntLE(27, 3) & 0xffffff) + 1,
      };
    }
    if (chunk === 'VP8 ') {
      return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
    }
    if (chunk === 'VP8L') {
      const bits = bytes.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
  }

  // AVIF is an ISOBMFF container and reading it properly means walking boxes.
  // Accepting it without dimensions would break the template's guard, so it is
  // refused with a message that says what to do.
  if (bytes.length > 12 && bytes.toString('ascii', 4, 8) === 'ftyp') return null;

  return null;
}

const safeName = (name: string) =>
  path
    .basename(name)
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/^[.-]+/, '')
    .slice(0, 80) || 'photo.jpg';
