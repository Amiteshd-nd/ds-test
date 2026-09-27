import { currentUser } from '@/core/auth';
import { getStore } from '@/core/db/store';
import { activeProviders } from '@/core/providers/registry';
import { brandFacts, contactLinks, isUsable } from '@/core/business/profile';
import { listVersions, previewUrl } from '@/core/site/workspace';
import { listArtifacts } from '@/core/artifacts';
import { actionOf } from '@/core/growth/gate';
import { describeAction, summariseAction } from '@/core/growth/actions';
import { templateIsSeeded } from '@/core/site/seed';
import { ensureScheduler } from '@/core/growth/scheduler';
import { billingProvider } from '@/core/billing/provider';
import { planFor } from '@/core/billing/plans';
import { Workbench } from '@/components/Workbench';

export const dynamic = 'force-dynamic';

export default async function Page() {
  // Anything approved and overdue while Runner was stopped goes out now, and
  // the ticker takes over from here. Idempotent, so rendering again is free.
  await ensureScheduler();

  const user = await currentUser();
  const store = getStore();

  // A first run with no projects is a dead end, so make one. The name is a
  // placeholder until the interview replaces it with a real business.
  let projects = store.listProjects(user.id);
  if (projects.length === 0) {
    store.createProject(user.id, 'My business');
    projects = store.listProjects(user.id);
  }

  const project = projects[0];

  // The month's free credit, if this month's has not been given yet.
  const plan = planFor(user.plan);
  store.ledger.grantMonthly(user.id, plan);
  const profile = store.getProfile(project.id);
  const brand = brandFacts(profile);
  const links = contactLinks(profile);

  return (
    <Workbench
      projects={projects}
      initialTasks={store.listTasks(project.id)}
      providers={activeProviders()}
      profile={{
        usable: isUsable(profile),
        answers: {
          name: profile?.name ?? '',
          offer: profile?.offer ?? '',
          audience: profile?.audience ?? '',
          tone: profile?.tone ?? '',
          area: brand.area ?? '',
          hours: brand.hours ?? '',
          since: brand.since ?? '',
          credentials: brand.credentials ?? '',
          differentiator: brand.differentiator ?? '',
          email: links.email ?? '',
          phone: links.phone ?? '',
        },
      }}
      initialVersions={(await listVersions(project.id)).map((v) => ({
        ...v,
        preview_url: previewUrl(project.id, v.version),
      }))}
      initialMemories={{
        pending: store.memories.pending(project.id),
        confirmed: store.memories.confirmed(project.id),
      }}
      initialArtifacts={await listArtifacts(project.id)}
      initialQueue={store.listApprovals(project.id).map((row) => {
        const action = actionOf(row);
        return {
          id: row.id,
          label: describeAction(action),
          summary: summariseAction(action),
          action,
          status: row.status,
          scheduled_for: row.scheduled_for,
          created_at: row.created_at,
          executed_at: row.executed_at,
          error: row.error,
          sent_externally: row.result_json
            ? !(JSON.parse(row.result_json) as { local?: boolean }).local
            : null,
        };
      })}
      initialCredit={{
        plan,
        balance_usd: store.ledger.balance(user.id),
        used_today: store.countTasksSince(
          user.id,
          new Date(Date.now() - 86_400_000).toISOString(),
        ),
        provider: billingProvider().name,
      }}
      templateReady={templateIsSeeded()}
    />
  );
}
