/**
 * A static file server, for looking at a built site.
 *
 * Playwright needs a URL. An Astro build references its assets from the site
 * root (`/_astro/...`), so `file://` gives a page with no CSS - which would
 * fail every visual check for a reason that has nothing to do with the site.
 *
 * So each check spins one of these up, measures, and shuts it down.
 *
 * The port comes from a fixed range rather than from the OS. `listen(0)` would
 * be simpler, but the kernel's ephemeral range starts at 49152 on most systems
 * and this repository does not use ports beginning with 4 or 5 (CLAUDE.md
 * section 2).
 */

import { createServer, type Server } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';

const FIRST_PORT = 6200;
const LAST_PORT = 6899;

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
};

export interface StaticSite {
  url: string;
  close(): Promise<void>;
}

export async function serveDirectory(root: string): Promise<StaticSite> {
  const server = createServer((req, res) => {
    const requested = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let file = path.join(root, requested);

    // Contained by construction: anything that resolves outside the root is a
    // traversal attempt or a bug, and either way it is a 403.
    if (!path.resolve(file).startsWith(path.resolve(root))) {
      res.writeHead(403).end('forbidden');
      return;
    }

    if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!existsSync(file)) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
      return;
    }

    res.writeHead(200, {
      'content-type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    createReadStream(file).pipe(res);
  });

  const port = await listenOnFreePort(server);
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        // A keep-alive connection from a browser that is still open would hold
        // `close` indefinitely.
        server.closeAllConnections?.();
      }),
  };
}

function listenOnFreePort(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    // A random start, so two checks running at once rarely collide on the first
    // try rather than always colliding.
    let port = FIRST_PORT + Math.floor(Math.random() * (LAST_PORT - FIRST_PORT));
    let attempts = 0;

    const tryPort = () => {
      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code !== 'EADDRINUSE' || attempts > 40) {
          reject(err);
          return;
        }
        attempts += 1;
        port = port >= LAST_PORT ? FIRST_PORT : port + 1;
        tryPort();
      });
      server.listen(port, '127.0.0.1', () => resolve(port));
    };

    tryPort();
  });
}
