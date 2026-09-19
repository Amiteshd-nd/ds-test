// Atlas's service entry.
//
// A host is a directory: its config, its adapters, its manifests, its prompts — and this
// file, which is the whole of what it takes to stand the service up. Compare
// hosts/harbor/server.ts, which is the same four lines for an unrelated product.

import { loadConfig } from '../core/config/config.ts';
import { createService } from './service.ts';
import { atlasHostRoutes, createAtlasAdapters, hostName } from '../../adapters-host/index.ts';

const service = createService({
  config: loadConfig(),
  hostName,
  createAdapters: createAtlasAdapters,
  hostRoutes: atlasHostRoutes,
});

await service.listen();
