// Child process for the durability test: starts a real run against a given database and
// prints a marker the parent uses to decide when to kill it. It never exits on its own.

import { createCortex, loadConfig, openDb, RunStore } from '../../src/core/index.ts';
import { createAtlasAdapters, hostName, principalById } from '../../adapters-host/index.ts';

const dbFile = process.argv[2];
const config = { ...loadConfig(), storage: { dsn: `file:${dbFile}` } };
const store = new RunStore(openDb(config.storage.dsn));
const adapters = createAtlasAdapters(store, config);
const cortex = createCortex({ adapters, hostName, config, store });

const principal = principalById('ananya');
if (!principal) throw new Error('fixture principal missing');

const run = await cortex.engine.start({
  agentId: 'atlas-guide',
  principal,
  surface: 'chat',
  threadId: cortex.engine.newThreadId(principal),
  text: 'Why is the ingestion v2 rollout stuck at forty percent?',
});
process.stdout.write(`RUN ${run.id}\n`);

for await (const { event } of adapters.transport.subscribe(run.id, 0)) {
  if (event.type === 'step_started' && event.name === 'compose') {
    process.stdout.write('COMPOSING\n');
  }
}
