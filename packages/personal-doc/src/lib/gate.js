/*
 * The passphrase check for the two client case studies.
 *
 * ── Read this before trusting it with anything ─────────────────────────────
 *
 * This hides the *passphrase*, not the *content*. Those are different problems
 * and only the first one is solvable here.
 *
 * The site is a static bundle. Every case study component ships to every
 * visitor as part of that bundle, whether or not the gate ever opens, because
 * there is no server in the loop to withhold it. Anyone willing to open devtools
 * can read the content directly or step past the gate entirely. What this stops
 * is someone idly clicking through — which, for work that is under NDA rather
 * than under embargo, is usually the actual requirement. If the requirement is
 * ever really "these people may see it and those may not", that needs a server
 * that authenticates first and sends the content second, and no amount of
 * client-side cleverness substitutes for it.
 *
 * ── What it does do properly ───────────────────────────────────────────────
 *
 * The passphrase itself appears nowhere: not in this file, not in the compiled
 * bundle, not in the network tab, not in the console. What is stored is a
 * PBKDF2-HMAC-SHA256 derivation of it.
 *
 * PBKDF2 rather than a bare SHA-256 because a bare hash of a short passphrase
 * falls to an offline dictionary attack in seconds — the attacker has the hash,
 * so they can guess at the speed of their hardware rather than the speed of the
 * form. 250,000 iterations makes each guess about a quarter of a million times
 * more expensive, which turns seconds into something impractical for a casual
 * attempt. It costs the person who knows the passphrase roughly 150ms, once.
 *
 * The salt is random and per-deployment rather than derived from anything, so
 * a precomputed rainbow table is no help even though the passphrase is short.
 *
 * ── Rotating it ────────────────────────────────────────────────────────────
 *
 *   node -e "const c=require('crypto');const s=c.randomBytes(16);\
 *     c.pbkdf2('NEW PASSPHRASE',s,250000,32,'sha256',(e,k)=>\
 *     console.log('salt',s.toString('hex'),'\\nhash',k.toString('hex')))"
 *
 * Paste the two values below. Never commit the passphrase itself.
 */

const SALT_HEX = '442e2fa3827970d8e1c332e465ba3143';
const HASH_HEX = 'a7d941287d9b9eb1a6442a44f497171a88d3a46430183b76c344964b2b78101c';
const ITERATIONS = 250000;

/* Per tab, not forever. A shared or borrowed laptop should not leave the case
 * studies open for whoever sits down next, and re-entering a passphrase once
 * per session is a small cost for that. */
export const UNLOCK_KEY = 'ad:case-unlocked';

const hex = (buf) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

const unhex = (s) => Uint8Array.from(s.match(/.{2}/g).map((b) => parseInt(b, 16)));

/**
 * Constant-time-ish comparison. Overkill for a client-side check — the attacker
 * already has the hash and does not need to time anything — but comparing with
 * `===` on a secret is a habit worth not having.
 */
function equal(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Resolves true when `input` derives to the stored hash. */
export async function verify(input) {
  if (!input) return false;

  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    // Web Crypto needs a secure context. On plain http (other than localhost)
    // there is no way to check, and failing closed is the only safe answer.
    console.warn('[gate] Web Crypto unavailable — a secure context is required.');
    return false;
  }

  const key = await subtle.importKey('raw', new TextEncoder().encode(input), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', salt: unhex(SALT_HEX), iterations: ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  );

  return equal(hex(bits), HASH_HEX);
}

export function isUnlocked() {
  try {
    return sessionStorage.getItem(UNLOCK_KEY) === '1';
  } catch {
    return false;
  }
}

export function remember() {
  try {
    sessionStorage.setItem(UNLOCK_KEY, '1');
  } catch {
    /* Private mode. The gate simply asks again on the next page. */
  }
}
