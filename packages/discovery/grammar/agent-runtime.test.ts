/**
 * Tests for the runtime, and only for the runtime.
 *
 * Per CLAUDE.md there are no tests for prototype UI, but determinism is the one
 * thing that must not break: it's what makes two user-test sessions comparable and
 * what makes a demo not depend on the network. If a fault stops being reproducible,
 * every finding gathered with it becomes anecdote.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { codingCases } from '../lib/scripts/coding';
import { contentCases } from '../lib/scripts/content';
import { docCases } from '../lib/scripts/doc';
import { FORM_LINES, lineForField } from '../components/surfaces/doc/form';
import { collectRun, createRun, scripts, type AgentEvent, type FaultKind } from './agent-runtime';

const codingFaults: FaultKind[] = [
  'plan_revised',
  'diverged_run',
  'manual_edit_conflict',
  'permission_block',
  'speculative_discard',
];

describe('determinism', () => {
  it('same seed and faults produce an identical stream', async () => {
    const a = await collectRun(scripts.codingRun, { seed: 42, faults: codingFaults });
    const b = await collectRun(scripts.codingRun, { seed: 42, faults: codingFaults });
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('a clean run and a fault-injected run differ', async () => {
    const clean = await collectRun(scripts.codingRun, { seed: 1 });
    const faulted = await collectRun(scripts.codingRun, { seed: 1, faults: ['diverged_run'] });
    expect(faulted.length).toBeGreaterThan(clean.length);
    expect(faulted.some((e) => e.t === 'divergence')).toBe(true);
    expect(clean.some((e) => e.t === 'divergence')).toBe(false);
  });

  it('faults compose without dropping the base run', async () => {
    const clean = await collectRun(scripts.codingRun, { seed: 7 });
    const all = await collectRun(scripts.codingRun, { seed: 7, faults: codingFaults });
    const kinds = new Set(all.map((e) => e.t));
    expect(kinds.has('plan.revise')).toBe(true);
    expect(kinds.has('divergence')).toBe(true);
    expect(kinds.has('ask')).toBe(true);
    // Every event of the clean run still appears somewhere in the faulted one.
    const faultedJson = all.map((e) => JSON.stringify(e));
    const survivors = clean.filter((e) => faultedJson.includes(JSON.stringify(e)));
    expect(survivors.length).toBeGreaterThan(clean.length - 4);
  });
});

describe('scripts', () => {
  it('every script starts a run or a sweep', () => {
    for (const [name, script] of Object.entries(scripts)) {
      const first = script[0][1] as AgentEvent;
      expect(['run.start', 'sweep.start', 'spec.version'], `${name} opens with ${first.t}`).toContain(first.t);
    }
  });

  it('codingRun covers the states the coding brief needs', async () => {
    const events = await collectRun(scripts.codingRun);
    const kinds = new Set(events.map((e) => e.t));
    for (const kind of ['plan', 'envelope', 'spec.version', 'checkpoint', 'checkpoint.state', 'change', 'nonfinding', 'latency.sample', 'latency.distribution']) {
      expect(kinds.has(kind as AgentEvent['t']), `codingRun is missing ${kind}`).toBe(true);
    }
  });

  it('marks scripted latency as a placeholder, never as measured', async () => {
    const events = await collectRun(scripts.codingRun);
    const distributions = events.filter((e) => e.t === 'latency.distribution');
    expect(distributions.length).toBeGreaterThan(0);
    for (const d of distributions) {
      expect(d.t === 'latency.distribution' && d.source).toBe('placeholder');
    }
  });
});

describe('state coverage', () => {
  it('every state in projects/coding/states.md has a case', async () => {
    // The gallery is specified as "every state in states.md", so the two files
    // drifting apart is the failure this guards. Fails loudly with the names.
    const statesFile = readFileSync(
      new URL('../projects/coding/states.md', import.meta.url),
      'utf8',
    );
    const declared = new Set(
      [...statesFile.matchAll(/^\| `?([A-Z][A-Z_]+)`?/gm)].map((m) => m[1]),
    );
    // Named in a case title, or visible without any fault on the base run.
    const covered = new Set(
      codingCases.flatMap((c) => [...c.state.matchAll(/[A-Z][A-Z_]+/g)].map((m) => m[0])),
    );
    const alwaysOnScreen = [
      'IDLE', 'PLANNING', 'RUNNING', 'QUEUED', 'DONE', 'PROPOSED', 'APPLIED',
      'APPLIED_UNREVIEWED', 'CHECKPOINT_PARTIAL', 'NONFINDING', 'ENVELOPE_SET',
      'PARTIAL', 'SKIPPED', 'CHECKPOINT_RESTORED', 'STEERING_APPLIED', 'EDGE_ONLY',
    ];
    alwaysOnScreen.forEach((s) => covered.add(s));

    const missing = [...declared].filter((s) => !covered.has(s));
    expect(missing, `states with no case: ${missing.join(', ')}`).toEqual([]);
  });
});

describe('doc', () => {
  it('every state in projects/doc/states.md has a case', async () => {
    const statesFile = readFileSync(new URL('../projects/doc/states.md', import.meta.url), 'utf8');
    const declared = new Set(
      [...statesFile.matchAll(/^\| `?([A-Z][A-Z_]+)`?/gm)].map((m) => m[1]),
    );
    const covered = new Set(
      docCases.flatMap((c) => [...c.state.matchAll(/[A-Z][A-Z_]+/g)].map((m) => m[0])),
    );
    // Reachable on the base document or through the surface's own controls.
    [
      'UNREVIEWED', 'IN_REVIEW', 'REVIEWED_UNCHANGED', 'CORRECTED_BY_HUMAN',
      'EXTRACTED_FROM_HANDWRITING', 'REPAIR_OFFERED', 'REPAIR_NO_ALTERNATES',
      'REPAIR_TYPED', 'PROVENANCE_EXACT',
      'SOURCE_MULTIPAGE', 'ACCEPTED', 'ACCEPTED_PARTIALLY_VERIFIED', 'REJECTED',
      'ESCALATED', 'EXPORT_READY', 'EXPORT_LOSSY', 'EXPORT_BLOCKED',
    ].forEach((s) => covered.add(s));

    const missing = [...declared].filter((s) => !covered.has(s));
    expect(missing, `doc states with no case: ${missing.join(', ')}`).toEqual([]);
  });

  it('the form on the paper agrees with the regions the agent claims', async () => {
    // The script is the agent's claim about where it looked; form.ts is what is
    // actually on the page. If they drift, the provenance highlight points at
    // nothing and the surface's central pattern quietly lies.
    const events = await collectRun(scripts.docReviewFull);
    const claimed = events.filter(
      (e): e is Extract<AgentEvent, { t: 'value' }> => e.t === 'value' && !!e.provenance?.region,
    );
    expect(claimed.length).toBeGreaterThan(10);

    for (const event of claimed) {
      const line = lineForField(event.field);
      expect(line, `${event.field} has provenance but no line on the paper`).toBeDefined();
      const region = event.provenance!.region!;
      expect([line!.region.x, line!.region.y, line!.region.w, line!.region.h, line!.page],
        `${event.field} region does not match the paper`).toEqual(
        [region.x, region.y, region.w, region.h, region.page],
      );
    }
  });

  it('every hand-written Indic value on the paper declares its language', () => {
    // Without `lang`, per-script line heights don't key off it and Devanagari
    // renders with Latin leading, which clips matras.
    const indic = /[\u0900-\u0DFF]/;
    const missing = FORM_LINES.filter((line) => line.written && indic.test(line.written) && !line.lang);
    expect(missing.map((l) => l.label), 'form lines with Indic text and no lang').toEqual([]);
  });
});

describe('content', () => {
  it('every state in projects/content/states.md has a case', () => {
    const statesFile = readFileSync(new URL('../projects/content/states.md', import.meta.url), 'utf8');
    const declared = new Set(
      [...statesFile.matchAll(/^\| `?([A-Z][A-Z_]+)`?/gm)].map((m) => m[1]),
    );
    const covered = new Set(
      contentCases.flatMap((c) => [...c.state.matchAll(/[A-Z][A-Z_]+/g)].map((m) => m[0])),
    );
    // Reachable on the base job or through the surface's own controls.
    [
      'JOB_QUEUED', 'JOB_RUNNING', 'JOB_PARTIAL', 'SWEEP_SHAPE', 'TIMING_FITS',
      'TIMING_UNDERRUN', 'SEGMENT_ALIGNED', 'SEGMENT_UNALIGNED', 'CONSENT_ON_FILE',
      'CONSENT_SCOPE_EXCEEDED', 'AUDIO_UNAVAILABLE', 'NEEDS_NATIVE_REVIEW',
      'ESCALATED_WITH_QUESTION', 'NATIVE_APPROVED', 'NATIVE_REJECTED',
      'APPROVED_UNVERIFIED', 'PUBLISH_BLOCKED', 'REPAIR_TERM_PINNED',
      'REPAIR_SEGMENT_ONLY',
    ].forEach((state) => covered.add(state));

    const missing = [...declared].filter((state) => !covered.has(state));
    expect(missing, `content states with no case: ${missing.join(', ')}`).toEqual([]);
  });

  it('asks for a register per language, because register does not transfer', async () => {
    const events = await collectRun(scripts.dubJob);
    const job = events.find((e) => e.t === 'dub.job');
    expect(job?.t === 'dub.job' && Object.keys(job.registers).length).toBe(9);
    // Bengali wants the formal register that would read as cold in Hindi.
    expect(job?.t === 'dub.job' && job.registers['bn-IN']).toBe('formal');
  });

  it('never carries a single combined quality score', async () => {
    // Fluency and fidelity are two questions. If a variant ever gains one merged
    // number, this fails — which is the point.
    const events = await collectRun(scripts.dubJob);
    for (const event of events) {
      if (event.t !== 'variant') continue;
      const keys = Object.keys(event);
      expect(keys).toContain('fluency');
      expect(keys).toContain('fidelity');
      expect(keys.some((k) => /^(score|quality|match|similarity)$/.test(k))).toBe(false);
    }
  });
});

describe('cancellation', () => {
  it('aborts mid-run and stops yielding', async () => {
    const controller = new AbortController();
    const seen: AgentEvent[] = [];
    const run = createRun(scripts.codingRun, { speed: 1, signal: controller.signal });
    await expect(
      (async () => {
        for await (const event of run) {
          seen.push(event);
          if (seen.length === 2) controller.abort();
        }
      })(),
    ).rejects.toThrow();
    expect(seen.length).toBe(2);
  });
});
