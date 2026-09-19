import type { ErrorKind } from './adapters/types.ts';

/**
 * Every failure in the system is one of these. §8.3: exceeding a budget is a
 * first-class error kind, not a 500 — the UI has a state for it (§13.4), and a state
 * only exists if the error can be told apart from a crash.
 */
export class CortexError extends Error {
  readonly kind: ErrorKind;
  readonly detail?: Record<string, unknown>;

  constructor(kind: ErrorKind, message: string, detail?: Record<string, unknown>) {
    super(message);
    this.name = 'CortexError';
    this.kind = kind;
    this.detail = detail;
  }
}

export function asCortexError(err: unknown): CortexError {
  if (err instanceof CortexError) return err;
  return new CortexError('internal', err instanceof Error ? err.message : String(err));
}
