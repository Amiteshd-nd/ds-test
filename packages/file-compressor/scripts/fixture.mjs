// The fixture document, as a function so both the CLI wrapper and the
// end-to-end test build exactly the same bytes.
//
// What it contains, and why: a synthetic continuous-tone image placed at about
// 600 DPI (so the early-exit downsample has something to find) and again at
// about 300 DPI (so the same stream is drawn at two scales and the maximum has
// to win), reused on every page (so the content-addressed cache and the object
// dedup both have work), a text layer (so FR-6.2's extraction check is
// meaningful), streams deflated at level 1 (so stage 2 is not a no-op), and one
// unreferenced object of the kind an incremental save leaves behind.
import {
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFOperator,
  PDFOperatorNames as Ops,
  PDFRawStream,
  StandardFonts,
} from "pdf-lib";
import { zlibSync } from "fflate";

const IMG_W = 1200;
const IMG_H = 900;

export async function buildFixture({ pages = 3 } = {}) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const pixels = new Uint8Array(IMG_W * IMG_H * 3);
  for (let y = 0; y < IMG_H; y += 1) {
    for (let x = 0; x < IMG_W; x += 1) {
      const i = (y * IMG_W + x) * 3;
      const ripple = Math.sin(x / 23) * Math.cos(y / 31) * 40;
      pixels[i] = clamp(120 + (x / IMG_W) * 90 + ripple);
      pixels[i + 1] = clamp(90 + (y / IMG_H) * 120 - ripple);
      pixels[i + 2] = clamp(160 - (x / IMG_W) * 60 + ripple * 0.5);
    }
  }

  const imageDict = doc.context.obj({});
  imageDict.set(PDFName.of("Type"), PDFName.of("XObject"));
  imageDict.set(PDFName.of("Subtype"), PDFName.of("Image"));
  imageDict.set(PDFName.of("Width"), doc.context.obj(IMG_W));
  imageDict.set(PDFName.of("Height"), doc.context.obj(IMG_H));
  imageDict.set(PDFName.of("ColorSpace"), PDFName.of("DeviceRGB"));
  imageDict.set(PDFName.of("BitsPerComponent"), doc.context.obj(8));
  imageDict.set(PDFName.of("Filter"), PDFName.of("FlateDecode"));
  const imageBytes = zlibSync(pixels, { level: 1 });
  imageDict.set(PDFName.of("Length"), doc.context.obj(imageBytes.length));
  const imageRef = doc.context.register(PDFRawStream.of(imageDict, imageBytes));

  for (let i = 0; i < pages; i += 1) {
    const page = doc.addPage([612, 792]);
    page.drawText(`Adaptive compression fixture — page ${i + 1} of ${pages}`, { x: 72, y: 720, size: 16, font });
    page.drawText("The upper image is 1200x900 in a 144x108 point box: about 600 DPI.", {
      x: 72,
      y: 696,
      size: 10,
      font,
    });

    // pushOperators appends to the page's own content stream rather than
    // replacing /Contents, so the text drawn above survives.
    page.node.setXObject(PDFName.of("Im0"), imageRef);
    page.pushOperators(
      ...placeImage(144, 108, 72, 540),
      ...placeImage(288, 216, 72, 260),
    );
  }

  const orphan = doc.context.obj({});
  orphan.set(PDFName.of("Note"), doc.context.obj("Left behind by an earlier save"));
  doc.context.register(PDFRawStream.of(orphan, new Uint8Array(64 * 1024).fill(0x41)));

  return doc.save({ useObjectStreams: false });
}

/** `q <w> 0 0 <h> <x> <y> cm /Im0 Do Q` — the image in a box of the given size. */
function placeImage(width, height, x, y) {
  return [
    PDFOperator.of(Ops.PushGraphicsState),
    // PDFNumber, not raw numbers: pdf-lib mis-sizes an operator built from
    // plain JS numbers and writes an empty content stream, with no error.
    PDFOperator.of(Ops.ConcatTransformationMatrix, [width, 0, 0, height, x, y].map((n) => PDFNumber.of(n))),
    PDFOperator.of(Ops.DrawObject, [PDFName.of("Im0")]),
    PDFOperator.of(Ops.PopGraphicsState),
  ];
}

function clamp(value) {
  return Math.max(0, Math.min(255, value));
}
