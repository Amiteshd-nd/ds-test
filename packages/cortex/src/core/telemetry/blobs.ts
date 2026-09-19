// Where trace payloads live. Addendum C1 item 4.
//
// Span rows hold metadata only. Full prompts, retrieved chunks, and model outputs go to
// a blob store keyed by `payload_ref`. That split is what makes self-hosted tracing cheap
// rather than a second database problem: the row table stays small and queryable forever,
// and the expensive part expires on a schedule.
//
// `BlobStore` is an interface for the same reason the other eight are: the addendum's
// open item 1 prefers the host's existing object storage over standing up MinIO, and a
// host that has S3 or GCS implements this in twenty lines rather than adopting ours.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface BlobStore {
  put(payload: unknown): Promise<string>;
  get(ref: string): Promise<unknown | null>;
  /** Remove everything written before `cutoff`. Returns how many went. */
  sweep(cutoff: Date): Promise<number>;
}

/** The default: one JSON file per payload, content-addressed. */
export class FileBlobStore implements BlobStore {
  readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
  }

  async put(payload: unknown): Promise<string> {
    const body = JSON.stringify(payload);
    // Content-addressed, so the same rendered prompt across a thousand runs is stored
    // once. Prompts are the largest and most repetitive thing in a trace.
    const ref = crypto.createHash('sha256').update(body).digest('hex').slice(0, 24);
    const file = path.join(this.dir, `${ref}.json`);
    if (!fs.existsSync(file)) fs.writeFileSync(file, body);
    return ref;
  }

  async get(ref: string): Promise<unknown | null> {
    const file = path.join(this.dir, `${ref}.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
  }

  async sweep(cutoff: Date): Promise<number> {
    if (!fs.existsSync(this.dir)) return 0;
    let removed = 0;
    for (const name of fs.readdirSync(this.dir)) {
      const file = path.join(this.dir, name);
      if (fs.statSync(file).mtime < cutoff) {
        fs.rmSync(file, { force: true });
        removed++;
      }
    }
    return removed;
  }
}

/** For tests and for hosts that want tracing metadata with no payloads at all. */
export class NullBlobStore implements BlobStore {
  async put(): Promise<string> {
    return '';
  }
  async get(): Promise<null> {
    return null;
  }
  async sweep(): Promise<number> {
    return 0;
  }
}
