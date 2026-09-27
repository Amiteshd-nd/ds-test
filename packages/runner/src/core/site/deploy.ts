/**
 * Publishing a version.
 *
 * The gate here is the one PRD section 3 lists as a non-goal for v1: "fully
 * autonomous irreversible actions (sending, publishing, spending always need
 * approval)". Publishing to a public host is irreversible in the way that
 * matters - the URL is out, and search engines and other people's caches do not
 * un-see it - so the agent cannot do it on its own.
 *
 * Publishing *locally* is not irreversible and not public, so it does not need
 * the gate. That difference is the provider's `name`, and it is the whole of
 * the policy below. Phase 3 generalises this into the approvals table for every
 * outward-facing action; the row this writes is already the right shape.
 */

import { existsSync } from 'node:fs';

import type { ToolContext, ToolResult } from '../agent/tools.ts';
import { deployProvider } from '../providers/registry.ts';
import { distDir, latestVersion, recordDeployment } from './workspace.ts';

export async function deploySite(
  version: number | null,
  ctx: ToolContext,
): Promise<ToolResult> {
  const latest = await latestVersion(ctx.projectId);
  if (!latest) {
    return { content: 'There is no built site to publish yet.', is_error: true };
  }

  const target = version ?? latest.version;
  const dir = distDir(ctx.projectId, target);
  if (!existsSync(dir)) {
    return { content: `Version ${target} has no build to publish.`, is_error: true };
  }

  let provider;
  try {
    provider = deployProvider();
  } catch (err) {
    return {
      content: err instanceof Error ? err.message : String(err),
      is_error: true,
    };
  }

  // A public host means asking first. The approval row is written before the
  // question, so a "yes" that arrives after a crash is still attributable.
  if (provider.name !== 'local') {
    const approval = ctx.deps.store.createApproval(ctx.taskId, 'site_deploy', {
      project_id: ctx.projectId,
      version: target,
      provider: provider.name,
    });

    const answer = await ctx.askUser(
      `Publish version ${target} of the site to ${provider.name}? It becomes publicly reachable ` +
        'at a URL anyone can open, and taking it down again is a separate step. Reply "yes" to publish.',
    );

    const approved = /^\s*(y|yes|ok|go ahead|publish|do it)\b/i.test(answer);
    ctx.deps.store.decideApproval(approval.id, approved ? 'approved' : 'rejected');
    if (!approved) {
      return { content: `Not published. The owner said: "${answer}"`, meta: { approved: false } };
    }
  }

  let result;
  try {
    result = await provider.deploy(ctx.projectId, dir);
  } catch (err) {
    return {
      content: `Publishing failed: ${err instanceof Error ? err.message : String(err)}`,
      is_error: true,
    };
  }

  await recordDeployment(ctx.projectId, target, result.public_url);
  ctx.run.emit({ type: 'site.deployed', version: target, url: result.public_url, provider: provider.name });

  const caveat =
    provider.name === 'local'
      ? ' This URL is served by Runner on this machine. It is not public, and it stops working ' +
        'when Runner stops. Say so when you report it.'
      : '';

  return {
    content: `Version ${target} is published at ${result.public_url}.${caveat}`,
    meta: { url: result.public_url, version: target, provider: provider.name },
  };
}
