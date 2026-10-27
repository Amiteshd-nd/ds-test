import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

const pub = (...parts: string[]) => path.join(process.cwd(), 'public', ...parts);

/** Font files for next/og. It needs TTF/OTF bytes; next/font's woff2 output will not do. */
export async function loadBrandFonts() {
  const [serif, blackletter] = await Promise.all([
    readFile(pub('fonts', 'Newsreader-Regular.ttf')),
    readFile(pub('fonts', 'UnifrakturCook-Bold.ttf')),
  ]);
  return [
    { name: 'Newsreader', data: serif, weight: 400 as const, style: 'normal' as const },
    { name: 'UnifrakturCook', data: blackletter, weight: 700 as const, style: 'normal' as const },
  ];
}

/** The hero render as a data URL, so the share card shows the same image. */
export async function loadRenderDataUrl() {
  const bytes = await readFile(pub('bg.jpg'));
  return `data:image/jpeg;base64,${bytes.toString('base64')}`;
}
