import { describe, expect, it } from "vitest";
import { formatBytes, formatPair, formatRatio, ratioOf } from "@/core/bytes";

describe("byte formatting", () => {
  it("states both sizes of a pair in the same unit", () => {
    // FR-6.5: "3.1 MB vs 8.9 MB", never "3.1 MB vs 8900 KB".
    const [small, large] = formatPair(3_100_000, 8_900_000);
    expect(small.endsWith("MB")).toBe(true);
    expect(large.endsWith("MB")).toBe(true);
  });

  it("keeps a tiny file legible next to a large one", () => {
    const [small, large] = formatPair(900, 12_000_000);
    expect(large.endsWith("MB")).toBe(true);
    expect(small).toBe("0.0 MB");
  });

  it("reports ratios as whole percentages of reduction", () => {
    expect(formatRatio(ratioOf(1000, 130))).toBe("87%");
    expect(formatBytes(0)).toBe("0 B");
  });
});
