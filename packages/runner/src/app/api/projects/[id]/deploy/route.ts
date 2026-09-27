import { NextResponse } from 'next/server';
import { existsSync } from 'node:fs';

import { assertOwnsProject } from '@/core/auth';
import { getStore } from '@/core/db/store';
import { deployProvider } from '@/core/providers/registry';
import { distDir, latestVersion, recordDeployment } from '@/core/site/workspace';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

/**
 * Publish, from the owner's own click.
 *
 * The agent's route to the same action goes through `core/site/deploy.ts` and
 * asks first, because an agent publishing on its own initiative is the thing
 * PRD section 3 rules out. A person pressing Publish is the approval, so there
 * is nothing to ask - but the approval is still recorded, because "who decided
 * to put this online" should have an answer either way.
 */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  try {
    await assertOwnsProject(id);
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as { version?: unknown };
  const latest = await latestVersion(id);
  if (!latest) {
    return NextResponse.json({ error: 'there is no built site yet' }, { status: 409 });
  }

  const version = typeof body.version === 'number' ? body.version : latest.version;
  const dir = distDir(id, version);
  if (!existsSync(dir)) {
    return NextResponse.json({ error: `version ${version} has no build` }, { status: 404 });
  }

  const store = getStore();
  let provider;
  try {
    provider = deployProvider();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }

  const approval = store.createApproval(latest.task_id, 'site_deploy', {
    project_id: id,
    version,
    provider: provider.name,
    decided_by: 'owner',
  });

  try {
    const result = await provider.deploy(id, dir);
    store.decideApproval(approval.id, 'approved');
    await recordDeployment(id, version, result.public_url);
    return NextResponse.json({
      url: result.public_url,
      version,
      provider: provider.name,
      /** Local deployments are reachable only from this machine. */
      is_public: provider.name !== 'local',
    });
  } catch (err) {
    store.decideApproval(approval.id, 'rejected');
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
