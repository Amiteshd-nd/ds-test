// A dependency-free static server for the one file this package contains.
// The page itself needs no server at all — `open index.html` works — this exists
// so the hub can start it like every other project, on a fixed port.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
// Deliberately not `PORT`: this is started as a child of the hub, which passes its own
// environment down — a stray PORT in it would silently move this server off 6180.
const PORT = Number(process.env.CARCINOGEN_PORT || 6180);

const TYPES = { '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

http
  .createServer((req, res) => {
    const { pathname } = new URL(req.url, `http://localhost:${PORT}`);
    const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
    const file = path.join(DIR, rel);

    // Never serve outside the package directory.
    if (!file.startsWith(DIR + path.sep) && file !== path.join(DIR, 'index.html')) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    fs.readFile(file, (err, buf) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(buf);
    });
  })
  .listen(PORT, () => {
    console.log(`  carcinogen → http://localhost:${PORT}`);
  });
