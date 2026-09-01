import fs from "node:fs";
import Database from "better-sqlite3";
import { DATA_DIR, DB_PATH } from "./paths";
import type { Job, JobStatus } from "./types";

// ── Thin data-access module ────────────────────────────────────────────────
// Everything that touches persistence goes through here. To move to Postgres
// later, reimplement these exported functions and nothing else changes.

let _db: Database.Database | null = null;

function db(): Database.Database {
  if (_db) return _db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const d = new Database(DB_PATH);
  d.pragma("journal_mode = WAL");
  d.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      status        TEXT NOT NULL,
      kiriSerialize TEXT,
      photoCount    INTEGER NOT NULL DEFAULT 0,
      totalBytes    INTEGER NOT NULL DEFAULT 0,
      createdAt     INTEGER NOT NULL,
      startedAt     INTEGER,
      finishedAt    INTEGER,
      errorCode     TEXT,
      errorMsg      TEXT,
      modelPath     TEXT
    );
  `);
  _db = d;
  return d;
}

export function createJob(job: Job): Job {
  db()
    .prepare(
      `INSERT INTO jobs
        (id, name, status, kiriSerialize, photoCount, totalBytes, createdAt, startedAt, finishedAt, errorCode, errorMsg, modelPath)
       VALUES
        (@id, @name, @status, @kiriSerialize, @photoCount, @totalBytes, @createdAt, @startedAt, @finishedAt, @errorCode, @errorMsg, @modelPath)`,
    )
    .run(job);
  return job;
}

export function getJob(id: string): Job | null {
  const row = db().prepare(`SELECT * FROM jobs WHERE id = ?`).get(id) as Job | undefined;
  return row ?? null;
}

export function listJobs(): Job[] {
  return db().prepare(`SELECT * FROM jobs ORDER BY createdAt DESC`).all() as Job[];
}

export function updateJob(
  id: string,
  patch: Partial<Omit<Job, "id">>,
): Job | null {
  const existing = getJob(id);
  if (!existing) return null;
  const next: Job = { ...existing, ...patch };
  db()
    .prepare(
      `UPDATE jobs SET
        name=@name, status=@status, kiriSerialize=@kiriSerialize,
        photoCount=@photoCount, totalBytes=@totalBytes, createdAt=@createdAt,
        startedAt=@startedAt, finishedAt=@finishedAt, errorCode=@errorCode,
        errorMsg=@errorMsg, modelPath=@modelPath
       WHERE id=@id`,
    )
    .run(next);
  return next;
}

export function setStatus(id: string, status: JobStatus): Job | null {
  return updateJob(id, { status });
}
