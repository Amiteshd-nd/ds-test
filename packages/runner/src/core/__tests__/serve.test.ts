import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { serveFromDirectory } from '../site/serve-file.ts';

function fixture(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'runner-serve-'));
  mkdirSync(path.join(root, '_astro'), { recursive: true });
  writeFileSync(
    path.join(root, 'index.html'),
    `<!doctype html><html><head>
       <link rel="icon" href="/favicon.svg">
       <style>@font-face{src:url(/_astro/font.woff2)}</style>
     </head><body>
       <a href="#main">skip</a>
       <a href="https://example.test/x">out</a>
       <img src="/hero.jpg" srcset="/hero.jpg 1x, /hero@2x.jpg 2x">
       <script src="/_astro/page.js"></script>
     </body></html>`,
  );
  writeFileSync(path.join(root, 'favicon.svg'), '<svg/>');
  writeFileSync(path.join(root, '_astro', 'page.js'), 'console.log(1)');
  return root;
}

describe('serving a built site under a path', () => {
  it('rewrites root-relative URLs to sit under the prefix', async () => {
    const html = await serveFromDirectory(fixture(), [], { prefix: '/s/abc/' }).text();

    expect(html).toContain('href="/s/abc/favicon.svg"');
    expect(html).toContain('src="/s/abc/hero.jpg"');
    expect(html).toContain('src="/s/abc/_astro/page.js"');
    // The fonts live inside the inlined stylesheet, which is the easiest one to
    // miss and the most visible when it breaks.
    expect(html).toContain('url(/s/abc/_astro/font.woff2)');
    expect(html).toContain('srcset="/s/abc/hero.jpg 1x, /s/abc/hero@2x.jpg 2x"');
  });

  it('leaves absolute and in-page links alone', async () => {
    const html = await serveFromDirectory(fixture(), [], { prefix: '/s/abc/' }).text();
    expect(html).toContain('href="https://example.test/x"');
    expect(html).toContain('href="#main"');
  });

  it('does not rewrite anything without a prefix', async () => {
    const html = await serveFromDirectory(fixture(), []).text();
    expect(html).toContain('href="/favicon.svg"');
  });

  it('serves a nested file', async () => {
    const response = serveFromDirectory(fixture(), ['_astro', 'page.js']);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('javascript');
  });

  it('refuses to climb out of the directory', async () => {
    // Both segments are URL path components, which is exactly how a request
    // for `/s/abc/../../../etc/passwd` arrives.
    expect(serveFromDirectory(fixture(), ['..', '..', 'etc', 'passwd']).status).toBe(403);
    expect(serveFromDirectory(fixture(), ['%2e%2e', 'secret']).status).toBe(403);
  });

  it('404s on a missing file', () => {
    expect(serveFromDirectory(fixture(), ['nope.html']).status).toBe(404);
  });

  it('will not let a generated page be framed elsewhere', () => {
    const response = serveFromDirectory(fixture(), []);
    expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });
});
