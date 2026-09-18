import { describe, expect, it } from "vitest";
import { scoreRgba, type PixelPlane } from "@/core/quality/score";

function plane(width: number, height: number, fill: (x: number, y: number) => [number, number, number]): PixelPlane {
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

const gradient = (x: number, y: number): [number, number, number] => [(x * 3) % 256, (y * 5) % 256, (x + y) % 256];

describe("perceptual score", () => {
  it("gives an identical image a perfect score", () => {
    const a = plane(64, 64, gradient);
    const b = plane(64, 64, gradient);
    expect(scoreRgba(a, b).score).toBeCloseTo(100, 5);
  });

  it("falls monotonically as damage increases", () => {
    const reference = plane(64, 64, gradient);
    const scores = [2, 8, 24, 64].map((amplitude) => {
      const damaged = plane(64, 64, (x, y) => {
        const [r, g, b] = gradient(x, y);
        const noise = ((x * 7 + y * 13) % 2 === 0 ? 1 : -1) * amplitude;
        return [r + noise, g + noise, b + noise];
      });
      return scoreRgba(reference, damaged).score;
    });
    for (let i = 1; i < scores.length; i += 1) {
      expect(scores[i]).toBeLessThan(scores[i - 1]);
    }
  });

  it("points at the region that actually changed", () => {
    const reference = plane(128, 128, () => [200, 200, 200]);
    const damaged = plane(128, 128, (x, y) => (x > 96 && y > 96 ? [0, 0, 0] : [200, 200, 200]));
    const detail = scoreRgba(reference, damaged);
    expect(detail.worst).not.toBeNull();
    expect(detail.worst!.x).toBeGreaterThan(64);
    expect(detail.worst!.y).toBeGreaterThan(64);
  });

  it("refuses to compare images of different sizes rather than guessing", () => {
    expect(() => scoreRgba(plane(8, 8, gradient), plane(16, 16, gradient))).toThrow(/dimension mismatch/);
  });
});
