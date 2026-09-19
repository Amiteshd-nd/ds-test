// Shared test setup. Each test file gets its own database file so `node --test` can run
// them in parallel without two suites writing the same runs table.

import fs from 'node:fs';
import path from 'node:path';
import { createCortex, loadConfig, openDb, RunStore } from '../src/core/index.ts';
import type { Cortex } from '../src/core/index.ts';
import { createAtlasAdapters, hostName } from '../adapters-host/index.ts';
import type { AtlasAdapters } from '../adapters-host/index.ts';
import { PACKAGE_ROOT } from '../src/core/config/config.ts';

export interface Harness { cortex: Cortex; adapters: AtlasAdapters; store: RunStore; dbFile: string }

export function harness(name: string): Harness {
  const dbFile = path.join(PACKAGE_ROOT, '.cortex', `test-${name}.db`);
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbFile + suffix, { force: true });
  const config = { ...loadConfig(), storage: { dsn: `file:${dbFile}` } };
  const store = new RunStore(openDb(config.storage.dsn));
  const adapters = createAtlasAdapters(store, config);
  const cortex = createCortex({ adapters, hostName, config, store });
  return { cortex, adapters, store, dbFile };
}

export async function drain(h: Harness, runId: string): Promise<{ text: string; events: string[] }> {
  let text = '';
  const events: string[] = [];
  for await (const { event } of h.adapters.transport.subscribe(runId, 0)) {
    events.push(event.type);
    if (event.type === 'token') text += event.text;
  }
  return { text, events };
}
