import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every route that takes a project id checks who is asking.
 *
 * PRD section 10 requires row-level security on every table. SQLite has no
 * equivalent, so until this moves to Supabase the check lives in the route
 * handlers - and a check that has to be remembered per route is one that will
 * eventually be forgotten in a hurry.
 *
 * So it is asserted instead. This walks the App Router, finds every handler
 * under a `[id]` or `[project]` segment, and fails if one does not call
 * `assertOwnsProject`. It is the same shape as the gate's architectural test:
 * cheap, and it catches the failure that actually happens.
 */

const APP = path.join(process.cwd(), 'src', 'app');

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return routeFiles(full);
    return entry === 'route.ts' ? [full] : [];
  });
}

/** Handlers whose path carries a project id, so the caller must be checked. */
function projectScoped(): Array<{ route: string; source: string }> {
  return routeFiles(APP)
    .map((file) => ({ route: path.relative(APP, file), source: readFileSync(file, 'utf8') }))
    .filter(({ route }) => /\[(id|project)\]/.test(route));
}

describe('project-scoped routes', () => {
  it('finds routes to check', () => {
    // A guard on the guard: if the walk breaks, this test must not pass by
    // silently checking nothing.
    expect(projectScoped().length).toBeGreaterThan(5);
  });

  it.each(projectScoped().map((r) => r.route))('%s checks the caller owns it', (route) => {
    const { source } = projectScoped().find((r) => r.route === route)!;
    expect(source).toContain('assertOwnsProject');
  });

  it('checks the caller in every exported handler, not just one', () => {
    const offenders: string[] = [];

    for (const { route, source } of projectScoped()) {
      const handlers = [...source.matchAll(/export async function (GET|POST|PATCH|PUT|DELETE)\b/g)];
      const checks = [...source.matchAll(/assertOwnsProject/g)];
      // One call per exported handler. A route with GET and DELETE that only
      // guards the GET is the exact bug this exists to catch.
      if (checks.length < handlers.length) {
        offenders.push(`${route}: ${handlers.length} handlers, ${checks.length} checks`);
      }
    }

    expect(offenders).toEqual([]);
  });
});

describe('the public routes are public on purpose', () => {
  it('only the published-site route serves without a check', () => {
    const open = routeFiles(APP)
      .map((file) => ({ route: path.relative(APP, file), source: readFileSync(file, 'utf8') }))
      .filter(({ source }) => !source.includes('assertOwnsProject'))
      .map(({ route }) => route)
      .sort();

    // `/s/<slug>/` is a published site: the whole point is that a link to it
    // works for whoever is given it. `/api/projects` and the two billing
    // routes scope by the caller's own id rather than by a project in the
    // path - a balance belongs to a user, not to a business. `/api/meta`
    // returns provider names and nothing about anyone.
    //
    // `/api/tasks` is deliberately not on this list: it takes a project id in
    // the body rather than the path, and it checks it.
    expect(open).toEqual(
      [
        'api/billing/confirm/route.ts',
        'api/billing/route.ts',
        'api/meta/route.ts',
        'api/projects/route.ts',
        's/[[...path]]/route.ts',
      ].sort(),
    );
  });
});
