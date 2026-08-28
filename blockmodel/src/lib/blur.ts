// Best-effort blur detection, client-side. We downscale each photo to a small
// canvas, convert to grayscale, run a 3x3 Laplacian, and take the variance of
// the response. Low variance ≈ few sharp edges ≈ likely blurry.
//
// This is a rough heuristic, not science — it only *flags* photos for a second
// look. Time-boxed and wrapped so it can never block or crash the uploader.

const SAMPLE_WIDTH = 256;

// Below this variance we call a photo "possibly blurry". Tuned to be lenient so
// we don't cry wolf on legitimately soft-but-usable shots.
export const BLUR_THRESHOLD = 120;

export async function laplacianVariance(file: File): Promise<number | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = SAMPLE_WIDTH / bitmap.width;
    const w = SAMPLE_WIDTH;
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const { data } = ctx.getImageData(0, 0, w, h);

    // Grayscale buffer.
    const gray = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    }

    // 3x3 Laplacian kernel: center 4, edges -1 (corners 0).
    let sum = 0;
    let sumSq = 0;
    let n = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
        sum += lap;
        sumSq += lap * lap;
        n++;
      }
    }
    if (n === 0) return null;
    const mean = sum / n;
    return sumSq / n - mean * mean; // variance
  } catch {
    return null; // unsupported format (e.g. some HEIC) — silently skip
  }
}
