/**
 * A tiny static server for demo/. Chromium will not let a file:// page fetch
 * its sibling files, so both capture and preview serve the folder over
 * 127.0.0.1 on a port from 6300-6399 (repo rule: no 4xxx or 5xxx ports).
 */
import { createServer, type Server } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';

const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
};

export async function serve(dir: string, from = 6300, to = 6399): Promise<{ url: string; close: () => void }> {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    let file = path.join(dir, decodeURIComponent(url.pathname));
    if (!file.startsWith(dir)) { res.writeHead(403).end(); return; }
    if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!existsSync(file)) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    createReadStream(file).pipe(res);
  });
  for (let port = from; port <= to; port++) {
    const ok = await listen(server, port);
    if (ok) return { url: `http://127.0.0.1:${port}/`, close: () => server.close() };
  }
  throw new Error(`no free port in ${from}-${to}`);
}

function listen(server: Server, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const onError = () => { server.removeListener('error', onError); resolve(false); };
    server.once('error', onError);
    server.listen(port, '127.0.0.1', () => { server.removeListener('error', onError); resolve(true); });
  });
}
