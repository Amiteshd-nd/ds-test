-- The Phase 0 data model (PRD section 8).
--
-- Written for SQLite, kept deliberately close to the Postgres it becomes: TEXT
-- ids (uuids as strings), TEXT timestamps (ISO-8601, UTC), REAL for money, and
-- no SQLite-only types. The two things that will change on the way to Supabase
-- are AUTOINCREMENT (there is none here on purpose) and row-level security,
-- which has no SQLite equivalent and is listed in PRD section 10 as a
-- requirement for every table below.

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  plan        TEXT NOT NULL DEFAULT 'free',
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS projects_user ON projects(user_id);

-- One row per project, created empty alongside the project. Phase 1's
-- onboarding interview fills it; from then on every agent reads it instead of
-- re-asking the user (PRD section 3, goal 2).
CREATE TABLE IF NOT EXISTS business_profiles (
  project_id  TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT,
  offer       TEXT,
  audience    TEXT,
  tone        TEXT,
  brand_json  TEXT,
  links_json  TEXT,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  prompt      TEXT NOT NULL,
  status      TEXT NOT NULL,
  cost_usd    REAL NOT NULL DEFAULT 0,
  started_at  TEXT,
  finished_at TEXT,
  error       TEXT
);
CREATE INDEX IF NOT EXISTS tasks_project ON tasks(project_id, status);

-- Append-only. A step row is written when the step starts and closed when it
-- ends; it is never rewritten, which is what makes it a checkpoint log and not
-- just a status field (PRD section 10, reliability).
CREATE TABLE IF NOT EXISTS task_steps (
  id            TEXT PRIMARY KEY,
  task_id       TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  seq           INTEGER NOT NULL,
  kind          TEXT NOT NULL,
  name          TEXT NOT NULL,
  input_ref     TEXT,
  output_ref    TEXT,
  status        TEXT NOT NULL,
  tokens_in     INTEGER NOT NULL DEFAULT 0,
  tokens_cached INTEGER NOT NULL DEFAULT 0,
  tokens_out    INTEGER NOT NULL DEFAULT 0,
  cost_usd      REAL NOT NULL DEFAULT 0,
  error         TEXT,
  started_at    TEXT NOT NULL,
  finished_at   TEXT,
  UNIQUE (task_id, seq)
);
CREATE INDEX IF NOT EXISTS steps_task ON task_steps(task_id, seq);

CREATE TABLE IF NOT EXISTS artifacts (
  id          TEXT PRIMARY KEY,
  task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,
  storage_url TEXT NOT NULL,
  public_url  TEXT,
  version     INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL
);

-- Phase 2. Unconfirmed by default: the agent proposes a fact, the user promotes
-- it (PRD section 6.6). `embedding` stays NULL until there is a vector store
-- behind it; recall falls back to text matching in the meantime.
CREATE TABLE IF NOT EXISTS memories (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  text           TEXT NOT NULL,
  embedding      BLOB,
  source_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  confirmed      INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS memories_project ON memories(project_id, confirmed);

-- Recall, without a vector store.
--
-- PRD section 6.6 specifies pgvector. SQLite has no equivalent, and Anthropic
-- has no embeddings endpoint, so an embedding would mean a second vendor for
-- the one feature. FTS5 is built in, it does stemming and relevance ranking,
-- and for a store that holds a few dozen short facts about one business it
-- returns the same rows a vector search would. `embedding` above stays NULL
-- and the column stays, so the upgrade is a backfill rather than a migration.
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  text,
  content = 'memories',
  content_rowid = 'rowid',
  tokenize = 'porter unicode61'
);

-- The index is only as good as the triggers keeping it in step with the table.
CREATE TRIGGER IF NOT EXISTS memories_fts_insert AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts (rowid, text) VALUES (new.rowid, new.text);
END;

CREATE TRIGGER IF NOT EXISTS memories_fts_delete AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts (memories_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
END;

CREATE TRIGGER IF NOT EXISTS memories_fts_update AFTER UPDATE OF text ON memories BEGIN
  INSERT INTO memories_fts (memories_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
  INSERT INTO memories_fts (rowid, text) VALUES (new.rowid, new.text);
END;

-- The gate (PRD section 6.7).
--
-- One row per outward-facing action, written *before* anybody is asked. The
-- row carries the action itself in `payload_json`, not a reference to a paused
-- agent: approving executes the payload, so the pending action survives a
-- restart that a suspended loop would not.
--
-- `executed_at` is what makes execution idempotent. It is set inside the same
-- transaction that performs the action, so a double click, a retry and a
-- scheduler tick racing a manual publish cannot send the same thing twice.
CREATE TABLE IF NOT EXISTS approvals (
  id            TEXT PRIMARY KEY,
  task_id       TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  -- Denormalised from the task so the calendar can be read per project without
  -- joining through tasks, and so a deleted task cannot orphan a pending send.
  project_id    TEXT REFERENCES projects(id) ON DELETE CASCADE,
  action_type   TEXT NOT NULL,
  payload_json  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  -- When the owner wants it to go out. NULL means "as soon as it is approved".
  scheduled_for TEXT,
  created_at    TEXT NOT NULL,
  decided_at    TEXT,
  executed_at   TEXT,
  result_json   TEXT,
  error         TEXT
);
CREATE INDEX IF NOT EXISTS approvals_task ON approvals(task_id, status);
CREATE INDEX IF NOT EXISTS approvals_project ON approvals(project_id, status, scheduled_for);

-- Everything approved, due, and not yet done. The scheduler reads exactly this.
CREATE INDEX IF NOT EXISTS approvals_due ON approvals(status, executed_at, scheduled_for);

-- Credits (PRD section 8, `credit_ledger`).
--
-- Append-only. A balance is never stored as a mutable number anywhere, because
-- the question that gets asked when a bill is disputed is not "what is the
-- balance" but "how did it get there" - and a column that was overwritten
-- cannot answer it.
--
-- `amount_usd` is signed: positive adds, negative spends. `balance_after` is
-- the running total at that row, written inside the same transaction as the
-- row, so the balance can be read in one statement and reconciled against the
-- sum of everything before it.
--
-- Holds are how a task cannot overspend. A task reserves its budget before it
-- starts and settles the difference when it ends, which is also why `kind`
-- distinguishes a hold from a debit: an abandoned hold is recoverable, a debit
-- is not.
CREATE TABLE IF NOT EXISTS credit_ledger (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id       TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  kind          TEXT NOT NULL,
  amount_usd    REAL NOT NULL,
  balance_after REAL NOT NULL,
  note          TEXT,
  -- A Stripe payment intent, or whatever the billing provider calls its record.
  external_ref  TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ledger_user ON credit_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ledger_task ON credit_ledger(task_id, kind);

-- The monthly grant is idempotent: one row per user per calendar month, and
-- the unique index is what makes "give everyone their free credit" safe to run
-- twice.
CREATE UNIQUE INDEX IF NOT EXISTS ledger_monthly_grant
  ON credit_ledger(user_id, note) WHERE kind = 'grant';
