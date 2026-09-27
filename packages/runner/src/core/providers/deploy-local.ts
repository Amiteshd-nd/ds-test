/**
 * "Deploy" to this machine.
 *
 * The site is copied to `.runner/deployments/<slug>/` and served by this app at
 * `/s/<slug>/`. That is a real, stable, openable URL, and it is not a public
 * one. Nothing here reaches the internet.
 *
 * It exists so the whole flow - build, check, choose a version, publish, get a
 * link back, record it against the version - is exercisable end to end without
 * an account. PRD rule 7 says ask the owner before deploying anything publicly,
 * and they have not been asked. The Cloudflare adapter beside this one is what
 * they would switch to.
 *
 * The UI labels this "local, not public" wherever it shows the URL. A link that
 * looks live and is not is a worse outcome than no link.
 */

import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

import type { DeployProvider, DeployResult } from './interfaces.ts';

export function deploymentsRoot(): string {
  return path.join(process.cwd(), '.runner', 'deployments');
}

export function deploymentDir(slug: string): string {
  return path.join(deploymentsRoot(), slug);
}

export class LocalDeployProvider implements DeployProvider {
  readonly name = 'local';

  private readonly origin: string;

  constructor(origin = process.env.RUNNER_ORIGIN ?? 'http://localhost:6184') {
    this.origin = origin;
  }

  async deploy(projectId: string, dir: string): Promise<DeployResult> {
    const slug = slugFor(projectId);
    const target = deploymentDir(slug);

    // Replace rather than merge: a stale file from the previous version that no
    // longer exists in this one would still be served.
    await rm(target, { recursive: true, force: true });
    await mkdir(target, { recursive: true });
    await cp(dir, target, { recursive: true });

    return {
      public_url: `${this.origin}/s/${slug}/`,
      deployment_id: `local:${slug}:${Date.now()}`,
    };
  }
}

/** Stable per project, so redeploying keeps the same URL. */
export function slugFor(projectId: string): string {
  return projectId.replace(/[^a-z0-9]/gi, '').slice(0, 12).toLowerCase() || 'site';
}
