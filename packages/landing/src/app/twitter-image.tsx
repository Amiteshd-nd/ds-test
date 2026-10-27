// Same card for X/Twitter. Config is repeated rather than re-exported: Next reads
// these exports statically and does not follow re-exports for them.
import { content } from '@/content';

export { default } from './opengraph-image';

export const alt = content.meta.title;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
