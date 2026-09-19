// The addendum §8 regression guard, as one command.
//
//   "Any change that reddens one of these is reverted, not patched forward."
//
// A checklist in a document is a checklist nobody runs. Each item below maps to a check
// that already exists somewhere in this package; this just puts them in one place and in
// the order that fails fastest.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CHECKS = [
  {
    item: 'Module boundary: zero host imports in core, no prompts in code, no styles in headless',
    run: ['node', ['scripts/lint-boundaries.mjs']],
  },
  {
    item: 'Types',
    run: ['npx', ['tsc', '--noEmit', '-p', 'tsconfig.json']],
  },
  {
    item: 'Adapter conformance · durability after restart · awaiting_approval survives · guardrails · permission property · trace redaction',
    run: ['node', ['--test', 'tests/**/*.test.ts']],
  },
  {
    item: 'Golden sets at or above min_pass_rate, red team at 100%',
    run: ['node', ['evals/runner/run.ts']],
  },
  {
    item: 'Adapter readiness and graph health',
    run: ['node', ['scripts/doctor.ts']],
  },
  {
    item: 'M2, M3 and M5 Definitions of Done',
    run: ['node', ['scripts/dod.ts']],
  },
  // The second host runs the same gates. It is the only evidence that the portability
  // claim survives a change — a boundary that holds for one host held by construction.
  {
    item: 'Second host (harbor) · adapter readiness',
    run: ['node', ['scripts/doctor.ts']],
    env: { CORTEX_CONFIG: 'hosts/harbor/cortex.config.yaml' },
  },
  {
    item: 'Second host (harbor) · golden set and red team',
    run: ['node', ['evals/runner/run.ts']],
    env: { CORTEX_CONFIG: 'hosts/harbor/cortex.config.yaml' },
  },
];

let failed = 0;
for (const check of CHECKS) {
  const [cmd, args] = check.run;
  process.stdout.write(`\n▸ ${check.item}\n`);
  const result = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...(check.env ?? {}) } });
  if (result.status !== 0) {
    failed++;
    process.stdout.write(`  ✖ FAILED\n`);
  }
}

process.stdout.write(
  failed === 0
    ? '\nregression guard: green\n'
    : `\nregression guard: ${failed} check(s) red. Revert, do not patch forward.\n`,
);
process.exit(failed === 0 ? 0 : 1);
