/**
 * Who is making this request.
 *
 * PRD section 7 says Supabase Auth, and it should be — but Supabase Auth needs a
 * hosted project, and Phase 0's acceptance criterion has nothing to do with
 * sign-in. So this is a single-tenant development identity: one user, resolved
 * from a cookie or from `RUNNER_DEV_USER`, created on first use.
 *
 * It is a stand-in, and a deliberately unconvincing one — there is no password,
 * no session token, and no check that the caller is who the cookie says. Every
 * route calls `currentUser()` and takes a `user.id`, so the swap is this file
 * and nothing else. Row-level security (PRD section 10) arrives with Supabase;
 * until then authorisation is "there is one user", which is true and useless.
 */

import { cookies } from 'next/headers';

import { getStore } from './db/store.ts';
import type { User } from './types.ts';

const DEV_EMAIL = process.env.RUNNER_DEV_USER ?? 'owner@localhost';

export async function currentUser(): Promise<User> {
  const jar = await cookies();
  const email = jar.get('runner_user')?.value ?? DEV_EMAIL;
  return getStore().upsertUser(email);
}

/** Throws unless the project belongs to the caller. The whole of Phase 0 authz. */
export async function assertOwnsProject(projectId: string): Promise<User> {
  const user = await currentUser();
  const project = getStore().getProject(projectId);
  if (!project || project.user_id !== user.id) {
    throw Object.assign(new Error('project not found'), { status: 404 });
  }
  return user;
}
