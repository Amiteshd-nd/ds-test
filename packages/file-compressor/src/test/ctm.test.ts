import { describe, expect, it } from "vitest";
import { effectiveDpi, multiply, placedSize, tokenize, type Matrix } from "@/core/pdf/ctm";

const bytes = (text: string) => new Uint8Array([...text].map((c) => c.charCodeAt(0)));

describe("content stream tokenizer", () => {
  it("reads numbers, names and operators", () => {
    const tokens = [...tokenize(bytes("1 0 0 1 20.5 -3 cm /Im1 Do"))];
    const operators = tokens.filter((t) => t.kind === "operator").map((t) => t.value);
    expect(operators).toEqual(["cm", "Do"]);
    expect(tokens.find((t) => t.kind === "name")).toEqual({ kind: "name", value: "Im1" });
  });

  it("does not mistake string contents for operators", () => {
    const tokens = [...tokenize(bytes("(Q q cm Do) Tj"))];
    expect(tokens.filter((t) => t.kind === "operator").map((t) => t.value)).toEqual(["Tj"]);
  });

  it("skips inline image data, which is binary and full of false operators", () => {
    const stream = "BI /W 2 /H 2 ID QQQQ EI Q";
    const operators = [...tokenize(bytes(stream))].filter((t) => t.kind === "operator").map((t) => t.value);
    expect(operators).toEqual(["Q"]);
  });

  it("decodes #-escaped names", () => {
    const tokens = [...tokenize(bytes("/Im#201 Do"))];
    expect(tokens.find((t) => t.kind === "name")).toEqual({ kind: "name", value: "Im 1" });
  });
});

describe("effective DPI", () => {
  it("multiplies matrices in PDF order", () => {
    const scale: Matrix = [2, 0, 0, 2, 0, 0];
    const translate: Matrix = [1, 0, 0, 1, 10, 20];
    expect(multiply(scale, translate)).toEqual([2, 0, 0, 2, 10, 20]);
  });

  it("measures the placed size through rotation", () => {
    // A 90-degree rotation of a 144x72 box is still 144x72 on the page.
    const rotated: Matrix = [0, 144, -72, 0, 0, 0];
    const { widthPt, heightPt } = placedSize(rotated);
    expect(widthPt).toBeCloseTo(144);
    expect(heightPt).toBeCloseTo(72);
  });

  it("turns pixels over points into DPI", () => {
    // 600 pixels drawn across 72 points (one inch) is 600 DPI.
    expect(effectiveDpi(600, 72)).toBeCloseTo(600);
    expect(effectiveDpi(600, 0)).toBeNull();
  });
});
