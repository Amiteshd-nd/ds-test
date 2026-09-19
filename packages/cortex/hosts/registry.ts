// Finding the host this process is running, by convention rather than by registration.
//
// A real deployment has exactly one host and does not need this file: its entry point
// imports its own adapters and that is the end of it. This repo contains several, and the
// tools that must work against any of them — `doctor`, `dod`, the eval runner — resolve
// the host from the id in its config.
//
// It was a hand-maintained map until `cortex init` scaffolded a host and the next command
// crashed with "add it to hosts/registry.ts". A step that a generator cannot do for you is
// a step someone will forget, so this loads `hosts/<id>/index.ts` and expects two exports.

import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { HostAdapters } from '../src/core/adapters/index.ts';
import type { CortexConfig } from '../src/core/config/config.ts';
import type { RunStore } from '../src/core/runtime/store.ts';
import { PACKAGE_ROOT } from '../src/core/config/config.ts';
import type { ConformanceFixture } from '../tests/conformance/suite.ts';

export interface HostDefinition {
  id: string;
  name: string;
  createAdapters: (store: RunStore, config: CortexConfig) => HostAdapters;
  /**
   * The conformance fixture travels with the host, because "a principal, another
   * principal, a ref the first may read and one they may not" is a question only the host
   * can answer — and the suite is worthless without a real answer.
   */
  conformanceFixture?: () => Promise<ConformanceFixture>;
}

interface HostModule {
  hostName?: string;
  createAdapters?: HostDefinition['createAdapters'];
  conformanceFixture?: HostDefinition['conformanceFixture'];
  [key: string]: unknown;
}

/** Where a host with this id might live. Atlas predates the convention. */
function candidates(id: string): string[] {
  return [
    path.join(PACKAGE_ROOT, 'hosts', id, 'index.ts'),
    ...(id === 'atlas' ? [path.join(PACKAGE_ROOT, 'adapters-host', 'index.ts')] : []),
  ];
}

export async function hostFor(config: CortexConfig): Promise<HostDefinition> {
  const id = config.host.id;
  const file = candidates(id).find((f) => fs.existsSync(f));
  if (!file) {
    throw new Error(
      `No host directory for "${id}". Expected hosts/${id}/index.ts — run \`node scripts/init.ts ${id}\` to scaffold one.`,
    );
  }

  const mod = (await import(pathToFileURL(file).href)) as HostModule;

  // `createAdapters` is the convention; `createFooAdapters` is what a host is likely to
  // have called it, so both work and neither has to be registered anywhere.
  const create =
    mod.createAdapters ??
    (Object.entries(mod).find(([key]) => /^create[A-Z]\w*Adapters$/.test(key))?.[1] as HostDefinition['createAdapters'] | undefined);

  if (!create) {
    throw new Error(
      `hosts/${id}/index.ts exports no adapter factory. Export \`createAdapters\` (or \`create${id[0].toUpperCase()}${id.slice(1)}Adapters\`).`,
    );
  }

  return {
    id,
    name: mod.hostName ?? id,
    createAdapters: create,
    conformanceFixture: mod.conformanceFixture,
  };
}
