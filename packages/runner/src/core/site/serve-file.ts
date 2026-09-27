/**
 * Serving a file out of the versioned workspace, from a route handler.
 *
 * Both the preview and the local deployment need this, and both are reading
 * from directories whose names come from a URL. The containment check below is
 * therefore the security boundary rather than a formality: without it,
 * `/s/../../../etc/passwd` is a working request.
 */

import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import path from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.pdf': 'application/pdf',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

/**
 * Rewrite the site's root-relative URLs to sit under a prefix.
 *
 * An Astro build references its assets absolutely: `/_astro/index.css`,
 * `/favicon.svg`. That is correct for a site served from the root of its own
 * origin, which is what a real deployment is - and wrong here, where the same
 * files are served under `/api/sites/<project>/3/` or `/s/<slug>/`. Without
 * this, every preview is an unstyled page and every visual check fails for a
 * reason that has nothing to do with the page.
 *
 * Rewriting on the way out rather than building differently keeps the bytes on
 * disk identical to the bytes that get deployed. A preview of something other
 * than what would ship is not a preview.
 */
function withPrefix(html: string, prefix: string): string {
  const base = prefix.replace(/\/$/, '');
  return html
    // href="/x" and src="/x", but not href="//cdn" (protocol-relative) and not
    // an already-prefixed path.
    .replace(/\b(href|src)="\/(?!\/)/g, `$1="${base}/`)
    .replace(/\bsrcset="([^"]+)"/g, (whole, value: string) =>
      value.includes('/') ? `srcset="${value.replace(/(^|,\s*)\/(?!\/)/g, `$1${base}/`)}"` : whole,
    )
    // url(/x) inside the inlined stylesheet, which is where the fonts are.
    .replace(/url\((['"]?)\/(?!\/)/g, `url($1${base}/`);
}

export function serveFromDirectory(
  root: string,
  segments: string[],
  options: { prefix?: string } = {},
): Response {
  const requested = segments.map((s) => decodeURIComponent(s)).join('/');
  let file = path.resolve(root, requested);

  // Everything must land inside the root. `path.resolve` collapses `..`, so a
  // traversal shows up here as a path that no longer starts with it.
  if (file !== path.resolve(root) && !file.startsWith(path.resolve(root) + path.sep)) {
    return new Response('forbidden', { status: 403 });
  }

  if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!existsSync(file)) return new Response('not found', { status: 404 });

  const type = TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';

  // HTML is rewritten and therefore read into memory; everything else streams.
  // A landing page is tens of kilobytes, its images are not.
  const body =
    options.prefix && type.startsWith('text/html')
      ? withPrefix(readFileSync(file, 'utf8'), options.prefix)
      : (Readable.toWeb(createReadStream(file)) as ReadableStream);

  return new Response(body, {
    headers: {
      'content-type': type,
      ...(typeof body === 'string'
        ? { 'content-length': String(Buffer.byteLength(body)) }
        : { 'content-length': String(statSync(file).size) }),
      // Versions are immutable, but a preview is opened in an iframe that the
      // owner reloads constantly while looking at edits. Correctness beats a
      // cache hit here.
      'cache-control': 'no-store',
      // Served from this origin and rendered in an iframe on this origin. It
      // should not be embeddable anywhere else.
      'x-frame-options': 'SAMEORIGIN',
      'x-content-type-options': 'nosniff',
    },
  });
}
