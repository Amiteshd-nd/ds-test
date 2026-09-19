// Choosing which skill to call, and with what arguments.
//
// §8.3 says to prefer a provider's native structured-output/tool-calling API over
// "respond in JSON" prompting, and to validate against the schema and retry once with
// the validation error appended before failing. That is `ModelSelector`.
//
// `EmbeddingSelector` is the floor: deterministic, offline, and honest about its ceiling.
// It can match a question to a skill by description, and it can fill exactly one kind of
// argument — a single required string property the manifest has marked
// `x_fill_from_question`. Anything richer needs a model, and it declines rather than
// guessing, because a skill invoked with invented arguments is worse than a skill that
// was not invoked at all.

import type { SkillManifest } from '../adapters/types.ts';
import type { Router, RouteContext } from '../router/router.ts';
import { cosine, embedText } from '../router/providers/local.ts';
import { describeIssues, validateAgainstSchema } from './schema.ts';

export interface SkillChoice { skillId: string; args: Record<string, unknown>; why: string }

export interface SkillSelector {
  select(question: string, skills: SkillManifest[]): Promise<SkillChoice[]>;
}

export class EmbeddingSelector implements SkillSelector {
  readonly threshold: number;

  constructor(threshold = 0.3) {
    this.threshold = threshold;
  }

  async select(question: string, skills: SkillManifest[]): Promise<SkillChoice[]> {
    if (skills.length === 0) return [];
    const q = embedText(question);
    const scored = skills
      .map((s) => ({ skill: s, score: cosine(q, embedText(`${s.name}. ${s.description}`)) }))
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    if (!best || best.score < this.threshold) return [];

    const args = fillSingleStringArg(best.skill, question);
    if (!args) return [];
    return [{ skillId: best.skill.id, args, why: `matched "${best.skill.name}" on description similarity ${best.score.toFixed(2)}` }];
  }
}

function fillSingleStringArg(skill: SkillManifest, question: string): Record<string, unknown> | null {
  const required = skill.inputSchema.required ?? [];
  if (required.length !== 1) return null;
  const name = required[0];
  const prop = skill.inputSchema.properties?.[name];
  // The annotation is the consent. `decisions.history` takes a `ref`, which is also a
  // single required string — filling it with the question would produce a confident
  // lookup of an entity that does not exist.
  if (!prop || prop.type !== 'string' || !prop.x_fill_from_question) return null;
  return { [name]: question.slice(0, prop.maxLength ?? 300) };
}

export class ModelSelector implements SkillSelector {
  readonly router: Router;
  readonly ctx: RouteContext;
  readonly modelClass: string;
  readonly fallback: SkillSelector;

  constructor(router: Router, ctx: RouteContext, modelClass: string, fallback: SkillSelector = new EmbeddingSelector()) {
    this.router = router;
    this.ctx = ctx;
    this.modelClass = modelClass;
    this.fallback = fallback;
  }

  async select(question: string, skills: SkillManifest[]): Promise<SkillChoice[]> {
    if (skills.length === 0) return [];
    // Nothing here is a prompt in the §7 sense — it is a schema description of the
    // available tools, generated from the manifests, and it is under the 200-character
    // literal ceiling that scripts/lint-boundaries.mjs enforces.
    const catalogue = skills
      .map((s) => `- ${s.id}: ${s.description}\n  input: ${JSON.stringify(s.inputSchema)}`)
      .join('\n');

    const ask = [question, '', 'TOOLS', catalogue, '', 'Reply with JSON: {"calls":[{"skill":"<id>","args":{...}}]}. Empty list if none apply.'].join('\n');

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await this.router.text(this.modelClass, { messages: [{ role: 'user', content: ask }], maxTokens: 400 }, { ...this.ctx, retryCount: attempt });
        const parsed = JSON.parse(extractJson(result.text)) as { calls?: { skill: string; args: Record<string, unknown> }[] };
        const out: SkillChoice[] = [];
        for (const call of parsed.calls ?? []) {
          const skill = skills.find((s) => s.id === call.skill);
          if (!skill) continue;
          const issues = validateAgainstSchema(call.args ?? {}, skill.inputSchema);
          if (issues.length) throw new Error(describeIssues(issues));
          out.push({ skillId: skill.id, args: call.args, why: 'selected by model' });
        }
        return out;
      } catch {
        // One retry, then the deterministic floor rather than no grounding at all.
      }
    }
    return this.fallback.select(question, skills);
  }
}

function extractJson(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  return start >= 0 && end > start ? text.slice(start, end + 1) : '{}';
}
