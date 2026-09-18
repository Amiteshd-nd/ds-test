import { describe, expect, it } from "vitest";
import { PDFDict, PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { deduplicate, garbageCollect, recompressStreams } from "@/core/pdf/structural";
import { loadDocument } from "@/core/pdf/inventory";

async function documentWithJunk(): Promise<PDFDocument> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([200, 200]);
  page.drawText("hello");

  // An object nothing references — the residue an incremental save leaves.
  const orphanDict = doc.context.obj({}) as PDFDict;
  orphanDict.set(PDFName.of("Junk"), doc.context.obj("Yes"));
  doc.context.register(PDFRawStream.of(orphanDict, new Uint8Array(4096).fill(7)));

  return doc;
}

describe("structural optimisation", () => {
  it("collects objects unreachable from the catalog (FR-2.1)", async () => {
    const doc = await documentWithJunk();
    const before = doc.context.enumerateIndirectObjects().length;
    const collected = garbageCollect(doc);
    expect(collected).toBeGreaterThan(0);
    expect(doc.context.enumerateIndirectObjects().length).toBe(before - collected);
    // The document still saves and re-opens.
    const bytes = await doc.save({ useObjectStreams: true });
    await expect(loadDocument(bytes)).resolves.toBeDefined();
  });

  it("collapses byte-identical objects onto one reference (FR-2.2)", async () => {
    const doc = await PDFDocument.create();
    const payload = new Uint8Array(2048).fill(3);
    const makeStream = () => {
      const dict = doc.context.obj({}) as PDFDict;
      dict.set(PDFName.of("Subtype"), PDFName.of("Thing"));
      return doc.context.register(PDFRawStream.of(dict, payload));
    };
    const first = makeStream();
    const second = makeStream();

    // Reference both so the garbage collector cannot claim them instead.
    const page = doc.addPage([100, 100]);
    page.node.set(PDFName.of("A"), first);
    page.node.set(PDFName.of("B"), second);

    const merged = deduplicate(doc);
    expect(merged).toBeGreaterThanOrEqual(1);
    expect(page.node.get(PDFName.of("A"))).toBe(page.node.get(PDFName.of("B")));
  });

  it("re-deflates poorly compressed streams and never grows one (FR-2.4)", async () => {
    const doc = await PDFDocument.create();
    const dict = doc.context.obj({}) as PDFDict;
    const compressible = new Uint8Array(8192).fill(65);
    const ref = doc.context.register(PDFRawStream.of(dict, compressible));
    doc.addPage([10, 10]).node.set(PDFName.of("Blob"), ref);

    const { streams, bytes } = recompressStreams(doc);
    expect(streams).toBe(1);
    expect(bytes).toBeGreaterThan(7000);

    const after = doc.context.lookup(ref);
    expect(after).toBeInstanceOf(PDFRawStream);
    expect((after as PDFRawStream).contents.length).toBeLessThan(compressible.length);
  });

  it("leaves image streams to stage 5", async () => {
    const doc = await PDFDocument.create();
    const dict = doc.context.obj({}) as PDFDict;
    dict.set(PDFName.of("Subtype"), PDFName.of("Image"));
    const ref = doc.context.register(PDFRawStream.of(dict, new Uint8Array(8192).fill(65)));
    doc.addPage([10, 10]).node.set(PDFName.of("Img"), ref);

    expect(recompressStreams(doc).streams).toBe(0);
  });
});
