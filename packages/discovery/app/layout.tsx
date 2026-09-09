import type { Metadata } from 'next';
import '@/styles/tokens.css';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'Discovery — agentic UI',
  description: 'Six surfaces, one design grammar. Prototypes for user testing, not production software.',
  robots: { index: false, follow: false },
};

/* One `data-product` per route decides the theme; the shell owns the default.
   Fonts: tokens name "Anek Latin" and fall back to the system stack. Anek is not
   loaded yet — per-script subsets are a real decision (docs/tech-stack.md) and
   loading nine scripts unsubsetted is megabytes, so it waits for `content`. */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-product="shell">
      <body>{children}</body>
    </html>
  );
}
