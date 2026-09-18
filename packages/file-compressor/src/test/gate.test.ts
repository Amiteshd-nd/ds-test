import { describe, expect, it } from "vitest";
import { searchQuality } from "@/core/search/gate";

/** A stand-in encoder: quality maps to a score and a size, both monotonic, the
 *  way a real codec behaves on a typical photo. */
function fakeEncoder(scoreAt: (quality: number) => number) {
  const tried: number[] = [];
  const encode = async (quality: number) => {
    tried.push(quality);
    return { artifact: quality, bytes: quality * 1000, score: scoreAt(quality), quality };
  };
  return { encode, tried };
}

describe("the quality gate search", () => {
  it("never returns a candidate below the floor", async () => {
    const { encode } = fakeEncoder((q) => q); // score == quality
    const result = await searchQuality({ floor: 80, seed: 60, min: 30, max: 95, encode });
    expect(result.best).not.toBeNull();
    expect(result.best!.score).toBeGreaterThanOrEqual(80);
  });

  it("returns nothing when nothing clears the floor", async () => {
    const { encode } = fakeEncoder(() => 50);
    const result = await searchQuality({ floor: 90, seed: 70, min: 30, max: 95, encode });
    expect(result.best).toBeNull();
  });

  it("steps back to the smallest passing setting rather than keeping the first one", async () => {
    const { encode } = fakeEncoder((q) => q);
    const result = await searchQuality({ floor: 70, seed: 95, min: 30, max: 95, tolerance: 1, encode });
    expect(result.best!.quality).toBeLessThan(95);
    expect(result.best!.score).toBeGreaterThanOrEqual(70);
  });

  it("reaches the answer in two or three cycles on a typical image", async () => {
    // PRD §4: the seed exists to keep the common case at 2–3 encode-and-score
    // cycles rather than the 6–7 a naive binary search costs.
    const { encode, tried } = fakeEncoder((q) => q);
    const result = await searchQuality({ floor: 78, seed: 80, min: 30, max: 95, encode });
    expect(result.iterations).toBeLessThanOrEqual(3);
    expect(tried[0]).toBe(80);
  });

  it("fast mode verifies the prediction once and never searches", async () => {
    const { encode, tried } = fakeEncoder((q) => q);
    const passing = await searchQuality({ floor: 60, seed: 75, min: 30, max: 95, fast: true, encode });
    expect(tried).toEqual([75]);
    expect(passing.best).not.toBeNull();

    // A prediction that missed is still rejected — fast mode skips the search,
    // not the gate.
    const failing = await searchQuality({ floor: 90, seed: 75, min: 30, max: 95, fast: true, encode });
    expect(failing.best).toBeNull();
  });
});
