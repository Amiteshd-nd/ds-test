// One memory service, two record types, one retrieval call. PRD §10.1.
//
// The PRD reports LinkedIn's own retrospective — that they would have preferred a
// unified memory system from the start rather than separate conversational and
// experiential layers. This takes the retrospective rather than the history: `assemble`
// returns one ranked, budget-trimmed list, and the caller never merges two things.

import type { MemoryAdapter } from '../adapters/memory.ts';
import type { PolicyAdapter } from '../adapters/policy.ts';
import type { MemoryBundle, Principal } from '../adapters/types.ts';
import { estimateTokens } from '../grounding/pipeline.ts';

export interface AssembleRequest {
  principal: Principal;
  threadId: string | null;
  question: string;
  turns: number;
  semanticRecall: boolean;
  /** Which profile keys this agent's manifest permits reading (§6.1 `memory.profile.read`). */
  readKeys: string[];
  budgetTokens: number;
}

export class MemoryService {
  readonly adapter: MemoryAdapter;
  readonly policy: PolicyAdapter;

  constructor(adapter: MemoryAdapter, policy: PolicyAdapter) {
    this.adapter = adapter;
    this.policy = policy;
  }

  async assemble(req: AssembleRequest): Promise<MemoryBundle> {
    const items: MemoryBundle['items'] = [];

    // Profile first: it is small, it shapes the whole answer, and it must survive the
    // budget trim that drops old turns.
    const profile = await this.adapter.getProfile(req.principal.id);
    for (const rec of [...profile.preferences, ...profile.facts]) {
      if (rec.key && !req.readKeys.includes(rec.key)) continue; // manifest allow-list
      items.push({ kind: rec.type, text: `${rec.key ?? 'note'}: ${rec.value}`, recordId: rec.id });
    }

    if (req.threadId) {
      const recent = await this.adapter.recent(req.threadId, req.turns);
      const semantic = req.semanticRecall ? await this.adapter.semantic(req.threadId, req.question, 4) : [];
      const seen = new Set(recent.map((t) => t.id));
      for (const t of semantic) {
        if (seen.has(t.id)) continue;
        items.push({ kind: 'summary', text: `earlier in this thread — ${t.role}: ${t.text}` });
      }
      for (const t of recent) items.push({ kind: 'turn', text: `${t.role}: ${t.text}` });
    }

    // Budget from the end: the newest turns are the ones worth keeping.
    const kept: MemoryBundle['items'] = [];
    let tokens = 0;
    for (let i = items.length - 1; i >= 0; i--) {
      const cost = estimateTokens(items[i].text);
      if (tokens + cost > req.budgetTokens) continue;
      tokens += cost;
      kept.unshift(items[i]);
    }
    return { items: kept, tokensUsed: tokens };
  }

  /**
   * §10.4 — memory is redacted on read, because entitlements can be revoked after a
   * fact was written. The write is not the last word on whether it may be seen.
   */
  async redactBundle(principal: Principal, bundle: MemoryBundle): Promise<MemoryBundle> {
    const items = await Promise.all(
      bundle.items.map(async (item) => {
        const doc = await this.policy.redact(principal, {
          ref: `memory:${item.recordId ?? 'turn'}`,
          type: 'memory',
          title: item.kind,
          body: item.text,
        });
        return { ...item, text: doc.body };
      }),
    );
    return { items, tokensUsed: bundle.tokensUsed };
  }
}
