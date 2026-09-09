import { rgba, TRANSPARENT } from './palette.mjs';

/**
 * A small RGBA pixel buffer with the primitives pixel art actually needs.
 *
 * Everything is integer-addressed and every colour comes from the palette, so
 * no anti-aliasing or gradient can leak in. The output is by construction the
 * low-colour-count art the renderer is configured for.
 */
export class Canvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.data = Buffer.alloc(width * height * 4); // starts fully transparent
  }

  set(x, y, color) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const px = color === null ? TRANSPARENT : rgba(color);
    const i = (y * this.width + x) * 4;
    this.data[i] = px[0]; this.data[i + 1] = px[1];
    this.data[i + 2] = px[2]; this.data[i + 3] = px[3];
  }

  rect(x, y, w, h, color) {
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) this.set(x + dx, y + dy, color);
  }

  outline(x, y, w, h, color) {
    for (let dx = 0; dx < w; dx++) { this.set(x + dx, y, color); this.set(x + dx, y + h - 1, color); }
    for (let dy = 0; dy < h; dy++) { this.set(x, y + dy, color); this.set(x + w - 1, y + dy, color); }
  }

  hline(x, y, w, color) { for (let dx = 0; dx < w; dx++) this.set(x + dx, y, color); }
  vline(x, y, h, color) { for (let dy = 0; dy < h; dy++) this.set(x, y + dy, color); }

  /**
   * Deterministic value noise. Art generation must be reproducible — the same
   * script has to produce byte-identical PNGs, or every run dirties the repo.
   */
  static noise(x, y, seed = 0) {
    let n = (x * 374761393 + y * 668265263 + seed * 1274126177) >>> 0;
    n = ((n ^ (n >>> 13)) * 1274126177) >>> 0;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }

  /** Sparse speckle, for grain that does not read as a gradient. */
  speckle(x, y, w, h, color, density, seed = 0) {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        if (Canvas.noise(x + dx, y + dy, seed) < density) this.set(x + dx, y + dy, color);
      }
    }
  }

  /** Copy another canvas in at an offset, honouring transparency. */
  blit(src, ox, oy) {
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        const i = (y * src.width + x) * 4;
        if (src.data[i + 3] === 0) continue;
        const tx = ox + x, ty = oy + y;
        if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) continue;
        src.data.copy(this.data, (ty * this.width + tx) * 4, i, i + 4);
      }
    }
  }
}
