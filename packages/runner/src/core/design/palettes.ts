/**
 * The palettes and type pairings, in TypeScript.
 *
 * These are the same six families and four pairings the landing template
 * defines in `templates/landing/src/styles/global.css`. They are repeated here
 * because a deck is rendered by this package, not by Astro, and a stylesheet
 * cannot be imported into a PPTX writer.
 *
 * Repetition invites drift, so `src/core/__tests__/design.test.ts` parses the
 * template's CSS and fails if the two disagree on a name or a hex value. The
 * point of sharing them at all is that a business's deck should look like its
 * site: PRD section 6.6 lists brand colours and fonts as things the profile
 * remembers, and this is what remembering them is for.
 */

export type PaletteName = 'forest' | 'cobalt' | 'terracotta' | 'olive' | 'ink' | 'signal';
export type TypeName = 'grotesk' | 'warm' | 'character' | 'heritage';

export interface Palette {
  bg: string;
  surface: string;
  ink: string;
  muted: string;
  line: string;
  accent: string;
  onAccent: string;
}

/** Light values only. A deck is projected and printed; it does not have a dark mode. */
export const PALETTES: Record<PaletteName, Palette> = {
  forest: {
    bg: '#f7f6f1',
    surface: '#ffffff',
    ink: '#14201a',
    muted: '#5d6b63',
    line: '#dcdcd2',
    accent: '#1d6b45',
    onAccent: '#f7f6f1',
  },
  cobalt: {
    bg: '#f6f7f9',
    surface: '#ffffff',
    ink: '#14181f',
    muted: '#5a6472',
    line: '#d9dde3',
    accent: '#1b47c4',
    onAccent: '#f6f7f9',
  },
  terracotta: {
    bg: '#f5f5f4',
    surface: '#ffffff',
    ink: '#1c1a19',
    muted: '#6b6560',
    line: '#dedad6',
    accent: '#b8442a',
    onAccent: '#faf8f7',
  },
  olive: {
    bg: '#f4f4ef',
    surface: '#fbfbf8',
    ink: '#1e2018',
    muted: '#63685a',
    line: '#dcddd2',
    accent: '#9b3116',
    onAccent: '#f4f4ef',
  },
  ink: {
    bg: '#f4f3f1',
    surface: '#ffffff',
    ink: '#171614',
    muted: '#625f59',
    line: '#dbd9d4',
    accent: '#1f1e1c',
    onAccent: '#f4f3f1',
  },
  signal: {
    bg: '#f7f7f8',
    surface: '#ffffff',
    ink: '#131316',
    muted: '#5f5f67',
    line: '#dedee2',
    accent: '#0b7c6b',
    onAccent: '#f7f7f8',
  },
};

export interface TypePairing {
  /** CSS font-family stack, for the HTML render. */
  display: string;
  body: string;
  /**
   * What PowerPoint should ask for. PPTX embeds a font name, not a file, so a
   * machine without it substitutes - which is why these are the family names
   * and why each falls back to something every machine has.
   */
  pptxDisplay: string;
  pptxBody: string;
}

export const TYPE_PAIRINGS: Record<TypeName, TypePairing> = {
  grotesk: {
    display: "'Space Grotesk Variable', ui-sans-serif, system-ui, sans-serif",
    body: "'Archivo Variable', ui-sans-serif, system-ui, sans-serif",
    pptxDisplay: 'Space Grotesk',
    pptxBody: 'Archivo',
  },
  warm: {
    display: "'Outfit Variable', ui-sans-serif, system-ui, sans-serif",
    body: "'Instrument Sans Variable', ui-sans-serif, system-ui, sans-serif",
    pptxDisplay: 'Outfit',
    pptxBody: 'Instrument Sans',
  },
  character: {
    display: "'Bricolage Grotesque Variable', ui-sans-serif, system-ui, sans-serif",
    body: "'Archivo Variable', ui-sans-serif, system-ui, sans-serif",
    pptxDisplay: 'Bricolage Grotesque',
    pptxBody: 'Archivo',
  },
  heritage: {
    display: "'EB Garamond Variable', ui-serif, Georgia, serif",
    body: "'Archivo Variable', ui-sans-serif, system-ui, sans-serif",
    pptxDisplay: 'EB Garamond',
    pptxBody: 'Archivo',
  },
};

export const PALETTE_NAMES = Object.keys(PALETTES) as PaletteName[];
export const TYPE_NAMES = Object.keys(TYPE_PAIRINGS) as TypeName[];

/** PptxGenJS wants bare hex with no leading hash. */
export const hex = (value: string) => value.replace('#', '').toUpperCase();
