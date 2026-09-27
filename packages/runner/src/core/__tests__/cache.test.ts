import { describe, expect, it } from 'vitest';

import { BUILDER_PROMPT, ORCHESTRATOR_PROMPT, taskContext } from '../agent/prompt.ts';
import { toolDefinitions, ORCHESTRATOR_TOOLS, describeTool } from '../agent/tools.ts';
import { BUILDER_TOOLS } from '../site/builder.ts';
import { SLIDES_TOOLS } from '../slides/agent.ts';
import { GROWTH_TOOLS } from '../growth/agent.ts';
import { cacheHitRate, emptyUsage } from '../types.ts';

/**
 * These are the tests that protect the cache hit rate. Every one of them guards
 * a change that would look harmless in review and silently cost 10x on input
 * tokens (PRD section 4: >= 70%).
 */
describe('the cacheable prefix', () => {
  it('holds nothing that varies between requests', () => {
    // A date, a time, a uuid or a counter at the top of the system prompt
    // invalidates the whole prefix on every single request.
    expect(ORCHESTRATOR_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(ORCHESTRATOR_PROMPT).not.toMatch(/\b\d{2}:\d{2}\b/);
    expect(ORCHESTRATOR_PROMPT).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
    expect(ORCHESTRATOR_PROMPT).not.toMatch(/step \d+ of \d+/i);
  });

  it('holds nothing that varies in the builder prompt either', () => {
    // The builder runs the same way and pays the same price for a broken
    // prefix. The template's own rules go in the first user message, after the
    // breakpoint, precisely so this string can stay frozen while the template
    // changes.
    expect(BUILDER_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(BUILDER_PROMPT).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
    expect(BUILDER_PROMPT).not.toContain('Halstead');
  });

  it('serialises the tool list in a stable order', () => {
    for (const set of [ORCHESTRATOR_TOOLS, BUILDER_TOOLS, SLIDES_TOOLS, GROWTH_TOOLS]) {
      const first = JSON.stringify(toolDefinitions(set));
      const second = JSON.stringify(toolDefinitions(set));
      expect(first).toBe(second);

      const names = toolDefinitions(set).map((t) => t.name);
      expect(names).toEqual([...names].sort());
    }
  });

  it('keeps per-task context out of the system prompt', () => {
    const context = taskContext({
      goal: 'build a site',
      business: 'Business: Pallister Plumbing\nWhat they do: boiler servicing',
      workdir: '/home/user',
    });
    expect(context).toContain('Pallister Plumbing');
    expect(ORCHESTRATOR_PROMPT).not.toContain('Pallister');
  });
});

describe('cacheHitRate', () => {
  it('is zero when nothing has been read from cache', () => {
    expect(cacheHitRate({ ...emptyUsage(), input_tokens: 100 })).toBe(0);
  });

  it('counts cache writes as a miss, because they were billed as one', () => {
    // 1000 written + 0 read on the first request of a task is a 0% hit rate,
    // not 100%. Getting this backwards would make the metric always look good.
    const rate = cacheHitRate({
      ...emptyUsage(),
      cache_creation_input_tokens: 1000,
      input_tokens: 0,
    });
    expect(rate).toBe(0);
  });

  it('reports the read share of total input', () => {
    const rate = cacheHitRate({
      ...emptyUsage(),
      input_tokens: 250,
      cache_read_input_tokens: 750,
    });
    expect(rate).toBe(0.75);
  });

  it('does not divide by zero', () => {
    expect(cacheHitRate(emptyUsage())).toBe(0);
  });
});

describe('the tool registry', () => {
  it('namespaces every tool by prefix', () => {
    // `search_web` and `read_page` are the researcher's, and are built per run
    // because each closes over that run's citation numbering.
    const families =
      /^(shell|file|site|slides|growth|memory|research|search|read|browser|deploy|image|ask)_/;
    for (const tool of [...ORCHESTRATOR_TOOLS, ...BUILDER_TOOLS, ...SLIDES_TOOLS, ...GROWTH_TOOLS]) {
      expect(tool.name).toMatch(families);
    }
  });

  it('gives each agent its own fixed set', () => {
    // The builder has no shell and no way to ask the owner anything: it works
    // inside one directory and hands its result back to whoever called it.
    const builder = BUILDER_TOOLS.map((t) => t.name);
    expect(builder).not.toContain('shell_exec');
    expect(builder).not.toContain('ask_user');
    expect(builder).toContain('site_build');

    // And the orchestrator cannot reach into the site project itself.
    const orchestrator = ORCHESTRATOR_TOOLS.map((t) => t.name);
    expect(orchestrator).not.toContain('site_build');
    expect(orchestrator).toContain('site_create');
  });

  it('categorises an unregistered tool by its family prefix', () => {
    // A tool added in a later phase must land in the right UI group without
    // this file changing.
    expect(describeTool('browser_navigate').category).toBe('web');
    expect(describeTool('deploy_preview').category).toBe('deploy');
    expect(describeTool('memory_forget').category).toBe('memory');
    expect(describeTool('slides_export').category).toBe('slides');
  });

  it('gives every tool a description the model can act on', () => {
    for (const tool of [
      ...ORCHESTRATOR_TOOLS,
      ...BUILDER_TOOLS,
      ...SLIDES_TOOLS,
      ...GROWTH_TOOLS,
    ]) {
      expect(tool.description.length).toBeGreaterThan(40);
    }
  });
});
