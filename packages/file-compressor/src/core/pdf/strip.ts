/**
 * Stage 4 — strip (FR-4.1 … FR-4.3). Lossless in the sense that nothing
 * *rendered* changes, but it removes things, so every removal is individually
 * toggleable and the dangerous ones default to off.
 *
 * FR-4.3 is the line that matters: outlines, links, annotations, form fields,
 * tagged-PDF structure and accessibility metadata are preserved under every
 * mode. Removing accessibility structure to save bytes is not an acceptable
 * default, and this file is where that promise is kept or broken.
 */

import { PDFArray, PDFDict, PDFName, PDFRawStream, PDFRef, PDFStream } from "pdf-lib";
import { zlibSync } from "fflate";
import { streamBytes } from "./ctm";
import type { PDFDocument } from "pdf-lib";
import type { CompressOptions, TriageFlags } from "../types";

const N = (name: string) => PDFName.of(name);

export interface StripReport {
  thumbnails: number;
  javascriptRemoved: boolean;
  embeddedFilesRemoved: boolean;
  metadataStripped: boolean;
  /** Things we chose not to remove, and why — surfaced on the results screen. */
  preserved: string[];
}

export function strip(doc: PDFDocument, options: CompressOptions, flags: TriageFlags): StripReport {
  const report: StripReport = {
    thumbnails: 0,
    javascriptRemoved: false,
    embeddedFilesRemoved: false,
    metadataStripped: false,
    preserved: [],
  };

  // FR-4.1 — viewers regenerate page thumbnails on demand; a stored one is
  // pure waste and nothing references it.
  if (options.strip.thumbnails) {
    for (const page of doc.getPages()) {
      if (page.node.has(N("Thumb"))) {
        page.node.delete(N("Thumb"));
        report.thumbnails += 1;
      }
    }
  }

  // FR-4.2 — default off for signed or form documents, where a script or an
  // attachment may be part of how the document works.
  const formLike = flags.hasAcroForm || flags.signed;

  if (options.strip.javascript && !formLike) {
    const names = doc.catalog.lookupMaybe(N("Names"), PDFDict);
    if (names?.has(N("JavaScript"))) {
      names.delete(N("JavaScript"));
      report.javascriptRemoved = true;
    }
    const action = doc.catalog.lookupMaybe(N("OpenAction"), PDFDict);
    const kind = action?.get(N("S"));
    if (kind instanceof PDFName && kind.asString() === "/JavaScript") {
      doc.catalog.delete(N("OpenAction"));
      report.javascriptRemoved = true;
    }
  } else if (options.strip.javascript && formLike) {
    report.preserved.push("Document JavaScript — this file has form fields or a signature that may depend on it.");
  }

  if (options.strip.embeddedFiles && !formLike) {
    const names = doc.catalog.lookupMaybe(N("Names"), PDFDict);
    if (names?.has(N("EmbeddedFiles"))) {
      names.delete(N("EmbeddedFiles"));
      report.embeddedFilesRemoved = true;
    }
  }

  // FR-12.3 — strip author, producer and creation host by default, and say so.
  if (options.strip.metadata) {
    const info = doc.context.lookup(doc.context.trailerInfo.Info);
    if (info instanceof PDFDict) {
      for (const key of ["Author", "Creator", "Producer", "Company", "SourceModified"]) {
        info.delete(N(key));
      }
      report.metadataStripped = true;
    }
    // XMP carries the same identifying fields, and the naive move — dropping the
    // whole stream — would take the document's title and description with it,
    // which is more than FR-12.3 asks for and more than the results screen says
    // we did. Remove the identifying properties and leave the rest.
    const metadataValue = doc.catalog.get(N("Metadata"));
    const metadata = doc.catalog.lookupMaybe(N("Metadata"), PDFStream);
    if (metadata) {
      const scrubbed = scrubXmp(metadata);
      if (scrubbed) {
        const dict = metadata.dict;
        dict.set(N("Filter"), N("FlateDecode"));
        dict.delete(N("DecodeParms"));
        dict.set(N("Length"), doc.context.obj(scrubbed.length));
        const replacement = PDFRawStream.of(dict, scrubbed);
        if (metadataValue instanceof PDFRef) doc.context.assign(metadataValue, replacement);
        else doc.catalog.set(N("Metadata"), doc.context.register(replacement));
        report.metadataStripped = true;
      }
    }
    if (flags.conformance) {
      report.preserved.push(`This file's ${flags.conformance} conformance claim in its XMP metadata`);
    }
  }

  // FR-4.3, stated positively so the guarantee is visible in the report rather
  // than implied by the absence of code.
  if (doc.catalog.has(N("Outlines"))) report.preserved.push("Bookmarks and outline");
  if (flags.hasTaggedStructure) report.preserved.push("Tagged structure and accessibility metadata");
  if (flags.hasAcroForm) report.preserved.push("Form fields");
  if (countAnnotations(doc) > 0) report.preserved.push("Links and annotations");

  return report;
}

/**
 * Identifying properties, removed from the XMP packet by name. Everything else
 * — title, description, keywords, and any conformance claim — survives.
 */
const XMP_IDENTIFYING = [
  "xmp:CreatorTool",
  "pdf:Producer",
  "dc:creator",
  "xmpMM:DocumentID",
  "xmpMM:InstanceID",
  "xmpMM:OriginalDocumentID",
  "photoshop:AuthorsPosition",
];

function scrubXmp(metadata: PDFStream): Uint8Array | null {
  const bytes = streamBytes(metadata);
  if (!bytes) return null;
  let text = new TextDecoder().decode(bytes);
  const before = text;

  for (const property of XMP_IDENTIFYING) {
    // Both spellings the spec allows: an element, and an attribute on rdf:Description.
    text = text.replace(new RegExp(`<${property}[^>]*>[\\s\\S]*?</${property}>`, "g"), "");
    text = text.replace(new RegExp(`<${property}[^>]*/>`, "g"), "");
    text = text.replace(new RegExp(`\\s${property}="[^"]*"`, "g"), "");
  }

  if (text === before) return null;
  return zlibSync(new TextEncoder().encode(text), { level: 9, mem: 12 });
}

function countAnnotations(doc: PDFDocument): number {
  let total = 0;
  for (const page of doc.getPages()) {
    const annots = page.node.lookupMaybe(N("Annots"), PDFArray);
    if (annots) total += annots.size();
  }
  return total;
}
