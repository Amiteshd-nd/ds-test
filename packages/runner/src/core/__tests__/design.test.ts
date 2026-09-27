import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { PALETTES, PALETTE_NAMES, TYPE_NAMES } from '../design/palettes.ts';

/**
 * The palettes exist twice: as CSS custom properties in the landing template,
 * and as TypeScript here for the deck renderer and the PPTX writer. A
 * stylesheet cannot be imported into either, so the duplication is unavoidable
 * and the drift is not.
 *
 * These tests read the template's actual CSS. If someone adds a palette on one
 * side, or nudges a hex value, this is what says so.
 */
const CSS = readFileSync(
  path.join(process.cwd(), 'templates', 'landing', 'src', 'styles', 'global.css'),
  'utf8',
);

/** Only the light blocks: the dark ones live inside a prefers-color-scheme media query. */
function lightBlocks(css: string): string {
  const dark = css.indexOf('@media (prefers-color-scheme: dark)');
  return dark === -1 ? css : css.slice(0, dark);
}

function cssPalette(name: string): Record<string, string> | null {
  const css = lightBlocks(CSS);
  // `forest` is the :root default rather than an attribute block.
  const selector = name === 'forest' ? ':root' : `[data-palette='${name}']`;
  const start = css.indexOf(selector + ' {');
  if (start === -1) return null;

  const body = css.slice(start, css.indexOf('}', start));
  const values: Record<string, string> = {};
  for (const match of body.matchAll(/--p-([a-z-]+):\s*(#[0-9a-f]{6})/gi)) {
    values[match[1]] = match[2].toLowerCase();
  }
  return values;
}

describe('the palettes match the template', () => {
  it('has the same set of names', () => {
    const inCss = new Set(
      [...lightBlocks(CSS).matchAll(/\[data-palette='([a-z]+)'\]/g)].map((m) => m[1]),
    );
    inCss.add('forest'); // the :root default
    expect([...inCss].sort()).toEqual([...PALETTE_NAMES].sort());
  });

  it.each(PALETTE_NAMES)('%s has the same values in both', (name) => {
    const css = cssPalette(name);
    expect(css, `no CSS block for ${name}`).not.toBeNull();

    const ts = PALETTES[name];
    expect(css!.bg).toBe(ts.bg.toLowerCase());
    expect(css!.ink).toBe(ts.ink.toLowerCase());
    expect(css!.accent).toBe(ts.accent.toLowerCase());
    expect(css!.muted).toBe(ts.muted.toLowerCase());
    expect(css!.line).toBe(ts.line.toLowerCase());
    expect(css!['on-accent']).toBe(ts.onAccent.toLowerCase());
  });

  it('has the same type pairings', () => {
    const inCss = new Set([...CSS.matchAll(/\[data-type='([a-z]+)'\]/g)].map((m) => m[1]));
    inCss.add('grotesk'); // the :root default
    expect([...inCss].sort()).toEqual([...TYPE_NAMES].sort());
  });
});
