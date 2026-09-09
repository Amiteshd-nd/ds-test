import fs from "node:fs";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { DATA_DIR, DB_PATH } from "./paths";
import type { AssetRow, AssetStatus, CaptureRow, JobRow, JobStatus } from "./types";

// ── Thin data-access module ────────────────────────────────────────────────
// Everything that touches persistence goes through here. To move to Postgres
// later, reimplement these exported functions and nothing else changes.
//
// Schema is evolved via ordered migrations tracked in PRAGMA user_version.

let _db: Database.Database | null = null;

// Each migration runs once, inside a transaction, in order.
const MIGRATIONS: ((d: Database.Database) => void)[] = [
  // v1 — the original flat jobs table (kept for fresh installs so the v2
  // migration has a consistent starting point).
  (d) => {
    d.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        kind          TEXT NOT NULL DEFAULT 'photo_3d',
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
  },

  // v2 — captures / assets / jobs. Migrates v1 rows and keeps the old table
  // as jobs_legacy (nothing is hard-deleted).
  (d) => {
    d.exec(`
      CREATE TABLE captures (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        kind       TEXT NOT NULL,
        createdAt  INTEGER NOT NULL,
        archivedAt INTEGER
      );
      CREATE TABLE assets (
        id        TEXT PRIMARY KEY,
        captureId TEXT NOT NULL REFERENCES captures(id),
        type      TEXT NOT NULL,
        status    TEXT NOT NULL,
        path      TEXT,
        bytes     INTEGER NOT NULL DEFAULT 0,
        count     INTEGER NOT NULL DEFAULT 1,
        createdAt INTEGER NOT NULL
      );
      CREATE TABLE recon_jobs (
        id            TEXT PRIMARY KEY,
        captureId     TEXT NOT NULL REFERENCES captures(id),
        outputAssetId TEXT,
        provider      TEXT NOT NULL DEFAULT 'kiri',
        providerJobId TEXT,
        status        TEXT NOT NULL,
        attempts      INTEGER NOT NULL DEFAULT 1,
        errorCode     TEXT,
        errorMsg      TEXT,
        submittedAt   INTEGER NOT NULL,
        completedAt   INTEGER
      );
      CREATE INDEX idx_assets_capture ON assets(captureId);
      CREATE INDEX idx_jobs_capture ON recon_jobs(captureId);
      CREATE INDEX idx_jobs_status ON recon_jobs(status);
    `);

    // Migrate v1 rows.
    type LegacyRow = {
      id: string;
      name: string;
      kind: string;
      status: string;
      kiriSerialize: string | null;
      photoCount: number;
      totalBytes: number;
      createdAt: number;
      startedAt: number | null;
      finishedAt: number | null;
      errorCode: string | null;
      errorMsg: string | null;
      modelPath: string | null;
    };
    const legacy = d.prepare(`SELECT * FROM jobs`).all() as LegacyRow[];
    const insCapture = d.prepare(
      `INSERT INTO captures (id,name,kind,createdAt,archivedAt) VALUES (?,?,?,?,NULL)`,
    );
    const insAsset = d.prepare(
      `INSERT INTO assets (id,captureId,type,status,path,bytes,count,createdAt) VALUES (?,?,?,?,?,?,?,?)`,
    );
    const insJob = d.prepare(
      `INSERT INTO recon_jobs (id,captureId,outputAssetId,provider,providerJobId,status,attempts,errorCode,errorMsg,submittedAt,completedAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    );

    for (const r of legacy) {
      insCapture.run(r.id, r.name, r.kind, r.createdAt);

      // Source asset: photos dir (or video) under storage/<id>/photos.
      const sourceType =
        r.kind === "pano_360" ? "pano_360" : r.kind === "splat_3dgs" ? "source_video" : "source_photos";
      insAsset.run(
        randomUUID(),
        r.id,
        sourceType,
        "ready",
        `${r.id}/photos`,
        r.totalBytes,
        r.photoCount,
        r.createdAt,
      );

      // Output asset, if a model was extracted.
      let outputAssetId: string | null = null;
      if (r.modelPath) {
        outputAssetId = randomUUID();
        const ext = r.modelPath.split(".").pop()?.toLowerCase();
        const outType = ext === "ply" || ext === "splat" || ext === "ksplat" ? "splat_ply" : "mesh_glb";
        insAsset.run(outputAssetId, r.id, outType, "ready", r.modelPath, 0, 1, r.finishedAt ?? r.createdAt);
      }

      // Reconstruction job — pano tours never had one.
      if (r.kind !== "pano_360") {
        insJob.run(
          randomUUID(),
          r.id,
          outputAssetId,
          "kiri",
          r.kiriSerialize,
          r.status,
          1,
          r.errorCode,
          r.errorMsg,
          r.startedAt ?? r.createdAt,
          r.finishedAt,
        );
      }
    }

    d.exec(`ALTER TABLE jobs RENAME TO jobs_legacy;`);
  },
];

function db(): Database.Database {
  if (_db) return _db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const d = new Database(DB_PATH);
  d.pragma("journal_mode = WAL");

  const current = d.pragma("user_version", { simple: true }) as number;
  for (let v = current; v < MIGRATIONS.length; v++) {
    d.transaction(() => {
      MIGRATIONS[v](d);
      d.pragma(`user_version = ${v + 1}`);
    })();
  }
  _db = d;
  return d;
}

// ── Captures ────────────────────────────────────────────────────────────────

export function insertCapture(c: CaptureRow): CaptureRow {
  db()
    .prepare(`INSERT INTO captures (id,name,kind,createdAt,archivedAt) VALUES (@id,@name,@kind,@createdAt,@archivedAt)`)
    .run(c);
  return c;
}

export function getCapture(id: string): CaptureRow | null {
  return (db().prepare(`SELECT * FROM captures WHERE id = ?`).get(id) as CaptureRow | undefined) ?? null;
}

export function listCaptures(opts?: { includeArchived?: boolean }): CaptureRow[] {
  const where = opts?.includeArchived ? "" : "WHERE archivedAt IS NULL";
  return db().prepare(`SELECT * FROM captures ${where} ORDER BY createdAt DESC`).all() as CaptureRow[];
}

export function archiveCaptureRow(id: string): void {
  db().prepare(`UPDATE captures SET archivedAt = ? WHERE id = ?`).run(Date.now(), id);
}

// ── Assets ──────────────────────────────────────────────────────────────────

export function insertAsset(a: AssetRow): AssetRow {
  db()
    .prepare(
      `INSERT INTO assets (id,captureId,type,status,path,bytes,count,createdAt)
       VALUES (@id,@captureId,@type,@status,@path,@bytes,@count,@createdAt)`,
    )
    .run(a);
  return a;
}

export function listAssets(captureId: string): AssetRow[] {
  return db().prepare(`SELECT * FROM assets WHERE captureId = ? ORDER BY createdAt`).all(captureId) as AssetRow[];
}

export function updateAsset(id: string, patch: { status?: AssetStatus; path?: string; bytes?: number }): void {
  const sets: string[] = [];
  const params: Record<string, unknown> = { id };
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) {
      sets.push(`${k} = @${k}`);
      params[k] = v;
    }
  }
  if (!sets.length) return;
  db().prepare(`UPDATE assets SET ${sets.join(", ")} WHERE id = @id`).run(params);
}

// ── Reconstruction jobs ─────────────────────────────────────────────────────

export function insertJob(j: JobRow): JobRow {
  db()
    .prepare(
      `INSERT INTO recon_jobs (id,captureId,outputAssetId,provider,providerJobId,status,attempts,errorCode,errorMsg,submittedAt,completedAt)
       VALUES (@id,@captureId,@outputAssetId,@provider,@providerJobId,@status,@attempts,@errorCode,@errorMsg,@submittedAt,@completedAt)`,
    )
    .run(j);
  return j;
}

export function getJobRow(id: string): JobRow | null {
  return (db().prepare(`SELECT * FROM recon_jobs WHERE id = ?`).get(id) as JobRow | undefined) ?? null;
}

// The most recent attempt for a capture (drives the capture's displayed status).
export function latestJobForCapture(captureId: string): JobRow | null {
  return (
    (db()
      .prepare(`SELECT * FROM recon_jobs WHERE captureId = ? ORDER BY submittedAt DESC, rowid DESC LIMIT 1`)
      .get(captureId) as JobRow | undefined) ?? null
  );
}

export function countJobsForCapture(captureId: string): number {
  return (
    db().prepare(`SELECT COUNT(*) AS n FROM recon_jobs WHERE captureId = ?`).get(captureId) as { n: number }
  ).n;
}

// All jobs still in flight — the sweeper's work list.
export function listActiveJobs(): JobRow[] {
  return db()
    .prepare(`SELECT * FROM recon_jobs WHERE status IN ('uploading','queued','processing')`)
    .all() as JobRow[];
}

export function updateJobRow(
  id: string,
  patch: Partial<Pick<JobRow, "outputAssetId" | "providerJobId" | "status" | "errorCode" | "errorMsg" | "completedAt">> & {
    status?: JobStatus;
  },
): void {
  const sets: string[] = [];
  const params: Record<string, unknown> = { id };
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) {
      sets.push(`${k} = @${k}`);
      params[k] = v;
    }
  }
  if (!sets.length) return;
  db().prepare(`UPDATE recon_jobs SET ${sets.join(", ")} WHERE id = @id`).run(params);
}
