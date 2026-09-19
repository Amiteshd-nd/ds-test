import type { InvocationContext, SkillManifest, SkillResult } from './types.ts';

/**
 * Adapter 5 of 8 — the host's APIs as callable tools. PRD §5.3.
 *
 * `listSkills` returns manifests, not functions: the registry validates, lints, and
 * similarity-checks them before a model ever sees one (§6.2).
 */
export interface SkillAdapter {
  listSkills(): Promise<SkillManifest[]>;
  invoke(skillId: string, args: Record<string, unknown>, ctx: InvocationContext): Promise<SkillResult>;
}
