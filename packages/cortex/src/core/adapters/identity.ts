import type { Principal } from './types.ts';

/**
 * Adapter 1 of 8 — who is asking. PRD §5.3.
 *
 * `entitlements` returns capability strings (`"docs.read"`, `"message.send"`), not
 * roles. The skill registry and the policy adapter both read them, and neither should
 * have to know that a `lead` can do what a `member` can plus four more things.
 */
export interface IdentityAdapter {
  resolve(sessionToken: string): Promise<Principal | null>;
  entitlements(principal: Principal): Promise<Set<string>>;
}
