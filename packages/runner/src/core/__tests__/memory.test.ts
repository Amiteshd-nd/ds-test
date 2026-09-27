import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import { looksSensitive, SqliteMemoryStore } from '../business/memory.ts';

function store(): SqliteMemoryStore {
  const db = new Database(':memory:');
  db.exec(readFileSync(path.join(process.cwd(), 'src', 'core', 'db', 'schema.sql'), 'utf8'));
  db.prepare("INSERT INTO users (id, email, plan, created_at) VALUES ('u', 'a@b', 'free', '')").run();
  db.prepare("INSERT INTO projects (id, user_id, name, created_at) VALUES ('p', 'u', 'P', '')").run();
  return new SqliteMemoryStore(db);
}

describe('the sensitive-content filter', () => {
  it.each([
    ['sk-ant-api03-abcdefghijklmnop', 'an API key'],
    ['ghp_abcdefghijklmnopqrstuvwxyz01', 'a GitHub token'],
    ['AKIAIOSFODNN7EXAMPLE', 'an AWS access key'],
    ['the card is 4111 1111 1111 1111', 'something shaped like a card number'],
    ['password: hunter2fortress', 'a credential'],
    ['The portal password is hunter2fortress', 'a credential'],
    ['api_key = abc123def456', 'a credential'],
    ['their NI number is AB 12 34 56 C', 'a National Insurance number'],
  ])('refuses %s', (text) => {
    expect(looksSensitive(text)).not.toBeNull();
  });

  it.each([
    'They price by the chain, twenty two yards.',
    'They will not take on work outside a thirty mile radius.',
    'The owner dislikes the word solutions.',
    'Their busiest month is September and they turn work away in it.',
  ])('allows an ordinary fact: %s', (text) => {
    expect(looksSensitive(text)).toBeNull();
  });
});

describe('the memory store', () => {
  let memories: SqliteMemoryStore;
  beforeEach(() => {
    memories = store();
  });

  it('does not recall a fact until it is confirmed', async () => {
    // The whole of PRD section 6.6's gate is this query. It is not a UI rule.
    const memory = await memories.remember('p', 'They never quote for their own remedial work.', null);
    expect(await memories.recall('p', '')).toHaveLength(0);
    expect(memories.pending('p')).toHaveLength(1);

    await memories.confirm(memory.id);
    expect(await memories.recall('p', '')).toHaveLength(1);
    expect(memories.pending('p')).toHaveLength(0);
  });

  it('ranks a fact matching two terms above one matching one', async () => {
    // What bm25 actually guarantees. Ordering between two facts that each match
    // a single, equally rare term is decided by document length, not by which
    // one a reader would have meant - so that is not something to assert.
    const a = await memories.remember('p', 'They price hedgelaying work by the chain.', null);
    const b = await memories.remember('p', 'The owner will not work in August.', null);
    await memories.confirm(a.id);
    await memories.confirm(b.id);

    const found = await memories.recall('p', 'how do they price the work');
    expect(found).toHaveLength(2);
    expect(found[0].text).toContain('chain');
  });

  it('matches on any term rather than all of them', async () => {
    const m = await memories.remember('p', 'They price hedgelaying by the chain.', null);
    await memories.confirm(m.id);
    expect(await memories.recall('p', 'pricing for fencing and hedging')).toHaveLength(1);
  });

  it('survives a question FTS5 would choke on', async () => {
    const m = await memories.remember('p', 'They charge by the chain for hedgelaying.', null);
    await memories.confirm(m.id);
    // Quotes, operators and punctuation are all FTS5 syntax.
    expect(await memories.recall('p', 'what "AND" the * price OR (chain)?')).toHaveLength(1);
  });

  it('refuses a credential with a message worth reading', async () => {
    await expect(
      memories.remember('p', 'The portal password is hunter2fortress.', null),
    ).rejects.toThrow(/credential/);
  });

  it('does not record the same fact twice', async () => {
    const first = await memories.remember('p', 'They will not work in August at all.', null);
    const again = await memories.remember('p', 'they will not work in august at all.', null);
    expect(again.id).toBe(first.id);
  });

  it('rejecting removes it rather than hiding it', async () => {
    const m = await memories.remember('p', 'They only take work within thirty miles.', null);
    await memories.reject(m.id);
    expect(memories.pending('p')).toHaveLength(0);
    expect(await memories.recall('p', '')).toHaveLength(0);
  });

  it('keeps one project out of another', async () => {
    const m = await memories.remember('p', 'A fact about this project only.', null);
    await memories.confirm(m.id);
    expect(await memories.recall('other', '')).toHaveLength(0);
  });
});
