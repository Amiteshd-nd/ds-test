import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { ImageResponse } from 'next/og';

import { content } from '@/content';
import { loadBrandFonts } from '@/lib/brand-assets';
import { LANDMARK_SLUGS } from '@/lib/landmarks';
import { layoutCrowd } from '@/lib/stickers';

export const alt = content.meta.title;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const { before, italic, after } = content.hero.headline;

/** The default page in miniature: the sticker crowd with the white card on top. */
export default async function OpengraphImage() {
  const fonts = await loadBrandFonts();

  // The same crowd as the page, laid out for the card's proportions.
  const stickers = new Map<string, string>();
  for (const slug of LANDMARK_SLUGS) {
    const bytes = await readFile(path.join(process.cwd(), 'public', 'stickers', `${slug}.png`));
    stickers.set(slug, `data:image/png;base64,${bytes.toString('base64')}`);
  }
  const placements = layoutCrowd({ width: 1200, height: 630, cols: 13, rows: 7, seed: 11 });

  return new ImageResponse(
    (
      <div
        style={{
          position: 'relative',
          display: 'flex',
          width: '100%',
          height: '100%',
          background: '#fff',
          color: '#141414',
          overflow: 'hidden',
        }}
      >
        {placements.map((p, i) => {
          const px = 100 * p.scale * 0.56;
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={stickers.get(p.name)}
              alt=""
              width={px}
              height={px}
              style={{
                position: 'absolute',
                left: p.x - px / 2,
                top: p.y - px / 2,
                transform: `rotate(${p.rot.toFixed(1)}deg)`,
              }}
            />
          );
        })}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              width: 760,
              padding: '56px 64px',
              background: '#fff',
              borderRadius: 28,
              border: '3px solid #141414',
              boxShadow: '0 30px 60px -20px rgba(0,0,0,0.35)',
            }}
          >
            <div style={{ fontFamily: 'UnifrakturCook', fontSize: 34 }}>{content.productName}</div>
            <div
              style={{
                marginTop: 24,
                textAlign: 'center',
                fontFamily: 'Newsreader',
                fontSize: 58,
                lineHeight: 1.1,
                letterSpacing: '-0.01em',
              }}
            >
              {`${before}${italic}${after}`}
            </div>
            <div
              style={{
                marginTop: 20,
                textAlign: 'center',
                fontSize: 22,
                lineHeight: 1.45,
                color: '#555',
              }}
            >
              {content.hero.lede}
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
