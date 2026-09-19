// The developer playground. PRD §16.4.
//
// Prototype an agent without deploying it: see the context that would be assembled,
// impersonate a principal to test identity and authorization rules, and diff two prompt
// versions on the same input. The PRD credits the equivalent with a large share of a
// platform team's velocity, and says to build it in M3 rather than "later" — so it is
// here, in the same slice as the chat surface.
//
// Everything it returns is read-only and goes through the same adapters as a real run.
// An impersonated principal really is that principal: if the playground can see a
// document the impersonated user cannot, that is a permission bug and this is where you
// would find it.

import type { HostAdapters } from '../adapters/index.ts';
import type { Chunk, MemoryBundle, Principal } from '../adapters/types.ts';
import type { AgentRegistry } from '../agents/registry.ts';
import type { SkillRegistry } from '../skills/registry.ts';
import type { CortexConfig } from '../config/config.ts';
import { GroundingPipeline } from '../grounding/pipeline.ts';
import { MemoryService } from '../memory/service.ts';
import { PromptStore } from '../prompts/store.ts';
import { EmbeddingSelector } from '../skills/selector.ts';
import type { SkillChoice } from '../skills/selector.ts';

export interface ContextInspection {
  agent: { id: string; version: number; promptId: string; promptVersion: number };
  principal: { id: string; type: string; entitlements: string[] };
  memory: MemoryBundle;
  chunks: Chunk[];
  filteredCount: number;
  rewrittenQuery: string;
  skillsVisible: string[];
  skillsThatWouldRun: SkillChoice[];
  prompt: { text: string; hash: string; tokensEstimated: number };
}

export interface PromptDiff {
  id: string;
  a: number;
  b: number;
  lines: { kind: 'same' | 'added' | 'removed'; text: string }[];
}

export class Playground {
  readonly config: CortexConfig;
  readonly adapters: HostAdapters;
  readonly agents: AgentRegistry;
  readonly skills: SkillRegistry;
  readonly prompts: PromptStore;
  readonly hostName: string;

  constructor(config: CortexConfig, adapters: HostAdapters, agents: AgentRegistry, skills: SkillRegistry, prompts: PromptStore, hostName: string) {
    this.config = config;
    this.adapters = adapters;
    this.agents = agents;
    this.skills = skills;
    this.prompts = prompts;
    this.hostName = hostName;
  }

  async context(agentId: string, principal: Principal, question: string): Promise<ContextInspection> {
    const agent = this.agents.get(agentId);
    const entitlements = await this.adapters.identity.entitlements(principal);

    const memoryService = new MemoryService(this.adapters.memory, this.adapters.policy);
    const memory = await memoryService.assemble({
      principal,
      threadId: null,
      question,
      turns: agent.memory.session.turns,
      semanticRecall: agent.memory.session.semanticRecall,
      readKeys: agent.memory.profile.read,
      budgetTokens: Math.floor(agent.grounding.maxContextTokens * 0.15),
    });

    const grounding = new GroundingPipeline(this.adapters.retrieval, this.adapters.policy, this.config, this.adapters.graph);
    const grounded = await grounding.run({
      question,
      principal,
      runId: 'playground',
      sources: agent.grounding.sources,
      graph: agent.grounding.graph,
      maxContextTokens: agent.grounding.maxContextTokens,
    });

    const visible = this.skills.visibleTo(agent.skills, entitlements);
    const would = await new EmbeddingSelector().select(question, visible);

    const version = this.prompts.resolveVersion(agent.prompt.id, agent.prompt.version, principal.id);
    // The real host name, because a prompt inspected with a placeholder in it is a
    // prompt you have not actually read.
    const rendered = this.prompts.render(agent.prompt.id, version, {
      host_name: this.hostName,
      locale: principal.locale,
      principal_name: principal.id,
      principal_type: principal.type,
      principal_tz: principal.tz,
      memory: memory.items,
      sources: grounded.chunks,
      question,
    });

    return {
      agent: { id: agent.id, version: agent.version, promptId: rendered.id, promptVersion: rendered.version },
      principal: { id: principal.id, type: principal.type, entitlements: [...entitlements] },
      memory,
      chunks: grounded.chunks,
      filteredCount: grounded.filteredCount,
      rewrittenQuery: grounded.rewritten,
      skillsVisible: visible.map((s) => s.id),
      skillsThatWouldRun: would,
      prompt: { text: rendered.text, hash: rendered.hash, tokensEstimated: Math.ceil(rendered.text.length / 4) },
    };
  }

  /** Two prompt versions, side by side, on the same input. A plain LCS line diff. */
  promptDiff(id: string, a: number, b: number): PromptDiff {
    const vars = sampleVars();
    const left = this.prompts.render(id, a, vars).text.split('\n');
    const right = this.prompts.render(id, b, vars).text.split('\n');
    return { id, a, b, lines: diffLines(left, right) };
  }
}

/** Placeholder values, so a diff shows prompt structure rather than one user's data. */
function sampleVars(): Record<string, unknown> {
  return {
    host_name: 'HOST',
    locale: 'en',
    principal_name: 'PRINCIPAL',
    principal_type: 'member',
    principal_tz: 'UTC',
    memory: [{ kind: 'fact', text: 'EXAMPLE MEMORY' }],
    sources: [{ sourceId: 's1', ref: 'doc:example', title: 'EXAMPLE SOURCE', text: 'EXAMPLE TEXT' }],
    question: 'EXAMPLE QUESTION',
  };
}

export function diffLines(a: string[], b: string[]): PromptDiff['lines'] {
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out: PromptDiff['lines'] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ kind: 'same', text: a[i] }); i++; j++; }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) { out.push({ kind: 'removed', text: a[i] }); i++; }
    else { out.push({ kind: 'added', text: b[j] }); j++; }
  }
  while (i < n) out.push({ kind: 'removed', text: a[i++] });
  while (j < m) out.push({ kind: 'added', text: b[j++] });
  return out;
}
