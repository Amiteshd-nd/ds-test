import { describe, expect, it } from "vitest";
import { classify, extractFeatures, seedQuality } from "@/core/quality/features";
import type { PixelPlane } from "@/core/quality/score";

function build(width: number, height: number, fill: (x: number, y: number) => [number, number, number]): PixelPlane {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = fill(x, y);
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

const BIG = 100_000;

describe("classification", () => {
  it("calls a scanned page bilevel even when it is stored as RGB", () => {
    // FR-5.1: classify on the pixels, not on the declared colour space.
    const scan = build(200, 200, (x, y) => (x % 17 === 0 || y % 23 === 0 ? [0, 0, 0] : [255, 255, 255]));
    expect(classify(extractFeatures(scan), BIG, 4096)).toBe("bilevel");
  });

  it("routes flat, few-colour line art away from the photo path", () => {
    const chart = build(200, 200, (x, y) => {
      if (y > 150) return [30, 90, 200];
      if (x > 150) return [220, 60, 60];
      return [250, 250, 250];
    });
    expect(classify(extractFeatures(chart), BIG, 4096)).toBe("indexed");
  });

  it("calls a busy continuous-tone image photographic", () => {
    const photo = build(200, 200, (x, y) => [
      (x * 7 + y * 3) % 256,
      (x * 3 + y * 11) % 256,
      (x * 13 + y * 5) % 256,
    ]);
    expect(classify(extractFeatures(photo), BIG, 4096)).toBe("photographic");
  });

  it("leaves images below the byte threshold alone", () => {
    const tiny = build(8, 8, () => [1, 2, 3]);
    expect(classify(extractFeatures(tiny), 100, 4096)).toBe("tiny");
  });
});

describe("seed model", () => {
  it("predicts a higher starting quality for a stricter floor", () => {
    const photo = build(64, 64, (x, y) => [(x * 7) % 256, (y * 5) % 256, (x + y) % 256]);
    const features = extractFeatures(photo);
    expect(seedQuality(features, 90)).toBeGreaterThan(seedQuality(features, 62));
  });

  it("stays inside the search bracket", () => {
    const flat = build(64, 64, () => [128, 128, 128]);
    for (const floor of [62, 78, 90]) {
      const q = seedQuality(extractFeatures(flat), floor);
      expect(q).toBeGreaterThanOrEqual(30);
      expect(q).toBeLessThanOrEqual(95);
    }
  });
});
