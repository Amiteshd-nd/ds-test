import { describe, expect, it } from "vitest";
import { PDFDict, PDFDocument, PDFName, PDFRawStream, PDFStream } from "pdf-lib";
import { zlibSync } from "fflate";
import { strip } from "@/core/pdf/strip";
import { streamBytes } from "@/core/pdf/ctm";
import { defaultOptions } from "@/core/modes";
import type { TriageFlags } from "@/core/types";

const XMP = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/" xmlns:xmp="http://ns.adobe.com/xap/1.0/">
   <dc:title>Quarterly report</dc:title>
   <dc:creator>Jordan Fielding</dc:creator>
   <pdf:Producer>Acme Publisher 9.1 on studio-imac</pdf:Producer>
   <xmp:CreatorTool>Acme Layout</xmp:CreatorTool>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>`;

const FLAGS: TriageFlags = {
  encrypted: false,
  signed: false,
  linearized: false,
  conformance: null,
  hasAcroForm: false,
  hasVariableTextFields: false,
  hasJavaScript: true,
  hasEmbeddedFiles: false,
  hasTaggedStructure: false,
};

async function documentWithMetadata() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([200, 200]);
  page.node.set(PDFName.of("Thumb"), doc.context.register(PDFRawStream.of(doc.context.obj({}) as PDFDict, new Uint8Array(512))));

  const info = doc.context.lookup(doc.context.trailerInfo.Info) as PDFDict;
  info.set(PDFName.of("Author"), doc.context.obj("Jordan Fielding"));
  info.set(PDFName.of("Title"), doc.context.obj("Quarterly report"));

  const xmpDict = doc.context.obj({}) as PDFDict;
  xmpDict.set(PDFName.of("Type"), PDFName.of("Metadata"));
  xmpDict.set(PDFName.of("Subtype"), PDFName.of("XML"));
  xmpDict.set(PDFName.of("Filter"), PDFName.of("FlateDecode"));
  const bytes = zlibSync(new TextEncoder().encode(XMP), { level: 9 });
  xmpDict.set(PDFName.of("Length"), doc.context.obj(bytes.length));
  doc.catalog.set(PDFName.of("Metadata"), doc.context.register(PDFRawStream.of(xmpDict, bytes)));

  return doc;
}

describe("stage 4 — strip", () => {
  it("removes stored thumbnails, which viewers regenerate (FR-4.1)", async () => {
    const doc = await documentWithMetadata();
    const report = strip(doc, defaultOptions("balanced"), FLAGS);
    expect(report.thumbnails).toBe(1);
    expect(doc.getPages()[0].node.has(PDFName.of("Thumb"))).toBe(false);
  });

  it("takes the identifying metadata and leaves the title (FR-12.3)", async () => {
    const doc = await documentWithMetadata();
    strip(doc, defaultOptions("balanced"), FLAGS);

    const info = doc.context.lookup(doc.context.trailerInfo.Info) as PDFDict;
    expect(info.has(PDFName.of("Author"))).toBe(false);
    expect(info.has(PDFName.of("Producer"))).toBe(false);
    expect(info.has(PDFName.of("Title"))).toBe(true);

    const xmp = new TextDecoder().decode(
      streamBytes(doc.catalog.lookupMaybe(PDFName.of("Metadata"), PDFStream))!,
    );
    expect(xmp).not.toContain("Jordan Fielding");
    expect(xmp).not.toContain("studio-imac");
    expect(xmp).not.toContain("Acme Layout");
    // The document is still the document.
    expect(xmp).toContain("Quarterly report");
  });

  it("keeps document JavaScript on a form, even when asked to remove it (FR-4.2)", async () => {
    const doc = await documentWithMetadata();
    const names = doc.context.obj({}) as PDFDict;
    names.set(PDFName.of("JavaScript"), doc.context.obj({}));
    doc.catalog.set(PDFName.of("Names"), names);

    const options = defaultOptions("balanced");
    options.strip.javascript = true;
    const report = strip(doc, options, { ...FLAGS, hasAcroForm: true });

    expect(report.javascriptRemoved).toBe(false);
    expect(names.has(PDFName.of("JavaScript"))).toBe(true);
    expect(report.preserved.some((note) => note.includes("JavaScript"))).toBe(true);
  });
});
