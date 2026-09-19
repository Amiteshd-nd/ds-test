// Module-boundary lint. PRD §21: "Adapter boundary erodes under deadline pressure —
// module-boundary lint in CI from M1. A violation fails the build. No exceptions, no
// allowlist."
//
// There is no allowlist in this file, deliberately. An allowlist is how the boundary
// dies: the first entry is always justified, and the fortieth is why core imports the
// host's user service.
//
// Four rules:
//   1. src/core/** may not import adapters-host/**, demo/**, or any host package.
//   2. src/core/** may not contain a string literal over 200 characters (§7.4) — that
//      is a prompt, and prompts live in versioned files.
//   3. src/core/** may not call a model vendor directly; only the router's providers may.
//   4. src/ui-headless/** may not contain className, style props, or CSS imports (§13.1).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const violations = [];

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      out.push(...walk(full));
    } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const rel = (f) => path.relative(ROOT, f);
const report = (file, line, rule, message) => violations.push({ file: rel(file), line, rule, message });

// -- rule 1 + 2 + 3: core stays core ---------------------------------------
const CORE = path.join(ROOT, 'src/core');
const PROVIDERS = path.join(ROOT, 'src/core/router/providers');

for (const file of walk(CORE)) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const n = i + 1;

    const imp = /\bfrom\s+['"]([^'"]+)['"]/.exec(line) ?? /\bimport\s*\(\s*['"]([^'"]+)['"]/.exec(line);
    if (imp) {
      const spec = imp[1];
      const resolved = spec.startsWith('.') ? path.resolve(path.dirname(file), spec) : spec;
      if (spec.startsWith('.') && !resolved.startsWith(CORE)) {
        report(file, n, 'core-imports-outside', `core reaches outside itself: ${spec}`);
      }
      if (/adapters-host|\/demo\//.test(spec)) {
        report(file, n, 'core-imports-host', `core imports host code: ${spec}. That belongs behind an adapter.`);
      }
      if (/^(@anthropic-ai|openai|@google|cohere|litellm|langchain|@langchain)/.test(spec) && !file.startsWith(PROVIDERS)) {
        report(file, n, 'direct-provider-sdk', `only src/core/router/providers may talk to a model vendor (${spec}) — §8.3 wants one egress proxy.`);
      }
    }

    // A call, not a declaration: `await fetch(...)`, `= fetch(...)`, `return fetch(...)`.
    // `RetrievalAdapter.fetch` and `this.retrieval.fetch(...)` are not network calls.
    if (/(?:await|=|return)\s+fetch\s*\(/.test(line) && !file.startsWith(PROVIDERS)) {
      report(file, n, 'direct-network', 'network calls belong in a router provider, where cost metering and safety checks live.');
    }

    for (const m of line.matchAll(/(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
      if (m[2].length > 200) {
        report(file, n, 'prompt-in-code', `a ${m[2].length}-character string literal. If it is a prompt, it belongs in prompts/ (§7.4).`);
      }
    }
  });
}

// -- rule 4: the agent layer ships zero styles ------------------------------
const UI = path.join(ROOT, 'src/ui-headless');
if (fs.existsSync(UI)) {
  for (const file of walk(UI)) {
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (/\bclassName\b|\bstyle\s*=\s*\{|from\s+['"][^'"]+\.css['"]/.test(line)) {
        report(file, i + 1, 'styles-in-headless', 'ui-headless supplies behaviour; the host\'s design system supplies every pixel (§13.1).');
      }
    });
  }
}

if (violations.length === 0) {
  process.stdout.write('boundaries: clean\n');
  process.exit(0);
}

process.stderr.write(`boundaries: ${violations.length} violation(s)\n\n`);
for (const v of violations) {
  process.stderr.write(`  ${v.file}:${v.line}  [${v.rule}]\n    ${v.message}\n`);
}
process.stderr.write('\nThere is no allowlist. Move the code behind an adapter, or into prompts/, and run again.\n');
process.exit(1);
