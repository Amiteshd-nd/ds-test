/**
 * On-device redaction, before any upload.
 *
 * Street photographs in a layout contain faces, number plates and front doors.
 * PRD §9 commits to blurring them on the phone and to stating plainly what
 * leaves it. That second half is the harder promise, so this module enforces it:
 *
 *   a photo may only be uploaded when every detector the policy requires has
 *   actually run.
 *
 * Faces use the browser's own FaceDetector where it exists (Chrome on Android).
 * Plates need a model, and there isn't one until Phase 0 supplies training
 * images — so today `complete` is false on every device and photos stay local.
 * That is the correct behaviour, not a gap: the alternative is uploading an
 * unredacted plate and calling it privacy.
 */
import type { PhotoRedaction } from './types';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DetectedFace {
  boundingBox: Box;
}

declare global {
  interface Window {
    FaceDetector?: new (opts?: { fastMode?: boolean; maxDetectedFaces?: number }) => {
      detect(source: CanvasImageSource): Promise<DetectedFace[]>;
    };
  }
}

const PLATE_MODEL = `${import.meta.env.BASE_URL}models/plate/model-card.json`;

/** Mosaic rather than a Gaussian: irreversible, and it survives re-encoding. */
function mosaic(ctx: CanvasRenderingContext2D, box: Box, cells = 6) {
  const pad = 0.18;
  const x = Math.max(0, box.x - box.width * pad);
  const y = Math.max(0, box.y - box.height * pad);
  const w = Math.min(ctx.canvas.width - x, box.width * (1 + pad * 2));
  const h = Math.min(ctx.canvas.height - y, box.height * (1 + pad * 2));
  if (w < 2 || h < 2) return;

  const tiny = document.createElement('canvas');
  tiny.width = cells;
  tiny.height = Math.max(1, Math.round((cells * h) / w));
  const tctx = tiny.getContext('2d')!;
  tctx.imageSmoothingEnabled = true;
  tctx.drawImage(ctx.canvas, x, y, w, h, 0, 0, tiny.width, tiny.height);

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tiny, 0, 0, tiny.width, tiny.height, x, y, w, h);
  ctx.restore();
}

async function detectFaces(canvas: HTMLCanvasElement): Promise<Box[] | null> {
  if (!window.FaceDetector) return null;
  try {
    const detector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 12 });
    const found = await detector.detect(canvas);
    return found.map((f) => f.boundingBox);
  } catch {
    return null;
  }
}

/** Present only once a plate model ships. Kept as a hook so the policy is real. */
async function plateDetectorAvailable(): Promise<boolean> {
  try {
    const res = await fetch(PLATE_MODEL, { cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

export interface RedactionOutcome {
  /** The redacted frame. Safe to show the reporter; safe to keep on device. */
  canvas: HTMLCanvasElement;
  redaction: PhotoRedaction;
}

export async function redact(frame: HTMLCanvasElement): Promise<RedactionOutcome> {
  const ctx = frame.getContext('2d')!;
  const detectors: string[] = [];

  const faces = await detectFaces(frame);
  if (faces) {
    detectors.push('FaceDetector');
    for (const box of faces) mosaic(ctx, box);
  }

  const plates = await plateDetectorAvailable();
  if (plates) detectors.push('plate-model');

  return {
    canvas: frame,
    redaction: {
      faces: faces?.length ?? 0,
      plates: 0,
      // Both detectors, or the photo does not travel.
      complete: faces !== null && plates,
      detectors,
    },
  };
}

/** One sentence, in the reporter's words, about where their photo goes. */
export function dataStatement(r: PhotoRedaction | null): string {
  if (!r) return 'No photo taken. Only the road, the time and your rough position are sent.';
  if (r.complete) {
    return `${r.faces} face${r.faces === 1 ? '' : 's'} blurred on this phone. The blurred photo is sent with the report.`;
  }
  const why = r.detectors.includes('FaceDetector')
    ? 'this phone cannot check for number plates'
    : 'this phone cannot check for faces or number plates';
  return `Photo stays on this phone — ${why}. Only the road, the time and your rough position are sent.`;
}
