// Adapter 8 of 8 — rendering. PRD §5.3 / §13.
//
// This is the only adapter that lives in the client. CORTEX ships zero styles: the host
// supplies every component, and `scripts/lint-boundaries.mjs` fails the build if a
// className, a style attribute, or a CSS import appears under src/ui-headless/.
//
// Declared as types only. There is no reference implementation in this file on purpose —
// a reference theme that is importable from production is a reference theme that ends up
// in production.

import type { Block, EntityRef, ErrorKind } from './types.ts';

export interface Suggestion { id: string; label: string; prompt: string }

export interface BubbleProps { role: 'user' | 'assistant'; children?: unknown; streaming?: boolean }
export interface SkillCallProps { skill: string; humanName: string; state: 'running' | 'ok' | 'error' | 'awaiting_approval'; args: Record<string, unknown> }
export interface ApprovalProps { human: string; args: Record<string, unknown>; costUsd: number; onApprove: (editedArgs?: Record<string, unknown>) => void; onReject: (reason: string) => void }
export interface Source { sourceId: string; ref: EntityRef; title: string }

/** Any block type the host has not registered falls back to text. Never crash (§13.3). */
export interface DesignSystemAdapter<C = unknown> {
  tokens: Record<string, string>;
  components: {
    Bubble: C;
    EntityCard: C;
    SkillCallCard: C;
    ApprovalPrompt: C;
    CitationChip: C;
    StreamingCursor: C;
    ErrorState: C;
    EmptyState: C;
    /** Optional per-block renderers, keyed by `Block["type"]`. */
    blocks?: Partial<Record<Block['type'], C>>;
  };
}

export type { ErrorKind };
