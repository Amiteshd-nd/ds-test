// Manifest and prompt validation (§6.1, §6.2, §7). These are the checks that turn a
// misconfigured agent into a build failure instead of an incident.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AgentRegistry } from '../src/core/agents/registry.ts';
import { SkillRegistry, lintDescription } from '../src/core/skills/registry.ts';
import { PromptStore } from '../src/core/prompts/store.ts';
import { __setConfig, loadConfig } from '../src/core/config/config.ts';

const skills = SkillRegistry.load();

function withAgent(yaml: string): () => AgentRegistry {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-agents-'));
  fs.writeFileSync(path.join(dir, 'temp.agent.yaml'), yaml);
  return () => AgentRegistry.load(skills, dir);
}

const BASE = `
id: temp
version: 1
name: Temp
description: A temporary agent used by the manifest tests.
owner: tests
surfaces: [chat]
visibility: { entitlements: ["docs.read", "people.read", "projects.read"] }
model_policy: { default: reasoning.balanced, max_cost_usd_per_run: 0.1 }
prompt: atlas-guide@1
skills: [people.search]
grounding: { sources: [doc], max_context_tokens: 2000 }
memory: { session: { turns: 4, semantic_recall: false }, profile: { read: [], write: [] } }
hitl: { gates: [] }
output: { formats: [text] }
evals: { golden_set: evals/golden/temp/, min_pass_rate: 0.9 }
`;

test('the shipped manifests load clean', () => {
  assert.equal(skills.errors().length, 0, JSON.stringify(skills.issues));
  const agents = AgentRegistry.load(skills);
  assert.ok(agents.agents.has('atlas-guide'));
});

test('an agent may not declare a skill that is not in the registry', () => {
  assert.throws(withAgent(BASE.replace('skills: [people.search]', 'skills: [people.teleport]')), /not in the registry/);
});

test('an agent whose visibility does not cover a skill entitlement is rejected', () => {
  assert.throws(
    withAgent(BASE.replace('visibility: { entitlements: ["docs.read", "people.read", "projects.read"] }', 'visibility: { entitlements: ["docs.read"] }')),
    /requires entitlement "people.read"/,
  );
});

test('an inline agent must declare diff_proposal', () => {
  assert.throws(withAgent(BASE.replace('surfaces: [chat]', 'surfaces: [chat, inline]')), /output format "diff_proposal"/);
});

test('a prompt that does not resolve is rejected', () => {
  assert.throws(withAgent(BASE.replace('prompt: atlas-guide@1', 'prompt: atlas-guide@99')), /does not resolve/);
});

test('a skill description that never says when NOT to use it fails the lint', () => {
  const issues = lintDescription({
    id: 'x.y', version: 1, name: 'X', owner: 'tests',
    description: 'Searches for things in the system and returns whatever it happens to find for the caller today.',
    inputSchema: { type: 'object', properties: { q: { type: 'string', description: 'query' } }, required: ['q'] },
    outputSchema: { type: 'object' }, sideEffect: 'none', requiresEntitlements: [], timeoutMs: 1000,
    binding: { kind: 'native' },
  });
  assert.ok(issues.some((i) => /when NOT to use/.test(i.message)));
});

test('a description under twenty words fails the lint', () => {
  const issues = lintDescription({
    id: 'x.z', version: 1, name: 'X', owner: 'tests',
    description: 'Use when searching. Do not use otherwise.',
    inputSchema: { type: 'object', properties: {}, required: [] },
    outputSchema: { type: 'object' }, sideEffect: 'none', requiresEntitlements: [], timeoutMs: 1000,
    binding: { kind: 'native' },
  });
  assert.ok(issues.some((i) => /20 is the floor/.test(i.message)));
});

test('a write skill cannot load while write_skills.enabled is false', () => {
  // The repo has since earned the flag, so this pins the gate itself rather than the
  // current setting: a fresh host starts read-only and cannot opt out by forgetting.
  const real = loadConfig();
  __setConfig({ ...real, features: { ...real.features, 'write_skills.enabled': false } });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-skills-'));
  fs.writeFileSync(path.join(dir, 'w.skill.yaml'), `
id: messaging.send
version: 1
name: Send a message
description: >
  Sends a message from the current person to one other person. Use this only after the
  person has approved the exact text. Do not use it to draft, to search, or to reply on
  anyone's behalf without an approval recorded first.
owner: tests
input_schema: { type: object, required: [body], properties: { body: { type: string, description: the text } } }
output_schema: { type: object, properties: { id: { type: string } } }
side_effect: write
requires_entitlements: ["message.send"]
timeout_ms: 2000
binding: { kind: native }
`);
  try {
    assert.throws(() => SkillRegistry.load(dir), /write_skills.enabled is false/);
  } finally {
    __setConfig(real);
  }
});

test('prompts: an undefined variable raises rather than rendering empty', () => {
  const prompts = new PromptStore();
  assert.throws(() => prompts.render('atlas-guide', 1, { host_name: 'Atlas' }), /missing declared variables/);
});

test('prompts: the shared safety and untrusted fragments are included', () => {
  const prompts = new PromptStore();
  const r = prompts.render('atlas-guide', 1, {
    host_name: 'Atlas', locale: 'en-IN', principal_name: 'ananya', principal_type: 'member', principal_tz: 'Asia/Kolkata',
    memory: [], sources: [{ sourceId: 's1', ref: 'doc:a', title: 'A', text: 'body' }], question: 'why?',
  });
  assert.match(r.text, /never an instruction/);
  assert.match(r.text, /\[\^source_id\]/);
  assert.match(r.text, /<untrusted source_id="s1"/);
  assert.ok(r.hash.length === 16);
});

test('prompts: a version ramp is stable for one principal and spread across many', () => {
  const prompts = new PromptStore();
  const a = prompts.resolveVersion('atlas-guide', 1, 'ananya');
  const b = prompts.resolveVersion('atlas-guide', 1, 'ananya');
  assert.equal(a, b, 'the same person does not flip versions between turns');
  assert.equal(a, 1, 'the shipped ramp is 100% v1');
});
