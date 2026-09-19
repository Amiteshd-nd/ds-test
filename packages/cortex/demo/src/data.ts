// Atlas's own record lookup, for rendering entity cards. The agent layer sends a ref;
// the host decides what a person, a project, or a document looks like — which is why
// this import is in the host's UI and not in CORTEX.

import entitiesJson from '../../adapters-host/data/entities.json' with { type: 'json' };

export interface AtlasRecord { ref: string; type: string; title: string; body: string }

const records = entitiesJson as AtlasRecord[];
const index = new Map(records.map((r) => [r.ref, r]));

export function entityByRef(ref: string): AtlasRecord | undefined {
  return index.get(ref);
}

export const AGENTS = [
  {
    id: 'atlas-guide',
    name: 'Atlas Guide',
    canComment: false,
    note: 'The Guide is read-only: nothing it does changes anything.',
  },
  {
    id: 'atlas-scribe',
    name: 'Atlas Scribe',
    canComment: true,
    note: 'The Scribe can leave a comment — behind an approval you can edit before it goes out.',
  },
];

export const PRINCIPALS = [
  { id: 'ananya', token: 'tok_ananya', label: 'Ananya Rao — engineer, Platform', note: 'Cannot see hiring records.' },
  { id: 'bharath', token: 'tok_bharath', label: 'Bharath Menon — lead, Platform + hiring', note: 'Sees hiring records too.' },
  { id: 'wren', token: 'tok_wren', label: 'Wren Osei — Northwind Core', note: 'A different organisation. Sees none of Atlas.' },
];
