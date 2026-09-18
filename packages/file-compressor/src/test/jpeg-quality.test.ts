import { describe, expect, it } from "vitest";
import { estimateJpegQuality } from "@/core/pdf/images";

const STANDARD_LUMA = [
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51,
  87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101,
  72, 92, 95, 98, 112, 100, 103, 99,
];

/** Build a minimal JPEG header whose DQT holds libjpeg's table for `quality`. */
function jpegWithQuality(quality: number): Uint8Array {
  const scale = quality < 50 ? 5000 / quality : 200 - 2 * quality;
  const table = STANDARD_LUMA.map((value) => Math.max(1, Math.min(255, Math.floor((value * scale + 50) / 100))));
  const segment = [0xff, 0xdb, 0x00, 0x43, 0x00, ...table];
  return new Uint8Array([0xff, 0xd8, ...segment, 0xff, 0xda, 0x00, 0x02]);
}

describe("existing JPEG quality detection (FR-5.6)", () => {
  it("recovers the quality a JPEG was written at", () => {
    for (const quality of [40, 60, 75, 85, 92]) {
      expect(Math.abs(estimateJpegQuality(jpegWithQuality(quality))! - quality)).toBeLessThanOrEqual(2);
    }
  });

  it("returns null when there is no quantisation table to read", () => {
    expect(estimateJpegQuality(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02]))).toBeNull();
  });
});
