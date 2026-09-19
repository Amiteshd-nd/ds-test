// `node scripts/init.ts <host-id>` — PRD §17.1.
//
// Scaffolds a host: the eight adapter implementations (as stubs that compile and fail
// honestly), a config, one read-only skill, one agent, one prompt, and a checklist.
//
// It is deliberately not interactive. The PRD sketches a questionnaire — "do you have an
// OpenAPI spec? a search backend? messaging?" — and the answers only decide which stub
// to write. Writing every stub with the question in a comment above it takes the same
// five minutes and leaves the decision where someone can see it was made.
//
// What it will not do is pretend the hard part is scaffolding. docs/SECOND-HOST.md is
// the honest account: the files are an afternoon, and the permission model is the job.

import fs from 'node:fs';
import path from 'node:path';
import { PACKAGE_ROOT } from '../src/core/config/config.ts';

const id = process.argv[2];
if (!id || !/^[a-z][a-z0-9-]{1,30}$/.test(id)) {
  process.stderr.write('usage: node scripts/init.ts <host-id>      (lowercase, e.g. "harbor")\n');
  process.exit(1);
}

const Name = id[0].toUpperCase() + id.slice(1);
const root = path.join(PACKAGE_ROOT, 'hosts', id);
if (fs.existsSync(root)) {
  process.stderr.write(`hosts/${id} already exists. Pick another id or delete it.\n`);
  process.exit(1);
}

const files: Record<string, string> = {};

files[`${id}.ts`] = `// ${Name} — the host CORTEX is installed into.
//
// This file is the entire integration surface. Nothing in src/core imports it, and the
// module-boundary lint fails the build if that ever stops being true.
//
// Work through the TODOs in order. The second one is the job; the rest are an afternoon.

import type {
  Decision, Document, EntityRef, InvocationContext, Principal, SkillManifest, SkillResult,
} from '../../src/core/adapters/index.ts';
import type { IdentityAdapter } from '../../src/core/adapters/identity.ts';
import type { PolicyAdapter } from '../../src/core/adapters/policy.ts';
import type { SkillAdapter } from '../../src/core/adapters/skill.ts';

export const hostName = '${Name}';

const unimplemented = (what: string): never => {
  throw new Error(\`${Name}: \${what} is not implemented yet. See hosts/${id}/CHECKLIST.md\`);
};

// -- 1. Identity — who is asking -------------------------------------------
//
// TODO: resolve your own session token or API key. Return null for anything you do not
// recognise; a bad token must never resolve to a default user.
//
// \`entitlements\` returns capability strings ("tickets:read"), not roles. If your model is
// roles, expand them here — that mapping is the adapter's job, not core's.

export const identity: IdentityAdapter & { resolvePrincipal(id: string): Promise<Principal | null> } = {
  async resolve(sessionToken) {
    void sessionToken;
    return unimplemented('identity.resolve');
  },
  async entitlements(principal) {
    void principal;
    return unimplemented('identity.entitlements');
  },
  // Not part of the interface, but durable background runs need it: a run resumed days
  // later has no session to resolve. A host that cannot answer this cannot have them.
  async resolvePrincipal(principalId) {
    void principalId;
    return unimplemented('identity.resolvePrincipal');
  },
};

// -- 2. Policy — THE ONE THAT MATTERS --------------------------------------
//
// TODO: answer "can this principal read these refs" for a whole array, in one pass.
//
// Batched is not a style preference. Retrieval filters hundreds of candidates per turn,
// and a per-ref implementation makes the retrieval-time filter slow enough that somebody
// eventually proposes moving it to render time. That move is the end of the security
// model. The conformance suite asserts 200 refs inside 150ms for exactly this reason.
//
// Answer in the same order you were asked. A misaligned array leaks one record and hides
// another, and nothing about the symptom points at the cause.

export const policy: PolicyAdapter = {
  async canRead(principal, refs) {
    void principal;
    void refs;
    return unimplemented('policy.canRead');
  },
  async canInvoke(principal, skillId, args): Promise<Decision> {
    void principal; void skillId; void args;
    return unimplemented('policy.canInvoke');
  },
  // Applied on memory reads too: an entitlement can be revoked after a fact was written.
  async redact(principal, doc) {
    void principal;
    return doc;
  },
};

// -- 3. Retrieval ----------------------------------------------------------
//
// TODO: either wrap your search backend, or hand \`documents\` below to the bundled
// LocalRetrieval in index.ts and delete this comment. Chunk ids must be stable across
// identical searches — citations are ids, and an id that moves cannot be cited.

export const documents: Document[] = [
  // TODO: everything this host can ground on, as { ref, type, title, body }.
];

// -- 4. Graph — optional ---------------------------------------------------
//
// Leave it out unless your data has real relationships worth traversing. It is the
// highest-value adapter after policy when it fits and a liability when it does not:
// \`doctor\` measures ownership coverage, orphan rate, and neighbourhood size, and a messy
// graph produces a confidently wrong agent.

// -- 5. Skills — your APIs as tools ----------------------------------------
//
// TODO: one handler per skill manifest in manifests/skills/. Start read-only. The registry
// refuses to load a side-effecting manifest until features.write_skills.enabled is on, and
// that flag is off until your read-only evals pass.

const handlers: Record<string, (args: Record<string, unknown>, ctx: InvocationContext) => Promise<SkillResult>> = {};

export const skills: SkillAdapter = {
  async listSkills(): Promise<SkillManifest[]> {
    // Manifests in manifests/skills/ are the source of truth. Return [] unless you
    // generate them from an OpenAPI spec at runtime.
    return [];
  },
  async invoke(skillId, args, ctx) {
    const handler = handlers[skillId];
    // A model will ask for a tool that does not exist. That is a bad answer, not a crash.
    if (!handler) return { ok: false, error: { kind: 'not_found', message: \`${Name} has no handler for \${skillId}\` } };
    return handler(args, ctx);
  },
};

export type { EntityRef };
`;

files['index.ts'] = `// ${Name}'s adapter set.
//
// Adapters 6 and 7 — memory and transport — take the bundled defaults. Swap them when you
// have somewhere better to put them: a host with messaging infrastructure that already has
// FIFO ordering, retries, and history should back the transport with it and delete a
// quarter of this problem.

import type { HostAdapters } from '../../src/core/adapters/index.ts';
import type { CortexConfig } from '../../src/core/config/config.ts';
import type { RunStore } from '../../src/core/runtime/store.ts';
import { InProcessTransport } from '../../src/core/runtime/transport.ts';
import { SqliteMemory } from '../../src/core/memory/sqlite-memory.ts';
import { LocalRetrieval } from '../../src/core/grounding/local-retrieval.ts';
import { documents, hostName, identity, policy, skills } from './${id}.ts';

export function create${Name}Adapters(store: RunStore, config: CortexConfig): HostAdapters {
  return {
    identity,
    policy,
    retrieval: new LocalRetrieval(documents),
    skills,
    memory: new SqliteMemory(store, {
      turnTtlDays: config.memory.turn_ttl_days,
      minObservations: config.memory.preference_min_observations,
    }),
    transport: new InProcessTransport(store),
  };
}

export const createAdapters = create${Name}Adapters;

/**
 * The fixture \`doctor\` runs the conformance suite with. Fill it in as soon as you have
 * two principals and one record they disagree about — that disagreement is the whole
 * security model, and this is where it gets checked.
 */
export async function conformanceFixture() {
  return {
    principal: await identity.resolvePrincipal('TODO-a-principal-id'),
    otherPrincipal: await identity.resolvePrincipal('TODO-another-principal-id'),
    readableRef: 'TODO:a-ref-the-first-may-read',
    forbiddenRef: 'TODO:a-ref-they-may-not',
    query: 'TODO: a query that should return something',
  };
}

export { hostName };
export * from './${id}.ts';
`;

files['server.ts'] = `// ${Name}'s service entry. This is the whole of what it takes to stand it up.

import { loadConfig } from '../../src/core/config/config.ts';
import { createService } from '../../src/server/service.ts';
import { create${Name}Adapters, hostName } from './index.ts';

const service = createService({
  config: loadConfig(path.join(import.meta.dirname, 'cortex.config.yaml')),
  hostName,
  createAdapters: create${Name}Adapters,
});

await service.listen();
`.replace('import { loadConfig }', "import path from 'node:path';\nimport { loadConfig }");

files['cortex.config.yaml'] = `# ${Name}'s deployment configuration.
#
# Pick a port outside the 4xxx and 5xxx ranges — a repo rule, see the root CLAUDE.md.

host:
  id: ${id}
  tenancy: single

paths:
  manifests: manifests
  prompts: prompts
  evals: evals

server:
  port: 6190            # TODO: pick one nothing else uses
  cors_origin: http://localhost:6181

router:
  classes:
    reasoning.balanced:
      primary: { provider: anthropic, model: claude-sonnet-5 }
      fallback:
        - { provider: rehearsal, model: extractive-v1 }
    fast.cheap:
      primary: { provider: anthropic, model: claude-haiku-4-5-20251001 }
      fallback:
        - { provider: rehearsal, model: extractive-v1 }
    embed.default:
      primary: { provider: local, model: lexical-hash-v1 }
  policies:
    - if: "run.surface == 'background'"
      prefer_class: fast.cheap
    - if: "step.retry_count >= 1"
      escalate_class: true

budgets:
  max_cost_usd_per_run: 0.10
  max_cost_usd_per_principal_per_day: 3.00
  max_steps_per_run: 20

storage:
  dsn: file:./.cortex/${id}.db

grounding:
  max_context_tokens: 6000
  rerank_class: fast.cheap
  k_initial: 24
  k_final: 8
  # TODO: re-tune these for your corpus rather than inheriting them. They are calibrated
  # to whatever sits behind RetrievalAdapter, and the wrong floor either admits noise or
  # cuts every result on a narrow question.
  min_score: 0.3
  min_score_ratio: 0.35

memory:
  turn_ttl_days: 180
  preference_min_observations: 2

telemetry:
  exporter: store
  hash_principal_ids: true
  mode: development
  payloads: full
  retention_days_development: 30
  retention_days_production: 7

features:
  orchestration.dynamic: false
  surfaces.enabled: [chat, background]
  write_skills.enabled: false

prompt_ramp:
  ${id}-assistant: { "1": 100 }
`;

files['CHECKLIST.md'] = `# Integrating ${Name}

Work in this order. It is the order things break in if you do not.

## 1. Before you write any code

Answer these about your real codebase, in writing, in this file:

- **Auth** — how is the current user resolved? What entitlement or role model exists?
- **Permissions** — is there a central authorization service, and **can it answer "can
  this principal read these 200 ids?" in one call?** If not, building that is the first
  task, ahead of anything here.
- **Data** — what are the core entity types and the relationships between them?
- **Search** — is there a backend? Is anything vectorised?
- **APIs** — OpenAPI, GraphQL, or internal clients only?
- **Design system** — what package, what tokens, what primitives?
- **Messaging** — do you have one with FIFO ordering, retries, and history? If yes, back
  the transport with it and save two weeks.

## 2. Implement, in this order

- [ ] \`identity.resolve\` and \`entitlements\`
- [ ] \`policy.canRead\` — **batched, order-preserving, fast**
- [ ] \`policy.canInvoke\` and \`redact\`
- [ ] \`documents\` (or wrap your own search behind \`RetrievalAdapter\`)
- [ ] \`node ../../scripts/doctor.ts\` — fix everything red before continuing

## 3. One agent

- [ ] A read-only skill manifest. The description must say when to use it **and when not
      to**; the registry rejects it otherwise.
- [ ] An agent manifest naming that skill.
- [ ] A prompt in \`prompts/\`, with \`meta.yaml\` declaring its variables.
- [ ] \`CORTEX_CONFIG=hosts/${id}/cortex.config.yaml node ../../evals/runner/run.ts\`

## 4. Before anyone sees it

- [ ] At least twenty golden cases drawn from questions your users actually ask.
- [ ] A red-team suite. Start by copying the shapes in \`evals/redteam/\` and rewriting
      them against your own permission model — a case that cannot reach your rules is a
      case that proves nothing.
- [ ] \`doctor\` green.

## 5. Only then

- [ ] Write skills, once the read-only evals pass. Flip \`write_skills.enabled\`.
- [ ] Every side-effecting skill needs an agent with a matching approval gate. The
      validator fails the build without one.

---

Read \`docs/SECOND-HOST.md\` first. It is the honest account of what integrating a second
host actually cost, including the two bugs the conformance suite caught that nothing else
would have.
`;

fs.mkdirSync(path.join(root, 'manifests/skills'), { recursive: true });
fs.mkdirSync(path.join(root, 'manifests/agents'), { recursive: true });
fs.mkdirSync(path.join(root, 'manifests/rules'), { recursive: true });
fs.mkdirSync(path.join(root, `prompts/${id}-assistant/v1`), { recursive: true });
fs.mkdirSync(path.join(root, 'prompts/_shared'), { recursive: true });
fs.mkdirSync(path.join(root, 'evals/golden'), { recursive: true });
fs.mkdirSync(path.join(root, 'evals/redteam'), { recursive: true });

for (const [name, body] of Object.entries(files)) {
  fs.writeFileSync(path.join(root, name), body);
}

process.stdout.write(
  `\nCreated hosts/${id}/\n` +
    `  ${id}.ts              the eight adapters — start at TODO 2, it is the job\n` +
    `  index.ts             assembles them\n` +
    `  server.ts            the service entry\n` +
    `  cortex.config.yaml   ports, budgets, router classes, feature flags\n` +
    `  CHECKLIST.md         the order to do it in\n` +
    `  manifests/ prompts/ evals/\n\n` +
    `Next:\n` +
    `  CORTEX_CONFIG=hosts/${id}/cortex.config.yaml node scripts/doctor.ts\n\n` +
    `It will be red. That is the point: doctor tells you what is missing before you\n` +
    `write an agent, rather than after.\n`,
);
