import Phaser from 'phaser';

/**
 * Runtime hue rotation, as cached texture variants.
 *
 * Phaser's `setTint` multiplies a colour; it cannot rotate one's hue, so a
 * tint can darken but never turn a blue shirt green. The honest options are a
 * custom render pipeline or recolouring the pixels once and caching the
 * result. This does the latter: unlimited colour variants from one source
 * sheet, at the cost of a few kilobytes of texture per distinct angle.
 *
 * Variants are cached by `<sourceKey>@<degrees>`, so a crowd of forty citizens
 * sharing eight angles costs eight textures, not forty.
 */
export function hueShiftedTexture(
  scene: Phaser.Scene,
  sourceKey: string,
  degrees: number,
  frameConfig?: { frameWidth: number; frameHeight: number },
): string {
  const normalised = ((Math.round(degrees) % 360) + 360) % 360;
  if (normalised === 0) return sourceKey;

  const key = `${sourceKey}@${normalised}`;
  if (scene.textures.exists(key)) return key;

  const source = scene.textures.get(sourceKey).getSourceImage() as HTMLImageElement;
  const { width, height } = source;

  const canvasTexture = scene.textures.createCanvas(key, width, height);
  if (!canvasTexture) return sourceKey; // canvas unavailable; degrade to source

  const ctx = canvasTexture.getContext();
  ctx.drawImage(source, 0, 0);

  const image = ctx.getImageData(0, 0, width, height);
  rotateHueInPlace(image.data, normalised);
  ctx.putImageData(image, 0, 0);
  canvasTexture.refresh();

  // Re-register the frame grid, or the copy is one undivided image.
  if (frameConfig) {
    const { frameWidth, frameHeight } = frameConfig;
    const cols = Math.floor(width / frameWidth);
    const rows = Math.floor(height / frameHeight);
    for (let i = 0; i < cols * rows; i++) {
      canvasTexture.add(
        i,
        0,
        (i % cols) * frameWidth,
        Math.floor(i / cols) * frameHeight,
        frameWidth,
        frameHeight,
      );
    }
  }

  return key;
}

/** Rotate every pixel's hue, preserving saturation, lightness and alpha. */
function rotateHueInPlace(data: Uint8ClampedArray, degrees: number): void {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue; // fully transparent: nothing to rotate

    const [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    const [r, g, b] = hslToRgb((h + degrees / 360) % 1, s, l);
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (max === min) return [0, 0, l]; // grey: hue is undefined, leave it alone

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;

  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number): number => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  return [
    Math.round(channel(h + 1 / 3) * 255),
    Math.round(channel(h) * 255),
    Math.round(channel(h - 1 / 3) * 255),
  ];
}
