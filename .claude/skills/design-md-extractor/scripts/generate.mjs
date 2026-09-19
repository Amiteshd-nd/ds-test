#!/usr/bin/env node
// Turns a raw extraction payload into DESIGN.md or SKILL.md.
//
// The three lib/ modules are vendored unmodified from the TypeUI DESIGN.md
// Chrome extension (bergside/design-md-chrome, MIT). This file replaces the
// extension's popup as the thing that drives them.
//
//   node scripts/generate.mjs <payload.json> [--mode design|skill] [-o FILE]
//
// Reads the payload from a file, or from stdin when the path is "-".

import { readFileSync, writeFileSync } from 'node:fs';
import { normalizeExtractedStyles } from '../lib/normalize.mjs';
import { generateDesignMarkdown } from '../lib/generate-design-md.mjs';
import { generateSkillMarkdown } from '../lib/generate-skill-md.mjs';
import { validateMarkdownOutput } from '../lib/validate.mjs';

function parseArgs(argv) {
  const args = { input: null, mode: 'design', out: null, name: null, brand: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--mode') args.mode = argv[++i];
    else if (a === '-o' || a === '--out') args.out = argv[++i];
    else if (a === '--name') args.name = argv[++i];
    else if (a === '--brand') args.brand = argv[++i];
    else if (!args.input) args.input = a;
  }
  return args;
}

// The generators want a display name and a brand. Fall back to whatever the
// page told us about itself, in decreasing order of reliability.
function inferBrand(payload) {
  const s = payload.siteSignals ?? {};
  const fromTitle = (s.title || payload.source?.title || '').split(/[|–—·-]/)[0].trim();
  return s.ogSiteName || s.appName || fromTitle || s.hostname || 'Untitled';
}

const args = parseArgs(process.argv.slice(2));

if (!args.input) {
  console.error('usage: node scripts/generate.mjs <payload.json|-> [--mode design|skill] [-o FILE]');
  process.exit(2);
}

if (args.mode !== 'design' && args.mode !== 'skill') {
  console.error(`unknown --mode "${args.mode}" (expected "design" or "skill")`);
  process.exit(2);
}

let raw;
try {
  raw = readFileSync(args.input === '-' ? 0 : args.input, 'utf8');
} catch (err) {
  console.error(`could not read payload: ${err.message}`);
  process.exit(1);
}

let payload;
try {
  payload = JSON.parse(raw);
} catch (err) {
  console.error(`payload is not valid JSON: ${err.message}`);
  console.error('Expected the object returned by scripts/extract-page.js.');
  process.exit(1);
}

if (!payload || !Array.isArray(payload.typography)) {
  console.error('payload is missing the expected extraction fields (typography, colors, ...).');
  console.error('Did the injected extractor run on a real page and return its value?');
  process.exit(1);
}

const normalized = normalizeExtractedStyles(payload);
const brand = args.brand || inferBrand(payload);
const context = {
  normalized,
  metadata: { systemName: args.name || `${brand} DS`, brand },
};

const markdown =
  args.mode === 'skill' ? generateSkillMarkdown(context) : generateDesignMarkdown(context);

// The upstream validator is the same gate the extension applies before it lets
// you download a file. Treat a failure as a real failure rather than shipping
// half-formed markdown.
const { isValid, errors, warnings } = validateMarkdownOutput(args.mode, markdown);

for (const warning of warnings) console.error(`warn: ${warning}`);

if (!isValid) {
  console.error(`generated ${args.mode} markdown failed validation:`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

if (args.out) {
  writeFileSync(args.out, markdown);
  console.error(`wrote ${args.out} (${markdown.length} chars, ${args.mode} mode)`);
} else {
  process.stdout.write(markdown);
}
