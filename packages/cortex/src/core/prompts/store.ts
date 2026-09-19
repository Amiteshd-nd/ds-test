// Prompts are product surface, and are treated like code with a release process.
// PRD §7.
//
// Four rules are enforced here rather than documented:
//   1. Rendering with an undefined variable raises. It never silently emits "".
//   2. Shared fragments live in prompts/_shared and are {% include %}-ed, so one edit to
//      the safety rules propagates to every agent.
//   3. An agent pins id@version; rollout is a percentage ramp, so a bad prompt cannot
//      reach every user at once.
//   4. No prompt strings in code — scripts/lint-boundaries.mjs fails the build on a
//      string literal over 200 characters anywhere in src/core.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import nunjucks from 'nunjucks';
import yaml from 'js-yaml';
import { loadConfig } from '../config/config.ts';

export interface PromptMeta {
  id: string;
  version: number;
  owner: string;
  /** The variable contract. Rendering without one of these fails loudly. */
  variables: string[];
  model_hint?: string;
  changelog?: string;
}

export interface RenderedPrompt {
  id: string;
  version: number;
  text: string;
  /** Traces carry the hash in production and the text in development (§7.5). */
  hash: string;
}

/**
 * One Jinja environment per prompt directory. A second host has its own prompts and its
 * own shared fragments, and a single shared loader would resolve one host's
 * `{% include "_shared/safety.j2" %}` against the other host's file.
 */
const environments = new Map<string, nunjucks.Environment>();

function environmentFor(dir: string): nunjucks.Environment {
  let env = environments.get(dir);
  if (!env) {
    env = new nunjucks.Environment(new nunjucks.FileSystemLoader(dir, { noCache: true }), {
      autoescape: false,
      throwOnUndefined: true,
    });
    environments.set(dir, env);
  }
  return env;
}

export class PromptStore {
  readonly dir: string;

  constructor(dir = loadConfig().resolved.prompts) {
    this.dir = dir;
  }

  meta(id: string, version: number): PromptMeta {
    const file = path.join(this.dir, id, `v${version}`, 'meta.yaml');
    if (!fs.existsSync(file)) throw new Error(`prompt ${id}@${version}: meta.yaml is missing`);
    return yaml.load(fs.readFileSync(file, 'utf8')) as PromptMeta;
  }

  /**
   * §7.3 — resolve `id@version` through the config ramp. A pinned version that is not in
   * the ramp is used as-is; that is how you test v4 before it has traffic.
   */
  resolveVersion(id: string, pinned: number, principalId: string): number {
    const ramp = loadConfig().prompt_ramp?.[id];
    if (!ramp) return pinned;
    const versions = Object.entries(ramp).sort((a, b) => Number(a[0]) - Number(b[0]));
    // Stable per principal: the same user does not flip between prompt versions
    // between turns of one conversation.
    const bucket = Number.parseInt(crypto.createHash('sha1').update(id + principalId).digest('hex').slice(0, 8), 16) % 100;
    let acc = 0;
    for (const [version, pct] of versions) {
      acc += pct;
      if (bucket < acc) return Number(version);
    }
    return pinned;
  }

  render(id: string, version: number, vars: Record<string, unknown>): RenderedPrompt {
    const meta = this.meta(id, version);
    const missing = meta.variables.filter((v) => !(v in vars));
    if (missing.length) {
      throw new Error(`prompt ${id}@${version}: missing declared variables ${missing.join(', ')}`);
    }
    const text = environmentFor(this.dir).render(path.join(id, `v${version}`, 'system.j2'), vars).trim();
    return { id, version, text, hash: crypto.createHash('sha256').update(text).digest('hex').slice(0, 16) };
  }

  list(): { id: string; versions: number[] }[] {
    if (!fs.existsSync(this.dir)) return [];
    return fs
      .readdirSync(this.dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
      .map((d) => ({
        id: d.name,
        versions: fs
          .readdirSync(path.join(this.dir, d.name))
          .filter((v) => /^v\d+$/.test(v))
          .map((v) => Number(v.slice(1)))
          .sort((a, b) => a - b),
      }));
  }
}
