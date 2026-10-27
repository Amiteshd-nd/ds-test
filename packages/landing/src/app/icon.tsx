import { ImageResponse } from 'next/og';

import { content } from '@/content';
import { loadBrandFonts } from '@/lib/brand-assets';

export const size = { width: 64, height: 64 };
export const contentType = 'image/png';

/** The wordmark's first letter in chrome on the page's dark ground. */
export default async function Icon() {
  const fonts = await loadBrandFonts();
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0e0f10',
          color: '#e6e7e3',
          fontFamily: 'UnifrakturCook',
          fontSize: 50,
          paddingBottom: 4,
        }}
      >
        {content.productName.charAt(0)}
      </div>
    ),
    { ...size, fonts },
  );
}
