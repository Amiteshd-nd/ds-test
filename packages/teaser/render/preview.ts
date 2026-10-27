/**
 * Serves demo/ and prints a URL with a scrub bar, so the timeline can be
 * checked in a browser before a render.  node render/preview.ts
 */
import path from 'node:path';
import { serve } from './serve.ts';

const { url } = await serve(path.join(import.meta.dirname, '..', 'demo'));
console.log(`preview: ${url}?scrub=1   (left/right arrows step a frame, space plays)`);
