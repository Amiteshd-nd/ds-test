'use client';

/**
 * The source document, rendered, with the provenance overlay on top.
 *
 * Provenance Link's rules, and how each lands here:
 *
 * - **Region, not document.** The highlight is the field's own box, and everything
 *   else on the page dims. "Page 4" is not provenance, so a `page`-precision region
 *   dims nothing and says what it can't point at instead of drawing a fake box.
 * - **Same screen.** No modal, no route change. Selecting a field on the left moves
 *   this pane; her place on the page is never lost.
 * - **The degenerate case is the design.** A rotated, blurred photocopy still has to
 *   support pointing, so the overlay lives in the same transformed space as the page
 *   — rotate the paper and the box rotates with it, because it's a child of it.
 *
 * The page is drawn, not photographed: an SVG-free HTML page in a normalised
 * coordinate space, positioned in percentages. That means the overlay maths is
 * identical to the maths over pdf.js output — see the note in form.ts.
 */
import { useEffect, useRef } from 'react';
import { copy } from './copy';
import { FORM_TITLE, linesFor, type FormLine } from './form';
import type { DocState, Field } from '@/lib/surfaces/doc/reducer';
import styles from './doc.module.css';

function WrittenValue({ line }: { line: FormLine }) {
  if (line.smudged) {
    return <span className={styles.smudge} aria-label={copy.source.unreadable} />;
  }
  return (
    <>
      {line.struck && (
        <span className={styles.struck} lang={line.lang}>
          {line.struck}
        </span>
      )}
      <span className={styles.written} lang={line.lang}>
        {line.written}
      </span>
    </>
  );
}

export function SourcePane({
  state,
  selected,
  page,
  onPage,
}: {
  state: DocState;
  selected?: Field;
  page: number;
  onPage: (page: number) => void;
}) {
  const region = selected?.provenance?.region;
  const precision = selected?.provenance?.precision ?? (region ? 'region' : 'none');
  const degraded = state.source?.degraded ?? [];
  const pages = state.source?.pages ?? 1;
  const paperRef = useRef<HTMLDivElement>(null);

  // Following a field to another page is the interface's job, not hers.
  useEffect(() => {
    if (region && region.page !== page) onPage(region.page);
  }, [region, page, onPage]);

  return (
    <div className={styles.sourcePane}>
      <div className={styles.sourceHead}>
        <span className={styles.sourceLabel}>{state.source?.label ?? copy.source.none}</span>
        <span className={styles.pager}>
          {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              className={styles.pageButton}
              data-here={String(n === page)}
              onClick={() => onPage(n)}
              aria-current={n === page ? 'page' : undefined}
            >
              {n}
            </button>
          ))}
        </span>
      </div>

      {degraded.length > 0 && (
        <p className={styles.degraded}>{copy.source.degraded(degraded)}</p>
      )}
      {precision === 'page' && (
        <p className={styles.provNote}>{copy.source.pageOnly}</p>
      )}
      {precision === 'none' && selected && !selected.conflict && (
        <p className={styles.provNote}>{copy.source.noProvenance}</p>
      )}
      {selected?.conflict && !selected.conflict.chosen && (
        <p className={styles.provNote}>
          {copy.source.elsewhere(selected.conflict.candidates.map((c) => c.provenance.sourceId))}
        </p>
      )}

      <div className={styles.paperFrame}>
        <div
          className={styles.paper}
          ref={paperRef}
          data-rotated={String(degraded.includes('rotated'))}
          data-blurred={String(degraded.includes('blurred'))}
          data-cut={String(degraded.includes('cut_off'))}
          data-dimmed={String(!!region && region.page === page && precision === 'region')}
        >
          <div className={styles.paperHead}>
            <span className={styles.formTitle} lang="ta-IN">
              {FORM_TITLE.ta}
            </span>
            <span className={styles.formTitleEn}>{FORM_TITLE.en}</span>
            <span className={styles.formMeta}>
              {FORM_TITLE.meta} {page} / {pages}
            </span>
          </div>

          {linesFor(page).map((line) => (
            <div
              key={`${line.page}-${line.label}`}
              className={styles.formLine}
              /* The dim exists to make ONE region readable. Dimming the selected
                 line along with the rest defeats the whole pattern, so the line
                 the provenance points at is exempt. */
              data-lit={String(!!selected && line.field === selected.name)}
              style={{
                left: `${(line.region.x - (line.labelSpan ?? 0.22)) * 100}%`,
                top: `${line.region.y * 100}%`,
                width: `${(line.region.w + (line.labelSpan ?? 0.22)) * 100}%`,
                ['--label-span' as string]: `${(line.labelSpan ?? 0.22) * 100}%`,
              }}
            >
              <span className={styles.printedLabel}>
                {line.labelTa && (
                  <span lang="ta-IN" className={styles.printedTa}>
                    {line.labelTa}
                  </span>
                )}
                <span>{line.label}</span>
              </span>
              <span className={styles.valueSlot}>
                <WrittenValue line={line} />
              </span>
            </div>
          ))}

          {/* The overlay is a child of the paper, so it inherits every degradation
              transform. Highlighting a region on a rotated scan needs no maths. */}
          {region && region.page === page && precision === 'region' && (
            <span
              className={styles.regionRing}
              style={{
                left: `${region.x * 100}%`,
                top: `${region.y * 100}%`,
                width: `${region.w * 100}%`,
                height: `${region.h * 100}%`,
              }}
              aria-hidden="true"
            />
          )}
        </div>
      </div>

      {selected && (
        <p className={styles.sourceFoot}>
          {region && region.page === page
            ? copy.source.showing(selected.name, page)
            : copy.source.notOnPage(page)}
        </p>
      )}
    </div>
  );
}
