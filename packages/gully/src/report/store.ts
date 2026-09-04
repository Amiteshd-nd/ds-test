/**
 * Local-first report queue.
 *
 * A report must survive a dead network, because the streets that need this
 * product are the ones with the worst signal. Everything lands in IndexedDB
 * first and syncs later; the capture flow never waits on a request.
 *
 * The row shape mirrors the `reports` table in PRD §6, so turning the sync on
 * is a mapping, not a migration.
 */
import type { LocalReport, ObstructionType, PhotoRedaction, ReportKind, ReportSource, SnapResult, Fix } from './types';

const DB = 'gully';
const VERSION = 1;
const REPORTS = 'reports';
const PHOTOS = 'photos';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(REPORTS)) {
        db.createObjectStore(REPORTS, { keyPath: 'id' }).createIndex('created_at', 'created_at');
      }
      if (!db.objectStoreNames.contains(PHOTOS)) db.createObjectStore(PHOTOS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = fn(db.transaction(store, mode).objectStore(store));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

/** Stable per-device id. Anonymous by construction — no account, no sign-in. */
export function reporterId(): string {
  const key = 'gully.reporter_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

export interface DraftReport {
  kind: ReportKind;
  source: ReportSource;
  fix: Fix;
  snap: SnapResult;
  obstruction_type: ObstructionType | null;
  classifier_conf: number | null;
  corrected: boolean;
  capture_ms: number;
  redaction: PhotoRedaction | null;
  photo: Blob | null;
}

export async function saveReport(draft: DraftReport): Promise<LocalReport> {
  const row: LocalReport = {
    id: crypto.randomUUID(),
    kind: draft.kind,
    created_at: Date.now(),
    segment_id: draft.snap.segment_id,
    obstruction_type: draft.obstruction_type,
    source: draft.source,
    classifier_conf: draft.classifier_conf,
    reporter_id: reporterId(),
    lat: draft.fix.lat,
    lng: draft.fix.lng,
    accuracy_m: draft.fix.accuracy_m,
    snap_distance_m: draft.snap.snap_distance_m,
    heading_deg: draft.fix.heading_deg,
    photo_key: null,
    redaction: draft.redaction,
    capture_ms: draft.capture_ms,
    corrected: draft.corrected,
    synced: false,
  };

  await tx(REPORTS, 'readwrite', (s) => s.put(row) as IDBRequest<IDBValidKey>);

  // The photo is kept only when redaction actually completed. Anything else and
  // the pixels are dropped here, not "later".
  if (draft.photo && draft.redaction?.complete) {
    await tx(PHOTOS, 'readwrite', (s) => s.put(draft.photo, row.id) as IDBRequest<IDBValidKey>);
  }

  void sync().catch(() => {});
  return row;
}

export function allReports(): Promise<LocalReport[]> {
  return tx(REPORTS, 'readonly', (s) => s.getAll() as IDBRequest<LocalReport[]>).then((rows) =>
    rows.sort((a, b) => b.created_at - a.created_at),
  );
}

export async function clearReports(): Promise<void> {
  await tx(REPORTS, 'readwrite', (s) => s.clear() as IDBRequest<undefined>);
  await tx(PHOTOS, 'readwrite', (s) => s.clear() as IDBRequest<undefined>);
}

// ── sync ────────────────────────────────────────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const remoteConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

/**
 * Push unsynced rows. Deliberately dumb: no retry backoff, no batching. Phase 2
 * only has to prove the row shape survives the trip; Phase 5 can make it clever.
 */
export async function sync(): Promise<{ pushed: number; skipped: number }> {
  const rows = (await allReports()).filter((r) => !r.synced);
  if (!remoteConfigured) return { pushed: 0, skipped: rows.length };

  let pushed = 0;
  for (const r of rows) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_KEY!,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          id: r.id,
          segment_id: r.segment_id,
          created_at: new Date(r.created_at).toISOString(),
          obstruction_type: r.obstruction_type,
          source: r.source,
          classifier_conf: r.classifier_conf,
          reporter_id: r.reporter_id,
          lat: r.lat,
          lng: r.lng,
          snap_distance_m: r.snap_distance_m,
          heading_deg: r.heading_deg,
          photo_key: r.photo_key,
          kind: r.kind,
        }),
      });
      if (!res.ok) continue;
      await tx(REPORTS, 'readwrite', (s) => s.put({ ...r, synced: true }) as IDBRequest<IDBValidKey>);
      pushed++;
    } catch {
      break; // offline; the queue keeps
    }
  }
  return { pushed, skipped: rows.length - pushed };
}
