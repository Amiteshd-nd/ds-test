import { Crowd, CrowdProvider } from '@/components/crowd';
import { CrowdTips } from '@/components/crowd-tips';
import { Mascot } from '@/components/mascot';
import { TeaserLink } from '@/components/teaser-link';
import { WaitlistForm } from '@/components/waitlist-form';
import { content } from '@/content';

/**
 * Iteration 2: a white card on a crowd of architecture stickers. The stickers are
 * drawn in src/lib/stickers.ts and rendered as DOM by the Crowd component, in a
 * layer behind the card and a layer in front of it. Iteration 1, the dark page,
 * lives at /v1.
 */
export default function Home() {
  const year = new Date().getFullYear();
  const { hero } = content;

  return (
    <main className="paper-page relative h-dvh w-full overflow-hidden text-[#141414]">
      <CrowdProvider>
      <Crowd layer="back" />

      {/* pointer-events-none so the crowd behind can be hovered; the three surfaces turn it back on. */}
      <div className="pointer-events-none relative flex h-full flex-col px-[max(1rem,env(safe-area-inset-left),env(safe-area-inset-right))] pt-[max(0.875rem,env(safe-area-inset-top))] pb-[max(0.875rem,env(safe-area-inset-bottom))]">
        <header className="flex shrink-0 justify-center">
          <nav className="paper paper-outlined-thin pointer-events-auto relative z-30 flex items-center gap-4 rounded-full py-1.5 pr-1.5 pl-4 sm:gap-6">
            <span className="font-blackletter text-[1.375rem] leading-none font-bold">{content.productName}</span>
            <span className="hidden text-(length:--text-small) text-neutral-500 sm:inline">{content.header.status}</span>
            <a href={`mailto:${content.contactEmail}`} className="pill-button h-9 px-4 text-(length:--text-small)">
              {content.header.contact}
            </a>
          </nav>
        </header>

        <div className="grid min-h-0 flex-1 place-items-center py-3">
          <section
            aria-labelledby="headline"
            data-card
            className="paper paper-outlined pointer-events-auto enter enter-large flex w-[min(42rem,100%)] flex-col items-center rounded-3xl px-5 py-7 text-center sm:px-12 sm:py-10 short:py-4"
          >
            <Mascot className="h-[clamp(2.75rem,7dvh,4rem)] w-auto short:hidden" />
            <h1
              id="headline"
              className="mt-[clamp(0.75rem,2dvh,1.25rem)] max-w-[13em] font-serif text-[clamp(1.75rem,min(4vw,7dvh),2.875rem)] leading-[1.1] font-normal tracking-[-0.01em] text-balance"
            >
              {hero.headline.before}
              <em>{hero.headline.italic}</em>
              {hero.headline.after}
            </h1>
            <p className="mt-[clamp(0.625rem,2dvh,1rem)] max-w-[30em] text-(length:--text-lede) leading-relaxed text-neutral-600 text-balance short:hidden">
              {hero.lede}
            </p>
            <div className="mt-[clamp(1rem,3dvh,1.75rem)] w-full max-w-md short:mt-3">
              <WaitlistForm copy={content.form} tone="light" center />
            </div>
            <TeaserLink
              copy={content.teaser}
              className="inline-flex items-center gap-1.5 text-(length:--text-small) underline decoration-neutral-400 underline-offset-4 transition-colors duration-(--motion-duration-quick) hover:decoration-[#141414] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#141414]"
            />
          </section>
        </div>

        <footer className="flex shrink-0 justify-start">
          <p className="paper pointer-events-auto relative z-30 rounded-full px-3 py-1 text-(length:--text-mono) font-mono tracking-wide text-neutral-600 uppercase">
            © {year} {content.productName}
          </p>
        </footer>
      </div>

      <Crowd layer="front" />
      <CrowdTips />
      </CrowdProvider>
    </main>
  );
}
