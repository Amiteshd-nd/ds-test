'use client';

/**
 * The board: nine variants, ranked by suspicion, clean ones folded to one line.
 *
 * The ranking is derived — `suspicion()` in the reducer sums the flags, because the
 * decision was that nothing names the fluent-and-wrong corner. So the row has to
 * make that combination legible from the two axes alone: "Reads naturally: yes"
 * next to "Says the same thing: not sure" is the shape of the failure, and it sits
 * at the top of the list because the derivation put it there.
 *
 * Opening a variant is where the evidence lives — the mirror, the timeline, the
 * flags. Nine open at once would be unreadable, so one opens at a time.
 */
import { copy } from './copy';
import {
  flagsOf,
  isClean,
  notBackYet,
  rankedVariants,
  type ContentState,
  type Flag,
  type Variant,
} from '@/lib/surfaces/content/reducer';
import styles from './content.module.css';

/** Language names in English. Priya works in English chrome. */
const LANGUAGES: Record<string, string> = {
  'hi-IN': 'Hindi',
  'ta-IN': 'Tamil',
  'te-IN': 'Telugu',
  'kn-IN': 'Kannada',
  'ml-IN': 'Malayalam',
  'mr-IN': 'Marathi',
  'bn-IN': 'Bengali',
  'gu-IN': 'Gujarati',
  'en-IN': 'English',
};

const FLAG_LABEL: Record<Flag, string> = {
  clause_dropped: 'a clause is missing',
  fidelity: 'meaning moved',
  term: 'protected term translated',
  pronunciation: 'name sounds wrong',
  timing: 'does not fit the shot',
  voice: 'voice changes',
  register: 'not the register asked for',
  typography: 'subtitle problem',
};

export const languageName = (lang: string) => LANGUAGES[lang] ?? lang;

/** Which languages she can actually check herself. From the brief. */
export const SHE_READS = ['en-IN', 'kn-IN'];

function Axes({ variant }: { variant: Variant }) {
  return (
    <span className={styles.axes}>
      <span className={styles.axis}>
        <span className={styles.axisLabel}>{copy.axis.fluency}</span>
        <span className={styles.axisValue} data-band={variant.fluency}>
          {variant.fluency ? copy.axis[variant.fluency] : '—'}
        </span>
      </span>
      <span className={styles.axis}>
        <span className={styles.axisLabel}>{copy.axis.fidelity}</span>
        <span className={styles.axisValue} data-band={variant.fidelity}>
          {variant.fidelity ? copy.axis[variant.fidelity] : '—'}
        </span>
      </span>
    </span>
  );
}

export function Board({
  state,
  open,
  onOpen,
  expandClean,
  onExpandClean,
  children,
}: {
  state: ContentState;
  open?: string;
  onOpen: (lang: string) => void;
  expandClean: boolean;
  onExpandClean: (next: boolean) => void;
  /** The open variant's evidence, rendered by the page. */
  children?: (variant: Variant) => React.ReactNode;
}) {
  const ranked = rankedVariants(state);
  const flagged = ranked.filter((v) => !isClean(v) && !notBackYet(v));
  const clean = ranked.filter(isClean);
  const waiting = ranked.filter(notBackYet);

  if (!ranked.length) return <p className={styles.empty}>Nothing dubbed yet.</p>;

  const Row = ({ variant }: { variant: Variant }) => {
    const isOpen = variant.lang === open;
    const flags = flagsOf(variant);
    return (
      <li>
        <button
          type="button"
          className={styles.row}
          data-open={String(isOpen)}
          onClick={() => onOpen(isOpen ? '' : variant.lang)}
          aria-expanded={isOpen}
        >
          <span className={styles.lang}>
            <span className={styles.langName}>{languageName(variant.lang)}</span>
            <span className={styles.langTag}>{variant.lang}</span>
          </span>
          {/* Every Indic node carries lang, so per-script line height keys off it. */}
          <span className={styles.variantText} lang={variant.lang}>
            {variant.text ?? copy.board.waiting}
          </span>
          <span className={styles.rowRight}>
            <Axes variant={variant} />
            {flags.length > 0 && (
              <span className={styles.flags}>
                {flags.map((flag) => (
                  <span className={styles.flag} data-kind={flag} key={flag}>
                    {FLAG_LABEL[flag]}
                  </span>
                ))}
              </span>
            )}
            {variant.approved && (
              <span className={styles.axisLabel}>
                {variant.approved.verified ? copy.board.approved : copy.board.approvedUnverified}
              </span>
            )}
            {variant.review?.question && !variant.review.verdict && (
              <span className={styles.axisLabel}>{copy.board.inReview}</span>
            )}
          </span>
        </button>
        {isOpen && children?.(variant)}
      </li>
    );
  };

  return (
    <section className={styles.section} aria-labelledby="board">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle} id="board">
          {copy.board.heading}
        </h2>
        <span className={styles.sectionAside}>
          {flagged.length > 0 ? copy.head.flagged(flagged.length) : copy.head.clean(clean.length)}
        </span>
      </div>

      <ol className={styles.board}>
        {flagged.map((variant) => (
          <Row variant={variant} key={variant.lang} />
        ))}

        {/* Clean variants collapse. Agreement is not information — but it is still
            auditable, so the fold opens rather than hiding them for good. */}
        {clean.length > 0 && !expandClean && (
          <li className={styles.collapsed}>
            <span>{copy.board.cleanRow(clean.length)}</span>
            <button type="button" onClick={() => onExpandClean(true)}>
              {copy.board.expand}
            </button>
          </li>
        )}
        {expandClean && clean.map((variant) => <Row variant={variant} key={variant.lang} />)}
        {expandClean && clean.length > 0 && (
          <li className={styles.collapsed}>
            <button type="button" onClick={() => onExpandClean(false)}>
              {copy.board.collapse}
            </button>
          </li>
        )}

        {waiting.map((variant) => (
          <Row variant={variant} key={variant.lang} />
        ))}
      </ol>
    </section>
  );
}
