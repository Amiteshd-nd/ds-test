/**
 * Business memory (PRD section 6.6).
 *
 * The profile is the source of truth for the handful of things every agent
 * needs. This is for everything else a business turns out to be true of: that
 * they do not work weekends in August, that their biggest competitor undercuts
 * them on price and loses on turnaround, that the owner hates the word
 * "solutions".
 *
 * Two rules shape the whole file.
 *
 * **Writes are gated.** An agent proposes; the owner confirms. `remember`
 * writes an unconfirmed row and `recall` returns confirmed rows only, so an
 * agent physically cannot act on something nobody has agreed to. That is not a
 * UI convention - it is the query.
 *
 * **Nothing sensitive goes in.** Section 6.6 says never store secrets or PII in
 * retrievable memory, and a store that an agent writes to unsupervised is
 * exactly where a stray API key ends up. `looksSensitive` refuses those before
 * they reach the table. It is a coarse filter and it is meant to be: the cost
 * of refusing a harmless fact is that the agent rewords it.
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

import type { Memory, MemoryStore } from '../providers/interfaces.ts';

export interface StoredMemory extends Memory {
  created_at: string;
  /** Only set on a recall, where it is FTS5's relevance score. */
  score?: number;
}

/**
 * Shapes that must never be written down.
 *
 * Deliberately conservative about what it lets through rather than about what
 * it blocks. A false positive costs the agent one reworded sentence; a false
 * negative puts a live credential in a table that gets read back into a prompt.
 */
const SENSITIVE: Array<[RegExp, string]> = [
  [/\bsk-[a-z0-9-]{16,}/i, 'an API key'],
  [/\b(?:ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{16,}/, 'a GitHub token'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'an AWS access key'],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/, 'a Slack token'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'a private key'],
  [/\b(?:\d[ -]*?){13,19}\b(?=[^\d]|$)/, 'something shaped like a card number'],
  [/\b[A-CEGHJ-PR-TW-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b/, 'a National Insurance number'],
  // `password: hunter2`, `password = hunter2`, and - the one an agent writing
  // prose actually produces - `the password is hunter2`.
  [
    /\b(?:password|passwd|passphrase|secret|api[_ -]?key|access[_ -]?token|bearer|pin)\b\s*(?::|=|\bis\b|\bare\b)\s*\S+/i,
    'a credential',
  ],
  [/\b(?:login|username|user ?name)\b\s*(?::|=|\bis\b)\s*\S+.*\bpass(?:word)?\b/i, 'a login'],
];

export function looksSensitive(text: string): string | null {
  for (const [pattern, what] of SENSITIVE) {
    if (pattern.test(text)) return what;
  }
  return null;
}

export class SqliteMemoryStore implements MemoryStore {
  readonly name = 'sqlite';
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Record a proposed fact. Unconfirmed, and therefore invisible to `recall`
   * until the owner says otherwise.
   *
   * Throws on anything that looks sensitive. Throwing rather than silently
   * dropping matters: the agent gets the refusal back as a tool error and can
   * say what it meant without the secret in it.
   */
  async remember(projectId: string, text: string, sourceTaskId: string | null): Promise<Memory> {
    const trimmed = text.trim();
    if (trimmed.length < 8) throw new Error('that is too short to be a useful fact');
    if (trimmed.length > 500) {
      throw new Error('keep a remembered fact to a sentence or two, not a paragraph');
    }

    const sensitive = looksSensitive(trimmed);
    if (sensitive) {
      throw new Error(
        `refusing to remember that: it contains ${sensitive}. Memory is read back into prompts, ` +
          'so it never holds credentials or personal identifiers. Say the fact without it.',
      );
    }

    // The same fact proposed twice is one fact. Cheap containment on an agent
    // that re-derives the same thing every task.
    const existing = this.db
      .prepare('SELECT * FROM memories WHERE project_id = ? AND lower(text) = lower(?)')
      .get(projectId, trimmed) as StoredMemory | undefined;
    if (existing) return existing;

    const memory: StoredMemory = {
      id: randomUUID(),
      project_id: projectId,
      text: trimmed,
      source_task_id: sourceTaskId,
      confirmed: false,
      created_at: new Date().toISOString(),
    };

    this.db
      .prepare(
        `INSERT INTO memories (id, project_id, text, source_task_id, confirmed, created_at)
         VALUES (?, ?, ?, ?, 0, ?)`,
      )
      .run(memory.id, projectId, memory.text, sourceTaskId, memory.created_at);

    return memory;
  }

  async confirm(memoryId: string): Promise<void> {
    this.db.prepare('UPDATE memories SET confirmed = 1 WHERE id = ?').run(memoryId);
  }

  /** Rejecting deletes. A fact the owner has said is wrong should not linger. */
  async reject(memoryId: string): Promise<void> {
    this.db.prepare('DELETE FROM memories WHERE id = ?').run(memoryId);
  }

  /**
   * Confirmed facts only, ranked by relevance.
   *
   * An empty query returns everything confirmed, newest first, which is what
   * building a brief wants - the whole of what is known, not a search.
   */
  async recall(projectId: string, query: string, limit = 12): Promise<StoredMemory[]> {
    const trimmed = query.trim();
    if (!trimmed) {
      return this.db
        .prepare(
          'SELECT * FROM memories WHERE project_id = ? AND confirmed = 1 ORDER BY created_at DESC LIMIT ?',
        )
        .all(projectId, limit) as StoredMemory[];
    }

    try {
      return this.db
        .prepare(
          `SELECT m.*, bm25(memories_fts) AS score
             FROM memories_fts
             JOIN memories m ON m.rowid = memories_fts.rowid
            WHERE memories_fts MATCH ?
              AND m.project_id = ?
              AND m.confirmed = 1
            ORDER BY score
            LIMIT ?`,
        )
        .all(toMatchQuery(trimmed), projectId, limit) as StoredMemory[];
    } catch {
      // FTS5 rejects a query it cannot parse. A recall that fails is worse than
      // a recall that is merely less precise, so fall back to a substring match.
      return this.db
        .prepare(
          `SELECT * FROM memories
            WHERE project_id = ? AND confirmed = 1 AND lower(text) LIKE ?
            ORDER BY created_at DESC LIMIT ?`,
        )
        .all(projectId, `%${trimmed.toLowerCase()}%`, limit) as StoredMemory[];
    }
  }

  /** Everything proposed and not yet decided. This is what the review panel shows. */
  pending(projectId: string): StoredMemory[] {
    return this.db
      .prepare(
        'SELECT * FROM memories WHERE project_id = ? AND confirmed = 0 ORDER BY created_at DESC',
      )
      .all(projectId) as StoredMemory[];
  }

  confirmed(projectId: string): StoredMemory[] {
    return this.db
      .prepare(
        'SELECT * FROM memories WHERE project_id = ? AND confirmed = 1 ORDER BY created_at DESC',
      )
      .all(projectId) as StoredMemory[];
  }
}

/**
 * Turn a natural question into an FTS5 query.
 *
 * FTS5's syntax treats quotes, asterisks, colons and the bare words AND, OR and
 * NOT as operators, so passing a user's sentence through raw is how a recall
 * ends up as a syntax error. Every term is quoted and the terms are OR-ed,
 * because a memory that matches two words out of six is usually the one wanted.
 */
function toMatchQuery(query: string): string {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9']+/i)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t))
    .slice(0, 12);
  if (terms.length === 0) throw new Error('nothing to search for');
  return terms.map((t) => `"${t.replace(/"/g, '')}"`).join(' OR ');
}

const STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 'one',
  'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'new', 'now', 'old',
  'see', 'two', 'way', 'who', 'boy', 'did', 'use', 'with', 'this', 'that', 'from',
  'they', 'what', 'about', 'which', 'their', 'would', 'there', 'been', 'have', 'does',
]);
