// A real water surface: a height field stepped with the 2D wave equation, then
// shaded twice — once as refraction (slope bends what is behind the water) and
// once as specular + caustic light (crests catch the light, troughs focus it).
//
// Why a simulation rather than expanding CSS rings: rings can't interfere,
// can't reflect, can't disperse. Here a click displaces water, the depression
// rebounds, and the wave train that leaves it behaves on its own — two clicks
// cross and cancel, a drag leaves a V-wake, everything decays to still water.

/** CSS pixels per simulation cell. Small enough to read as smooth water once upscaled. */
const CELL = 4;
/** Cell budget, so a 5K display costs the same per frame as a laptop. */
const MAX_CELLS = 70_000;
/** Courant number c²Δt²/Δx². The scheme goes unstable above 0.5; 0.36 keeps a margin and stays quiet. */
const COURANT = 0.36;
/** Energy kept per step — this is what makes ripples die out instead of ringing forever. */
const DAMPING = 0.9855;
/** Absorbing margin, in cells. Without it waves bounce off the viewport and it reads as a box. */
const SPONGE = 16;
/** Below this peak amplitude the surface is flat enough to stop drawing and idle the loop. */
const REST = 0.004;
/** Fixed simulation step. Decoupled from the display so 120Hz screens don't run fast water. */
const STEP_MS = 1000 / 60;
const MAX_STEPS_PER_FRAME = 3;

/** Slope → light/dark swing of the refraction pass. Higher reads as deeper water. */
const REFRACT_GAIN = 620;
/** Soft knee for that swing. Both passes roll off instead of clipping, or the impact
    flattens into a white disc and the wavefronts behind it lose all their shape. */
const REFRACT_KNEE = 112;
/** Red and blue refract by slightly different amounts, the way real water splits light. */
const DISPERSION = 0.1;
/** Slope → surface normal tilt, for the lighting passes. */
const NORMAL_GAIN = 9;
const SPEC_EXPONENT = 44;
const SPEC_GAIN = 1.6;
const CAUSTIC_GAIN = 30;

// Light from the upper left, view straight on: H = normalize(L + (0,0,1)).
const HX = -0.3467;
const HY = -0.4907;
const HZ = 0.7995;

type Rgb = [number, number, number];

function parseHex(value: string): Rgb | null {
  const match = /^#([\da-fA-F]{6})$/.exec(value.trim());
  if (!match) return null;
  const int = parseInt(match[1], 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function luminance([r, g, b]: Rgb) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Highlights borrow the palette's brightest stop so the water belongs to the active study. */
function highlightFrom(colors: string[]): Rgb {
  const parsed = colors.map(parseHex).filter((rgb): rgb is Rgb => rgb !== null);
  if (!parsed.length) return [255, 255, 255];
  const brightest = parsed.reduce((best, rgb) => (luminance(rgb) > luminance(best) ? rgb : best));
  // Pulled most of the way to white: sunlight on water is white with a hint of the water's colour.
  return [
    Math.round(brightest[0] * 0.34 + 255 * 0.66),
    Math.round(brightest[1] * 0.34 + 255 * 0.66),
    Math.round(brightest[2] * 0.34 + 255 * 0.66),
  ];
}

export type SplashKind = 'tap' | 'drag';

export class WaterSurface {
  private readonly refractCtx: CanvasRenderingContext2D;
  private readonly specCtx: CanvasRenderingContext2D;

  private cols = 0;
  private rows = 0;
  /** Height fields: `cur` is now, `prev` is one step ago — their difference is velocity. */
  private cur = new Float32Array(0);
  private prev = new Float32Array(0);
  private next = new Float32Array(0);
  /** Per-cell edge absorption, precomputed once per resize. */
  private sponge = new Float32Array(0);

  private refractImage: ImageData | null = null;
  private specImage: ImageData | null = null;

  private highlight: Rgb = [255, 255, 255];
  private frame = 0;
  private lastTime = 0;
  private carry = 0;
  private asleep = true;
  private destroyed = false;

  constructor(refract: HTMLCanvasElement, spec: HTMLCanvasElement) {
    const refractCtx = refract.getContext('2d', { alpha: true });
    const specCtx = spec.getContext('2d', { alpha: true });
    if (!refractCtx || !specCtx) throw new Error('2D canvas context unavailable');
    this.refractCtx = refractCtx;
    this.specCtx = specCtx;
  }

  /** Rebuild the grid for a new viewport size. Water resets — it has no meaning at another size. */
  resize(width: number, height: number) {
    if (this.destroyed || width <= 0 || height <= 0) return;

    const area = (width / CELL) * (height / CELL);
    const cell = area > MAX_CELLS ? CELL * Math.sqrt(area / MAX_CELLS) : CELL;
    const cols = Math.max(24, Math.floor(width / cell));
    const rows = Math.max(24, Math.floor(height / cell));
    if (cols === this.cols && rows === this.rows) return;

    this.cols = cols;
    this.rows = rows;
    const cells = cols * rows;
    this.cur = new Float32Array(cells);
    this.prev = new Float32Array(cells);
    this.next = new Float32Array(cells);
    this.sponge = new Float32Array(cells);

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        // Distance to the nearest edge, in cells, ramped smoothly across the sponge band.
        const edge = Math.min(x, y, cols - 1 - x, rows - 1 - y);
        const t = Math.min(1, edge / SPONGE);
        this.sponge[y * cols + x] = 0.86 + 0.14 * t * t;
      }
    }

    for (const canvas of [this.refractCtx.canvas, this.specCtx.canvas]) {
      canvas.width = cols;
      canvas.height = rows;
    }
    this.refractImage = this.refractCtx.createImageData(cols, rows);
    this.specImage = this.specCtx.createImageData(cols, rows);
    this.clear();
  }

  setPalette(colors: string[]) {
    this.highlight = highlightFrom(colors);
  }

  /**
   * Displace the surface at a point given in percentages of the viewport.
   * `strength` is roughly 0.4–1.5; a drag arrives as a stream of weak splashes.
   *
   * The impulse is a dented core inside a raised crown, and the crown carries exactly the
   * volume the core lost. That conservation is what makes the surface settle back to level:
   * the wave equation preserves the mean of the height field, so a bare dent would spread
   * into a permanent basin instead of ringing and dying like water.
   */
  splash(xPercent: number, yPercent: number, strength: number, kind: SplashKind = 'tap') {
    if (this.destroyed || !this.cols) return;

    const cx = (xPercent / 100) * (this.cols - 1);
    const cy = (yPercent / 100) * (this.rows - 1);
    // Drag drops are wider and shallower than a tap: they arrive a few frames apart, and
    // their wavelengths have to overlap into one wake instead of reading as separate rings.
    const core = kind === 'tap' ? 2.8 + strength * 3.6 : 3 + strength * 2.6;
    const crown = core * 2.15;
    const depth = (kind === 'tap' ? 0.8 : 0.17) * Math.min(1.6, strength);

    const minX = Math.max(1, Math.floor(cx - crown));
    const maxX = Math.min(this.cols - 2, Math.ceil(cx + crown));
    const minY = Math.max(1, Math.floor(cy - crown));
    const maxY = Math.min(this.rows - 2, Math.ceil(cy + crown));

    // First pass: the two profiles and their volumes.
    const cells: number[] = [];
    const weights: number[] = [];
    let coreVolume = 0;
    let crownVolume = 0;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const distance = Math.hypot(x - cx, y - cy);
        if (distance > crown) continue;
        // Cosine bell in the core, a smooth annulus outside it — no hard edges to ring on the grid.
        const weight =
          distance <= core
            ? -0.5 * (1 + Math.cos((Math.PI * distance) / core))
            : Math.sin((Math.PI * (distance - core)) / (crown - core));
        cells.push(y * this.cols + x);
        weights.push(weight);
        if (weight < 0) coreVolume -= weight;
        else crownVolume += weight;
      }
    }
    if (!crownVolume) return;

    // Second pass: scale the crown so the displaced volume balances exactly.
    const balance = coreVolume / crownVolume;
    for (let n = 0; n < cells.length; n++) {
      const i = cells[n];
      const weight = weights[n] < 0 ? weights[n] : weights[n] * balance;
      const delta = depth * weight;
      this.cur[i] += delta;
      // A shallower history means the impulse arrives already moving — the impact, not a static dent.
      this.prev[i] += delta * 0.78;
    }

    this.wake();
  }

  start() {
    this.wake();
  }

  /** Step and redraw `steps` times without the frame loop — for tuning and for panes that suspend rAF. */
  advance(steps = 1): number {
    let peak = 0;
    for (let i = 0; i < steps; i++) {
      this.step();
      peak = this.render();
    }
    return peak;
  }

  destroy() {
    this.destroyed = true;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  private wake() {
    if (this.destroyed || this.frame) return;
    this.asleep = false;
    this.lastTime = 0;
    this.carry = 0;
    this.frame = requestAnimationFrame(this.tick);
  }

  private readonly tick = (time: number) => {
    this.frame = 0;
    if (this.destroyed) return;

    const elapsed = this.lastTime ? Math.min(120, time - this.lastTime) : STEP_MS;
    this.lastTime = time;
    this.carry += elapsed;

    let steps = 0;
    while (this.carry >= STEP_MS && steps < MAX_STEPS_PER_FRAME) {
      this.step();
      this.carry -= STEP_MS;
      steps++;
    }
    if (this.carry > STEP_MS * MAX_STEPS_PER_FRAME) this.carry = 0;

    const peak = this.render();
    if (peak < REST) {
      // Still water: blank both passes once and stop burning frames until the next splash.
      this.clear();
      this.asleep = true;
      return;
    }
    this.frame = requestAnimationFrame(this.tick);
  };

  /** One wave-equation step: next = cur + (cur - prev)·damping + c²∇²cur, absorbed at the edges. */
  private step() {
    const { cols, rows, cur, prev, next, sponge } = this;
    for (let y = 1; y < rows - 1; y++) {
      const row = y * cols;
      for (let x = 1; x < cols - 1; x++) {
        const i = row + x;
        const laplacian = cur[i - 1] + cur[i + 1] + cur[i - cols] + cur[i + cols] - 4 * cur[i];
        next[i] = (cur[i] + (cur[i] - prev[i]) * DAMPING + laplacian * COURANT) * sponge[i];
      }
    }
    // next becomes the present; the old present becomes history. Buffers rotate, nothing allocates.
    this.prev = cur;
    this.cur = next;
    this.next = prev;
  }

  /** Shade both passes from the current height field. Returns the peak amplitude seen. */
  private render(): number {
    const { cols, rows, cur, refractImage, specImage, highlight } = this;
    if (!refractImage || !specImage) return 0;

    const refract = refractImage.data;
    const spec = specImage.data;
    const [hr, hg, hb] = highlight;
    const cols2 = cols * 2;
    let peak = 0;

    for (let y = 2; y < rows - 2; y++) {
      const row = y * cols;
      for (let x = 2; x < cols - 2; x++) {
        const i = row + x;
        const height = cur[i];
        const magnitude = height < 0 ? -height : height;
        if (magnitude > peak) peak = magnitude;

        // Gradient over a two-cell stencil. A bare central difference also picks up the
        // scheme's grid-scale checkerboard mode, which shades as a visible lattice; averaging
        // the near and far pairs cancels it while leaving real wavefronts intact.
        const gx = (cur[i - 1] - cur[i + 1]) * 0.66 + (cur[i - 2] - cur[i + 2]) * 0.17;
        const gy = (cur[i - cols] - cur[i + cols]) * 0.66 + (cur[i - cols2] - cur[i + cols2]) * 0.17;
        const p = i * 4;

        // --- refraction pass (overlay blend: mid grey is a no-op, so calm water is invisible) ---
        // Uint8ClampedArray does the clamping; the channel spread is the dispersion.
        const raw = (gx + gy) * REFRACT_GAIN;
        const bend = raw / (1 + (raw < 0 ? -raw : raw) / REFRACT_KNEE);
        refract[p] = 128 + bend * (1 + DISPERSION);
        refract[p + 1] = 128 + bend;
        refract[p + 2] = 128 + bend * (1 - DISPERSION);
        refract[p + 3] = 255;

        // --- light pass (screen blend: black is a no-op, highlights add) ---
        const nx = gx * NORMAL_GAIN;
        const ny = gy * NORMAL_GAIN;
        const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
        const facing = (nx * HX + ny * HY + HZ) * inv;
        const specular = facing > 0 ? Math.pow(facing, SPEC_EXPONENT) * SPEC_GAIN : 0;

        // Positive curvature is a trough focusing light — the bright rim inside a ripple.
        const curvature = cur[i - 1] + cur[i + 1] + cur[i - cols] + cur[i + cols] - 4 * height;
        const caustic = curvature > 0 ? curvature * CAUSTIC_GAIN : 0;

        // Reinhard-style roll-off: bright cores stay bright without becoming a flat plateau.
        const light = specular + caustic;
        const intensity = light / (1 + light);
        spec[p] = hr * intensity;
        spec[p + 1] = hg * intensity;
        spec[p + 2] = hb * intensity;
        spec[p + 3] = 255;
      }
    }

    this.refractCtx.putImageData(refractImage, 0, 0);
    this.specCtx.putImageData(specImage, 0, 0);
    return peak;
  }

  private clear() {
    if (!this.cols) return;
    this.refractCtx.clearRect(0, 0, this.cols, this.rows);
    this.specCtx.clearRect(0, 0, this.cols, this.rows);
    if (this.refractImage) this.refractImage.data.fill(0);
    if (this.specImage) this.specImage.data.fill(0);
  }

  get sleeping() {
    return this.asleep;
  }
}
