import type { Mode, ModeId, CompressOptions } from "./types";

/**
 * PRD §4. The floors are the product; everything else is plumbing around them.
 *
 * The numbers are on the SSIMULACRA2 scale (90 = threshold of visual
 * losslessness, 70 = differences findable only on close inspection). See
 * `core/quality/score.ts` for what we actually compute in the browser and why
 * the floors are carried over rather than re-derived.
 */
export const MODES: Record<ModeId, Mode> = {
  lossless: {
    id: "lossless",
    label: "Lossless",
    imageFloor: 100,
    pageFloor: 100,
    dpiCeiling: Infinity,
    lossy: false,
    blurb: "No image is re-encoded. Structure, fonts and streams only. For legal, medical and archival work.",
  },
  "visually-lossless": {
    id: "visually-lossless",
    label: "Visually Lossless",
    imageFloor: 90,
    pageFloor: 92,
    dpiCeiling: 300,
    lossy: true,
    blurb: "Compressed until a page is about to show a visible difference, then stepped back. The default for documents with photos.",
  },
  balanced: {
    id: "balanced",
    label: "Balanced",
    imageFloor: 78,
    pageFloor: 82,
    dpiCeiling: 200,
    lossy: true,
    blurb: "Differences findable on close inspection. Sized for email attachments and sharing.",
  },
  aggressive: {
    id: "aggressive",
    label: "Aggressive",
    imageFloor: 62,
    pageFloor: 68,
    dpiCeiling: 150,
    lossy: true,
    blurb: "Visible softening when zoomed past 100%. For bulk scan intake and archive hygiene.",
  },
};

export const MODE_ORDER: ModeId[] = ["lossless", "visually-lossless", "balanced", "aggressive"];

/** The conservative alternative offered whenever the gate fires (FR-6.4). */
export const SAFER_MODE: ModeId = "visually-lossless";

export function defaultOptions(mode: ModeId): CompressOptions {
  return {
    mode,
    strip: {
      thumbnails: true,
      javascript: false,
      embeddedFiles: false,
      // Interactive default: strip author/producer/creation host, and say so on
      // the results screen (FR-12.3).
      metadata: true,
    },
    gateThreshold: 0.8,
    policy: "prompt",
    fastMode: false,
    dropConformance: false,
  };
}

/** Images below this many bytes are left alone — searching costs more than it saves (FR-5.3). */
export const TINY_IMAGE_BYTES = 4096;

/**
 * Score below which a page counts as "lost something visible", independent of
 * mode. FR-6.2 fires the blocking branch on this even when the ratio is small.
 */
export const VISUALLY_LOSSLESS_FLOOR = 90;
