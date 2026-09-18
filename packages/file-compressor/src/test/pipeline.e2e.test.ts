/**
 * End to end, on a real document, through the real modules.
 *
 * This is the smallest useful version of the harness PRD §8 asks for: build a
 * document whose properties we know, run the pipeline over it, and assert the
 * invariants that must never break — the file opens, the page count holds, the
 * text still extracts identically, no page falls below the mode's floor, and
 * the output is actually smaller.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { installBrowserShims } from "./support/browser-shims";
import { buildFixture } from "../../scripts/fixture.mjs";
import { analyseDocument, evaluateGate, runJob } from "@/core/pipeline";
import { defaultOptions, MODES } from "@/core/modes";

let fixture: Uint8Array;

beforeAll(async () => {
  installBrowserShims();
  fixture = await buildFixture({ pages: 2 });
}, 60_000);

describe("analysis", () => {
  it("attributes the bytes and finds the placement DPI", async () => {
    const inventory = await analyseDocument(fixture);

    expect(inventory.pageCount).toBe(2);
    expect(inventory.images).toHaveLength(1);
    // The image is drawn twice per page, at 600 and 300 DPI. The larger
    // placement is the one the output has to satisfy (FR-5.2).
    expect(inventory.images[0].effectiveDpi).toBeGreaterThan(550);
    expect(inventory.images[0].effectiveDpi).toBeLessThan(650);
    expect(inventory.images[0].pages).toEqual([0, 1]);

    // Images dominate this file, and the budget should say so.
    expect(inventory.budget.images).toBeGreaterThan(inventory.budget.total * 0.5);
    expect(inventory.refusals).toHaveLength(0);
    expect(inventory.estimates.aggressive.high).toBeGreaterThan(inventory.estimates.lossless.high);
  });
});

describe("a full job", () => {
  it("shrinks the file without breaking it, and holds the floor", async () => {
    const options = defaultOptions("balanced");
    const outcome = await runJob(fixture, options);
    const result = outcome.primary;

    expect(result.outputBytes).toBeLessThan(result.inputBytes);
    expect(result.validation.opens).toBe(true);
    expect(result.validation.pageCountMatches).toBe(true);
    expect(result.validation.rendersAllPages).toBe(true);
    // FR-6.2 — the check a pixel diff cannot make.
    expect(result.validation.textExtractionMatches).toBe(true);

    expect(result.pageScores).toHaveLength(2);
    for (const score of result.pageScores) {
      expect(score).toBeGreaterThanOrEqual(MODES.balanced.pageFloor);
    }

    // The image was stored at ~600 DPI and Balanced caps at 200: the early exit
    // should have taken it down rather than searching quality first.
    const image = result.images[0];
    expect(image.action).toBe("downsampled");
    expect(image.toDpi).toBeLessThanOrEqual(MODES.balanced.dpiCeiling + 1);
    expect(image.afterBytes).toBeLessThan(image.beforeBytes);
    expect(image.score).toBeGreaterThanOrEqual(MODES.balanced.imageFloor);
  }, 180_000);

  it("re-running on its own output finds nothing left to take", async () => {
    // The "is it actually smaller" clause in FR-5.4 is what makes this true. A
    // compressor that fails it will happily re-encode its own output forever.
    const first = await runJob(fixture, defaultOptions("balanced"));
    const second = await runJob(first.primary.bytes, defaultOptions("balanced"));
    expect(second.primary.outputBytes).toBeLessThanOrEqual(first.primary.outputBytes * 1.02);
  }, 240_000);

  it("never re-encodes an image in Lossless mode, and still saves bytes", async () => {
    const outcome = await runJob(fixture, defaultOptions("lossless"));
    expect(outcome.primary.images).toHaveLength(0);
    expect(outcome.primary.outputBytes).toBeLessThan(outcome.primary.inputBytes);
    expect(outcome.primary.validation.textExtractionMatches).toBe(true);
  }, 120_000);
});

describe("the disclosure gate", () => {
  const base = defaultOptions("aggressive");

  it("does not fire on an ordinary saving with no measured loss", () => {
    const gate = evaluateGate({ ratio: 0.42, pageScores: [96, 97] } as never, base);
    expect(gate.fired).toBe(false);
  });

  it("gives the confident notice when a huge saving cost nothing", () => {
    const gate = evaluateGate({ ratio: 0.9, pageScores: [95, 94] } as never, base);
    expect(gate.branch).toBe("confident");
    expect(gate.reason).toBe("ratio");
  });

  it("blocks when a page dropped below visual losslessness, whatever the ratio", () => {
    // FR-6.2 — a 60% reduction that wrecked one page deserves the interruption.
    const gate = evaluateGate({ ratio: 0.6, pageScores: [96, 71] } as never, base);
    expect(gate.branch).toBe("choice");
    expect(gate.reason).toBe("page-score");
    expect(gate.pagesBelowVisuallyLossless).toEqual([1]);
  });
});
