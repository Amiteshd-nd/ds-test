// pdf.js needs three things from its package at runtime that a bundler will not
// inline: the worker module, the standard-font data (for pages that use
// Helvetica/Times without embedding them), and the CMaps (for CJK encodings).
// Without the fonts, a page's text renders blank — which would score as damage
// and send perfectly good files down the fallback path; without the CMaps, CJK
// documents do the same.
//
// Copied into public/ on predev and prebuild, so they always match the
// installed pdf.js and never get checked in.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pkg = path.dirname(require.resolve("pdfjs-dist/package.json"));
const publicDir = path.join(import.meta.dirname, "..", "public");

fs.mkdirSync(publicDir, { recursive: true });
fs.copyFileSync(path.join(pkg, "build", "pdf.worker.min.mjs"), path.join(publicDir, "pdf.worker.min.mjs"));

for (const dir of ["standard_fonts", "cmaps"]) {
  const source = path.join(pkg, dir);
  if (!fs.existsSync(source)) continue;
  fs.rmSync(path.join(publicDir, dir), { recursive: true, force: true });
  fs.cpSync(source, path.join(publicDir, dir), { recursive: true });
}

console.log("[file-compressor] pdf.js worker, standard fonts and cmaps -> public/");
