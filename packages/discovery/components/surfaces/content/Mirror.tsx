'use client';

/**
 * The Back-translation Mirror — pattern 13, and this surface's one bold thing.
 *
 * The whole argument: Priya cannot evaluate a Tamil dub, but she can read English.
 * Round-trip the dub back into English and put it beside the source, and the failure
 * that matters — fluent and wrong — becomes visible without her learning Tamil.
 *
 * Three rules from the pattern, and where each lands:
 *
 * - **Marks change only.** Agreement is not information, so a `held` sentence gets
 *   no treatment at all. The colours are reserved for `added` / `removed` / `moved`
 *   and nothing else in this product may use them.
 * - **Never a score.** No similarity percentage, no "92% match". The diff is the
 *   evidence and the reader does the judging.
 * - **Never a certificate.** The note says what a clean round trip does and does not
 *   prove. A back-translation that matches means the meaning survived *this* trip —
 *   not that the dub is correct, and not that the pronunciation is right.
 *
 * Sentence alignment is by index, which is what the runtime gives. Real alignment
 * across a translation is harder than that and would need the model's own sentence
 * map; when there is one, this component takes it and nothing else changes.
 */
import { copy } from './copy';
import type { Drift, Variant } from '@/lib/surfaces/content/reducer';
import styles from './content.module.css';

/** Split on sentence enders, keeping it simple: the runtime indexes by sentence. */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const KIND_LABEL: Record<Drift['kind'], string> = {
  added: copy.mirror.added,
  removed: copy.mirror.removed,
  moved: copy.mirror.moved,
  held: copy.mirror.held,
};

export function Mirror({
  variant,
  sourceText,
}: {
  variant: Variant;
  sourceText: string;
}) {
  const back = variant.backtranslation;
  if (!back) return null;

  const backSentences = sentences(back.text);
  const sourceSentences = sentences(sourceText);
  const driftFor = (index: number) => back.drift.find((d) => d.sentenceIdx === index);
  const moved = back.drift.filter((d) => d.kind !== 'held');

  return (
    <section className={styles.mirror} aria-labelledby={`mirror-${variant.lang}`}>
      <div className={styles.sectionHead}>
        <h3 className={styles.sectionTitle} id={`mirror-${variant.lang}`}>
          {copy.mirror.heading}
        </h3>
      </div>

      <div className={styles.mirrorPair}>
        <div className={styles.mirrorSide}>
          <span className={styles.mirrorLabel}>{copy.mirror.source}</span>
          <p className={styles.mirrorText}>
            {sourceSentences.map((sentence, i) => (
              <span key={i}>{sentence} </span>
            ))}
          </p>
        </div>
        <div className={styles.mirrorSide}>
          <span className={styles.mirrorLabel}>{copy.mirror.back}</span>
          <p className={styles.mirrorText}>
            {backSentences.map((sentence, i) => {
              const drift = driftFor(i);
              // A held sentence gets no mark. Agreement is not information.
              if (!drift || drift.kind === 'held') return <span key={i}>{sentence} </span>;
              return (
                <span key={i} className={styles.drift} data-kind={drift.kind}>
                  {sentence}{' '}
                </span>
              );
            })}
          </p>
        </div>
      </div>

      {moved.length > 0 ? (
        <div className={styles.driftList}>
          <span className={styles.mirrorLabel}>{copy.mirror.driftHeading}</span>
          {moved.map((drift) => (
            <div className={styles.driftItem} key={`${drift.sentenceIdx}-${drift.kind}`}>
              <span className={styles.driftKind} data-kind={drift.kind}>
                {KIND_LABEL[drift.kind]}
              </span>
              <span>{drift.note ?? backSentences[drift.sentenceIdx] ?? ''}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className={styles.note}>{copy.mirror.noDrift}</p>
      )}

      {/* The caveat is content, not a footnote. A clean trip is not a certificate. */}
      <p className={styles.note}>{copy.mirror.note}</p>
    </section>
  );
}
