/**
 * Cloudflare Pages, through Wrangler.
 *
 * **Status: written, not exercised.** No Cloudflare account has been
 * authorised (PRD section 0, rule 7), so nothing here has run against the real
 * service.
 *
 * It shells out to `wrangler pages deploy` rather than calling the direct
 * upload API. The API path is three calls with a content-hash manifest and a
 * separate upload step; Wrangler is the documented interface, it handles the
 * manifest, and writing the three-call version from the docs without being able
 * to run it would produce more speculative code, not less.
 *
 * The cost is a dependency on a binary rather than a package, which is why this
 * checks for it and says what to install.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { DeployProvider, DeployResult } from './interfaces.ts';
import { slugFor } from './deploy-local.ts';

const run = promisify(execFile);

export class CloudflarePagesProvider implements DeployProvider {
  readonly name = 'cloudflare';

  private readonly apiToken: string;
  private readonly accountId: string;

  constructor(apiToken: string, accountId: string) {
    this.apiToken = apiToken;
    this.accountId = accountId;
  }

  async deploy(projectId: string, dir: string): Promise<DeployResult> {
    const project = `runner-${slugFor(projectId)}`;

    let stdout: string;
    try {
      ({ stdout } = await run(
        'npx',
        ['--yes', 'wrangler@latest', 'pages', 'deploy', dir, `--project-name=${project}`, '--commit-dirty=true'],
        {
          env: {
            ...process.env,
            CLOUDFLARE_API_TOKEN: this.apiToken,
            CLOUDFLARE_ACCOUNT_ID: this.accountId,
          },
          maxBuffer: 16 * 1024 * 1024,
        },
      ));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `wrangler failed: ${message}\n` +
          'Check that CLOUDFLARE_API_TOKEN has the "Cloudflare Pages: Edit" permission ' +
          `and that the account can create the project "${project}".`,
      );
    }

    // Wrangler prints the deployment URL on its own line. Failing to find it is
    // worth surfacing: a deploy whose URL we cannot report is not much use.
    const url = /(https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.pages\.dev)/i.exec(stdout)?.[1];
    if (!url) {
      throw new Error(`deployed, but no URL in wrangler's output:\n${stdout.slice(-800)}`);
    }

    return { public_url: url, deployment_id: `cloudflare:${project}:${Date.now()}` };
  }
}
