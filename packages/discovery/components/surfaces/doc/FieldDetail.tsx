'use client';

/**
 * The open field — where the Repair Loop lives.
 *
 * The pattern's rules, applied to a form field rather than an utterance:
 *
 * - **Never discard the whole turn.** The field is repaired; the other 21 values,
 *   the provenance and the review marks all stand.
 * - **Disambiguation, not open retry.** The model's ranked alternates come first
 *   and typing is the second option, not the only one. When it has no alternates,
 *   it says so rather than showing an empty list.
 * - **One span at a time**, highest consequence first — which here means the flags
 *   are ordered: a conflict outranks an impossible value, which outranks an
 *   ambiguous glyph.
 * - **Capped at two attempts.** Then it says to send the document back, because a
 *   third guess is a design failure and not hers.
 *
 * Picking an alternate and typing a value are recorded as *different acts* — the
 * auditor can tell whether she chose from what the model saw or overrode it.
 */
import { useState } from 'react';
import { copy } from './copy';
import { fieldLabel, formatValue } from './Ledger';
import type { AgentEvent } from '@/lib/agent-runtime';
import type { Field } from '@/lib/surfaces/doc/reducer';
import styles from './doc.module.css';

const REVIEWER = 'Kavitha R';

export function FieldDetail({
  field,
  onEvents,
}: {
  field: Field;
  onEvents: (events: AgentEvent[]) => void;
}) {
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');

  const correct = (to: string, via: 'alternate' | 'typed') =>
    onEvents([
      { t: 'field.corrected', field: field.name, from: field.value, to, by: REVIEWER, at: Date.now(), via },
    ]);

  const agree = () =>
    onEvents([{ t: 'field.reviewed', field: field.name, by: REVIEWER, at: Date.now() }]);

  return (
    <div className={styles.detail}>
      <div className={styles.detailHead}>
        <span className={styles.detailName}>{fieldLabel(field.name)}</span>
        <span className={styles.detailMeta}>
          {copy.origin[field.origin]}
          {field.medium ? `, ${copy.medium[field.medium]}` : ''}
        </span>
      </div>

      {/* --- conflict: two sources, no default selection --- */}
      {field.conflict && !field.conflict.chosen ? (
        <>
          <p className={styles.detailWhy}>{copy.conflict.note}</p>
          <div className={styles.conflict}>
            {field.conflict.candidates.map((candidate) => (
              <div className={styles.candidate} key={candidate.value}>
                <span className={styles.candidateValue} lang={field.lang}>
                  {candidate.value}
                </span>
                <span className={styles.candidateSource}>{candidate.provenance.sourceId}</span>
                <button
                  type="button"
                  className={styles.button}
                  onClick={() => correct(candidate.value, 'alternate')}
                >
                  {copy.conflict.pick}
                </button>
              </div>
            ))}
          </div>
        </>
      ) : (
        <span className={styles.detailValue} lang={field.lang}>
          {formatValue(field.value)}
        </span>
      )}

      {/* --- read correctly, and impossible --- */}
      {field.outOfRange && (
        <>
          <p className={styles.blockHead}>{copy.range.heading}</p>
          <p className={styles.detailWhy}>
            {field.outOfRange.explanation} {copy.range.note}
          </p>
        </>
      )}

      {/* --- one mark, two readings --- */}
      {field.confusable && (
        <>
          <p className={styles.blockHead}>{copy.confusable.heading}</p>
          <p className={styles.detailWhy}>{copy.confusable.note}</p>
          <div className={styles.readings}>
            {field.confusable.readings.map((reading) => (
              <button
                key={reading.value}
                type="button"
                className={styles.reading}
                onClick={() => correct(reading.value, 'alternate')}
              >
                <span className={styles.readingGlyph} lang={field.lang}>
                  {reading.glyph}
                </span>
                <span className={styles.readingValue}>{reading.value}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* --- struck through on the paper --- */}
      {field.struckThrough && (
        <>
          <p className={styles.blockHead}>{copy.struck.heading}</p>
          <div className={styles.struckPair}>
            <span className={styles.struckVoid} lang={field.lang}>
              {field.struckThrough.voided}
            </span>
            <span className={styles.struckCurrent} lang={field.lang}>
              {field.struckThrough.current}
            </span>
          </div>
          <p className={styles.detailWhy}>{copy.struck.note}</p>
        </>
      )}

      {/* --- the repair loop --- */}
      {field.repairExhausted ? (
        <p className={styles.gateBlocked}>{copy.field.exhausted}</p>
      ) : (
        <>
          {field.alternates?.length ? (
            <div className={styles.alternates}>
              <span className={styles.detailMeta}>{copy.field.alternates}</span>
              {field.alternates.map((alternate) => (
                <button
                  key={alternate.value}
                  type="button"
                  className={styles.alternate}
                  onClick={() => correct(alternate.value, 'alternate')}
                >
                  <span className={styles.alternateValue} lang={field.lang}>
                    {alternate.value}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            /* An unresolved conflict already has two candidates on screen — telling
               her it has nothing to offer would be both false and a dead end. */
            field.band !== 'committed' &&
            !field.conflict && <p className={styles.detailWhy}>{copy.field.noAlternates}</p>
          )}

          {typing ? (
            <div className={styles.typeRow}>
              <input
                className={styles.input}
                value={draft}
                lang={field.lang}
                autoFocus
                aria-label={`${fieldLabel(field.name)} — ${copy.field.typeYourOwn}`}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && draft.trim()) {
                    // NFC before it goes anywhere: the same visible string can have
                    // different byte sequences, which breaks comparison and dedupe.
                    correct(draft.normalize('NFC').trim(), 'typed');
                    setTyping(false);
                    setDraft('');
                  }
                  if (event.key === 'Escape') setTyping(false);
                }}
              />
              <button
                type="button"
                className={styles.button}
                data-kind="primary"
                disabled={!draft.trim()}
                onClick={() => {
                  correct(draft.normalize('NFC').trim(), 'typed');
                  setTyping(false);
                  setDraft('');
                }}
              >
                {copy.field.save}
              </button>
            </div>
          ) : (
            <div className={styles.detailActions}>
              {field.review === 'unreviewed' && !field.conflict && (
                <button type="button" className={styles.button} data-kind="primary" onClick={agree}>
                  {copy.field.lookedAndAgreed}
                </button>
              )}
              <button type="button" className={styles.button} onClick={() => setTyping(true)}>
                {copy.field.typeYourOwn}
              </button>
            </div>
          )}
        </>
      )}

      {field.correction && (
        <p className={styles.detailMeta}>
          {copy.field.was} {formatValue(field.correction.from)} —{' '}
          {copy.field.correctedBy(field.correction.by)}
          {field.correction.via === 'typed' ? ', typed' : ', chosen from what it offered'}
        </p>
      )}
    </div>
  );
}
