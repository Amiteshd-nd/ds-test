import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono, Newsreader, UnifrakturCook } from 'next/font/google';

import { content } from '@/content';
import { siteUrl } from '@/lib/site';

import './globals.css';

// Variable font with an optical-size axis: at headline sizes it sharpens its
// serifs and tightens its spacing on its own, which is why it was picked over a
// single-master display serif.
const serif = Newsreader({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  axes: ['opsz'],
  display: 'swap',
  variable: '--font-newsreader',
});

const blackletter = UnifrakturCook({
  weight: '700',
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-unifraktur',
});

const sans = Geist({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-geist',
});

const mono = Geist_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-geist-mono',
});

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: content.meta.title,
  description: content.meta.description,
  applicationName: content.productName,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: content.productName,
    title: content.meta.title,
    description: content.meta.description,
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: content.meta.title,
    description: content.meta.description,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  // Lets the page draw under the notch and home indicator; the layout pads back
  // in with env(safe-area-inset-*).
  viewportFit: 'cover',
  themeColor: '#0e0f10',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${serif.variable} ${blackletter.variable} ${sans.variable} ${mono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
