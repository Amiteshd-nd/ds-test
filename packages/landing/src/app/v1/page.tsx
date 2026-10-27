import type { Metadata } from 'next';

import { Aurora } from '@/components/aurora';
import { HeroFrame } from '@/components/hero-frame';
import { WaitlistForm } from '@/components/waitlist-form';
import { content } from '@/content';

// Static import so Next reads the dimensions and builds the blur placeholder at
// build time. Swap the file at public/bg.jpg and rebuild: no code changes.
import render from '../../../public/bg.jpg';

// The root layout's canonical points at /, which is iteration 2. This page is
// its own URL for as long as both exist; delete the loser before launch.
export const metadata: Metadata = { alternates: { canonical: '/v1' } };

export default function Home() {
  const year = new Date().getFullYear();
  const { hero } = content;

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-ground">
      <Aurora />

      <div className="relative flex h-full flex-col px-[max(1.25rem,env(safe-area-inset-left),env(safe-area-inset-right))] pt-[max(1rem,env(safe-area-inset-top))] pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:px-[max(2.5rem,env(safe-area-inset-left),env(safe-area-inset-right))] lg:px-[max(4rem,env(safe-area-inset-left),env(safe-area-inset-right))]">
        <header className="flex shrink-0 items-center justify-between gap-4 sm:pt-2">
          <span className="chrome-text font-blackletter text-(length:--text-wordmark) leading-none font-bold">
            {content.productName}
          </span>
          <span className="font-mono text-(length:--text-mono) tracking-wide text-ink-dim uppercase">
            {content.header.status}
          </span>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 content-center gap-x-10 gap-y-[clamp(1rem,3dvh,2rem)] py-[clamp(0.75rem,3dvh,2rem)] lg:grid-cols-12 lg:items-center">
          <section aria-labelledby="headline" className="flex flex-col lg:col-span-6 xl:col-span-6">
            <p className="enter font-mono text-(length:--text-mono) tracking-wide text-accent uppercase short:hidden" style={{ ['--i' as string]: 0 }}>
              {hero.eyebrow}
            </p>
            <h1
              id="headline"
              className="enter enter-large mt-[clamp(0.75rem,2dvh,1.25rem)] max-w-[8em] font-serif text-(length:--text-headline) leading-[1.04] font-normal tracking-[-0.015em] text-balance"
              style={{ ['--i' as string]: 1 }}
            >
              {hero.headline.before}
              <em>{hero.headline.italic}</em>
              {hero.headline.after}
            </h1>
            <p className="enter mt-[clamp(0.75rem,2.5dvh,1.5rem)] max-w-[24em] text-(length:--text-lede) leading-relaxed text-ink-dim short:hidden" style={{ ['--i' as string]: 2 }}>
              {hero.lede}
            </p>
            <div className="enter mt-[clamp(1rem,3.5dvh,2rem)] w-full max-w-md" style={{ ['--i' as string]: 3 }}>
              <WaitlistForm copy={content.form} />
            </div>
          </section>

          <div className="enter enter-large flex min-h-0 items-center justify-center lg:col-span-6 lg:justify-end" style={{ ['--i' as string]: 2 }}>
            <HeroFrame
              image={render}
              alt={hero.imageAlt}
              copy={content.teaser}
              className="aspect-[3/2] h-[clamp(8rem,min(26dvh,42vw),16rem)] max-w-full short:hidden lg:h-auto lg:w-full lg:max-h-[min(58dvh,34rem)] lg:max-w-[min(100%,calc(58dvh*1.5))]"
            />
          </div>
        </div>

        <footer className="flex shrink-0 items-end justify-between gap-4 font-mono text-(length:--text-mono) tracking-wide text-ink-faint uppercase">
          <p>
            © {year} {content.productName}
          </p>
          <a
            href={`mailto:${content.contactEmail}`}
            className="normal-case underline-offset-4 transition-colors duration-(--motion-duration-quick) hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {content.contactEmail}
          </a>
        </footer>
      </div>
    </main>
  );
}
