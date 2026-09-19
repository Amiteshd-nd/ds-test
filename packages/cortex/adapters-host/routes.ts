// Atlas's own HTTP endpoints. NOT part of CORTEX.
//
// Applying an inline edit is the host writing to its own document because a person
// accepted a diff in the host's UI — no skill, no gate, no agent. These live here, in the
// host package, for the same reason the adapters do: a second host has different ones,
// and the service should not know about either.

import type { Router } from '../src/server/http.ts';
import type { HostRoutes } from '../src/server/service.ts';
import { CortexError } from '../src/core/errors.ts';
import { json, readJson } from '../src/server/http.ts';
import { applyEdit, documentFor, entities } from './atlas.ts';
import type { LocalRetrieval } from '../src/core/grounding/local-retrieval.ts';

export const atlasHostRoutes: HostRoutes = (router: Router, deps) => {
  const retrieval = deps.adapters.retrieval as LocalRetrieval;

  // -- Atlas's own API -------------------------------------------------------
  //
  // This one route is NOT part of CORTEX. It is the host applying an edit to its own
  // document because a person accepted a diff in the host's UI — no skill, no gate, no
  // agent involvement. It lives in this file only because Atlas is a fixture with no
  // server of its own; in a real host it would be an endpoint you already have.

  router.add('POST', '/v1/host/documents/{ref}/edit', async ({ req, res, params }) => {
    const principal = await deps.principalOf(req);
    const body = await readJson<{ before?: string; after?: string }>(req);
    if (!body.before || !body.after) throw new CortexError('invalid_arguments', 'An edit needs before and after text.');

    const result = applyEdit(params.ref, body.before, body.after, principal);
    if (!result.ok) throw new CortexError('invalid_arguments', result.reason ?? 'The edit could not be applied.');

    // Re-index, so the next answer is not drawn from the version before the edit.
    const doc = documentFor(params.ref);
    if (doc) retrieval.upsert(doc);
    json(res, 200, { ok: true, document: doc });
  });

  router.add('GET', '/v1/host/documents', async ({ req, res, url }) => {
    const principal = await deps.principalOf(req);
    const refs = (url.searchParams.get('refs') ?? '').split(',').filter(Boolean);
    const wanted = refs.length ? refs : entities.filter((e) => e.type === 'doc').map((e) => e.ref);
    const allowed = await deps.adapters.policy.canRead(principal, wanted);
    const docs = wanted
      .filter((_, i) => allowed[i])
      .map((ref) => documentFor(ref))
      .filter((d): d is NonNullable<typeof d> => Boolean(d));
    json(res, 200, { documents: docs });
  });


};
