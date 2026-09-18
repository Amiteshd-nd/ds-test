// Writes the fixture PDF to disk:  node scripts/make-fixture.mjs [out.pdf]
//
// Deliberately not checked in as a binary — the generator is reproducible, and a
// fixture PDF in git is a fixture nobody can diff.
import fs from "node:fs";
import path from "node:path";
import { buildFixture } from "./fixture.mjs";

const out = process.argv[2] ?? path.join(import.meta.dirname, "..", "fixture.pdf");
const bytes = await buildFixture();
fs.writeFileSync(out, bytes);
console.log(`${out} — ${(bytes.length / 1024 / 1024).toFixed(2)} MB`);
