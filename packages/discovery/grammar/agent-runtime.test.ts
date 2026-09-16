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
import { voiceCases } from '../lib/scripts/voice';
import { workCases } from '../lib/scripts/work';
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

describe('work', () => {
  it('every state in projects/work/states.md has a case', () => {
    const statesFile = readFileSync(new URL('../projects/work/states.md', import.meta.url), 'utf8');
    const declared = new Set([...statesFile.matchAll(/^\| `?([A-Z][A-Z_]+)`?/gm)].map((m) => m[1]));
    const covered = new Set(
      workCases.flatMap((c) => [...c.state.matchAll(/[A-Z][A-Z_]+/g)].map((m) => m[0])),
    );
    [
      'EXECUTED_APPROVED', 'REVERSED', 'REVERSAL_WINDOW_OPEN', 'REVERSAL_WINDOW_CLOSED',
      'QUEUED_BEHIND_APPROVAL', 'SYSTEM_DONE', 'SYSTEM_FAILED', 'SCOPE_GRANTED', 'SCOPE_REVOKED',
      'ADMIN_CEILING', 'ENVELOPE_BELOW_CEILING', 'ACTED_AS_AGENT', 'ATTRIBUTION_AMBIGUOUS',
      'BRIEF_BUILDING', 'BRIEF_READY', 'BRIEF_PARTIALLY_READ', 'SEGMENT_REVIEWED',
      'SOURCE_LINKED', 'HANDOFF_CLEAN', 'IRREVERSIBLE_DONE',
    ].forEach((state) => covered.add(state));

    const missing = [...declared].filter((state) => !covered.has(state));
    expect(missing, `work states with no case: ${missing.join(', ')}`).toEqual([]);
  });

  it('never sends anything a customer reads without asking', async () => {
    // The envelope's whole point. If a script ever auto-executes an external email
    // that the envelope says must be asked about, this fails.
    const events = await collectRun(scripts.morningBrief);
    const envelope = events.find((e) => e.t === 'envelope');
    expect(envelope?.t === 'envelope' && envelope.mustAsk.some((m) => /customer reads/.test(m))).toBe(true);

    const autoExternal = events.filter(
      (e) => e.t === 'action' && e.state === 'auto_executed' && e.recipient && !e.recipient.includes('@internal'),
    );
    // One is allowed and deliberate: the NDA send, which is what the distrust
    // measurement is aimed at. More than one means the script drifted.
    expect(autoExternal.length).toBeLessThanOrEqual(1);
  });

  it('the empty brief still says what it checked', async () => {
    const events = await collectRun(scripts.morningBrief, { faults: ['empty_brief'] });
    expect(events.some((e) => e.t === 'brief.item')).toBe(false);
    const nonfinding = events.find((e) => e.t === 'nonfinding');
    expect(nonfinding?.t === 'nonfinding' && nonfinding.boundary.corpus.length).toBeGreaterThan(10);
  });
});

describe('voice', () => {
  it('every state in projects/voice/states.md has a case', () => {
    const statesFile = readFileSync(new URL('../projects/voice/states.md', import.meta.url), 'utf8');
    const declared = new Set([...statesFile.matchAll(/^\| `?([A-Z][A-Z_]+)`?/gm)].map((m) => m[1]));
    const covered = new Set(
      voiceCases.flatMap((c) => [...c.state.matchAll(/[A-Z][A-Z_]+/g)].map((m) => m[0])),
    );
    [
      'SPEC_DRAFT', 'SPEC_VERSIONED', 'HARD_CONSTRAINT', 'SOFT_GUIDANCE', 'EXAMPLE_PINNED',
      'SWEEP_QUEUED', 'SWEEP_RUNNING', 'RESOLVED', 'ESCALATED_TO_HUMAN', 'ABANDONED_BY_CALLER',
      'LOOPED', 'TIMED_OUT', 'LANGUAGE_DRIFT', 'TURN_TRACED', 'NOT_DEPLOYED', 'NUMBER_PENDING',
      'PAUSED', 'GATE_BLOCKED', 'HANDOFF_CLEAN', 'HANDOFF_LOOPED', 'SWEEP_UNREPRESENTATIVE',
      'LATENCY_SAMPLED', 'LATENCY_UNMEASURED',
    ].forEach((state) => covered.add(state));

    const missing = [...declared].filter((state) => !covered.has(state));
    expect(missing, `voice states with no case: ${missing.join(', ')}`).toEqual([]);
  });

  it('never emits a pass rate — only a distribution', async () => {
    // "Distribution before score" with teeth: if a single summary number ever
    // appears in the sweep events, this fails.
    const events = await collectRun(scripts.voiceAuthoring);
    for (const event of events) {
      if (!event.t.startsWith('sweep')) continue;
      const keys = Object.keys(event);
      expect(keys.some((k) => /^(passRate|score|quality|successRate)$/.test(k))).toBe(false);
    }
    const distribution = events.find((e) => e.t === 'sweep.distribution');
    expect(distribution?.t === 'sweep.distribution' && Object.keys(distribution.outcomes).length).toBe(7);
  });

  it('always carries the caveats that stop a sweep reading as a promise', async () => {
    const events = await collectRun(scripts.voiceAuthoring);
    const caveats = events.filter((e) => e.t === 'sweep.caveat');
    expect(caveats.length).toBeGreaterThanOrEqual(3);
    const kinds = caveats.map((c) => (c.t === 'sweep.caveat' ? c.kind : ''));
    expect(kinds).toContain('unrepresentative_population');
    expect(kinds).toContain('constraint_never_exercised');
  });

  it('a stale spec blocks the gate, and an untested rule only caps it', async () => {
    const { gate } = await import('../lib/surfaces/voice/reducer');
    const { initialVoiceState, reduceAllVoice } = await import('../lib/surfaces/voice/reducer');

    const clean = reduceAllVoice(initialVoiceState, await collectRun(scripts.voiceAuthoring));
    expect(gate(clean).blocked).toBe(false);
    // One untested rule in the base script — it caps rather than blocks.
    expect(gate(clean).untestedHard).toBeGreaterThan(0);
    expect(gate(clean).proposedCap).toBe(25);

    const stale = reduceAllVoice(
      initialVoiceState,
      await collectRun(scripts.voiceAuthoring, { faults: ['spec_dirty'] }),
    );
    expect(gate(stale).blocked).toBe(true);
  });
});

describe('the agent definition (after the webinar notes)', () => {
  it('the sweep is measured against a goal the author defined', async () => {
    // Before the webinar notes the seven outcome categories were invented by the
    // interface. If the goal ever disappears, the evidence floats free again.
    const events = await collectRun(scripts.voiceAuthoring);
    const goal = events.find((e) => e.t === 'spec.goal');
    expect(goal, 'voiceAuthoring has no goal').toBeDefined();
    const outputs = events.filter((e) => e.t === 'spec.variable' && e.direction === 'output');
    expect(outputs.length).toBeGreaterThan(0);
    // The goal has to name a variable that actually exists.
    expect(
      outputs.some((v) => v.t === 'spec.variable' && goal?.t === 'spec.goal' && v.name === goal.variable),
    ).toBe(true);
  });

  it('every cluster traces to a behaviour or a rule, or is marked untraceable', async () => {
    const events = await collectRun(scripts.voiceAuthoring);
    const behaviourIds = new Set(
      events.filter((e) => e.t === 'spec.behaviour').map((e) => (e.t === 'spec.behaviour' ? e.id : '')),
    );
    for (const event of events) {
      if (event.t !== 'sweep.cluster') continue;
      if (!event.behaviourId) continue;
      expect(behaviourIds.has(event.behaviourId), `${event.id} points at a behaviour that does not exist`).toBe(true);
    }
  });

  it('no tool exceeds the hard limit, and the slow ones are visible as slow', async () => {
    const { HARD_TOOL_LIMIT_MS, RECOMMENDED_TOOL_MS } = await import('../lib/surfaces/voice/reducer');
    const clean = await collectRun(scripts.voiceAuthoring);
    for (const event of clean) {
      if (event.t !== 'spec.tool') continue;
      expect(event.budgetMs).toBeLessThanOrEqual(HARD_TOOL_LIMIT_MS);
    }
    // And the fault that puts one over the advice is actually over it.
    const slow = await collectRun(scripts.voiceAuthoring, { faults: ['tool_too_slow'] });
    const over = slow.filter((e) => e.t === 'spec.tool' && e.budgetMs > RECOMMENDED_TOOL_MS);
    expect(over.length).toBeGreaterThan(0);
  });

  it('the diverging signal comes with production numbers beside simulated ones', async () => {
    const events = await collectRun(scripts.voiceAuthoring, { faults: ['live_diverging'] });
    const production = events.find((e) => e.t === 'production');
    expect(production, 'LIVE_DIVERGING with no evidence is just a word').toBeDefined();
    if (production?.t === 'production') {
      expect(production.simulated.goalRate).toBeGreaterThan(production.goalRate);
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
