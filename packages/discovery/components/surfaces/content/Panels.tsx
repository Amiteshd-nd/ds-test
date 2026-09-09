'use client';

/**
 * The evidence blocks inside an open variant, plus the side column: consent,
 * escalation, the publish gate, non-findings.
 *
 * Three of these carry a rule that is easy to get wrong:
 *
 * - **`Pronunciation`** exists because the most common real failure is invisible in
 *   a transcript and inaudible to her. It works by transliterating what the model
 *   *actually said* back into scripts she reads, next to what it should have said.
 *   Both Latin and Kannada, per the decision — she and the next reviewer need
 *   different ones. The caveat is loud because the transliteration is the evidence,
 *   not the label, and mine are generated and unchecked.
 * - **`Consent`** warns and allows, by decision. So the words have to carry what a
 *   disabled button would have: whose voice, what was granted, what lapsed, and who
 *   chose to proceed. Nothing here says "verified" or shows a tick.
 * - **`PublishGate`** is a Consequence Gate. Publishing regulated medical claims she
 *   cannot evaluate is the moment friction is earned.
 */
import { useState } from 'react';
import { copy } from './copy';
import { languageName, SHE_READS } from './Board';
import type { AgentEvent } from '@/lib/agent-runtime';
import { publishability, shape, type ContentState, type Variant } from '@/lib/surfaces/content/reducer';
import styles from './content.module.css';

const OWNER = 'Priya S';

const at = (ms: number) => copy.head.duration(ms);

/* ---------------------------------------------------------------------------
   Inside an open variant
   ------------------------------------------------------------------------ */

export function ClauseDropped({ variant }: { variant: Variant }) {
  if (!variant.clauseDropped) return null;
  const { clause, atMs, regulated } = variant.clauseDropped;
  return (
    <div className={styles.flagBlock} data-kind="clause">
      <span className={styles.flagHead}>{copy.clause.heading}</span>
      <span className={styles.flagBody}>
        {copy.clause.at} {at(atMs)} — “{clause}”
      </span>
      {regulated && <span className={styles.flagCaveat}>{copy.clause.regulated}</span>}
    </div>
  );
}

export function TermViolations({
  variant,
  onEvents,
}: {
  variant: Variant;
  onEvents: (events: AgentEvent[]) => void;
}) {
  if (!variant.termViolations.length && !variant.pinnedTerms.length) return null;
  return (
    <>
      {variant.termViolations.map((violation) => (
        <div className={styles.flagBlock} data-kind="term" key={violation.term}>
          <span className={styles.flagHead}>{copy.term.heading}</span>
          <span className={styles.flagBody} lang={variant.lang}>
            {copy.term.body(violation.term, violation.renderedAs)}
          </span>
          <span className={styles.flagCaveat}>{copy.term.note}</span>
          <span>
            <button
              type="button"
              className={styles.button}
              onClick={() =>
                // Repair Loop: fix the term, keep the four minutes of audio.
                onEvents([
                  { t: 'term.pinned', lang: variant.lang, term: violation.term, renderAs: violation.term },
                  { t: 'segment.regenerated', lang: variant.lang, index: 0 },
                ])
              }
            >
              {copy.term.pin}
            </button>
          </span>
        </div>
      ))}
      {variant.pinnedTerms.map((pinned) => (
        <p className={styles.flagCaveat} key={pinned.term}>
          “{pinned.term}” {copy.term.pinned}, segment regenerated.
        </p>
      ))}
    </>
  );
}

export function Pronunciation({ variant }: { variant: Variant }) {
  if (!variant.pronunciation.length) return null;
  return (
    <>
      {variant.pronunciation.map((p) => (
        <div className={styles.flagBlock} data-kind="pronunciation" key={p.term}>
          <span className={styles.flagHead}>{copy.pronunciation.heading}</span>
          <span className={styles.flagBody}>
            “{p.term}” at {at(p.atMs)}. {copy.pronunciation.note}
          </span>
          <div className={styles.saidGrid}>
            <span className={styles.saidLabel} />
            <span className={styles.saidScript}>{copy.pronunciation.latin}</span>
            <span className={styles.saidScript}>{copy.pronunciation.kannada}</span>

            <span className={styles.saidLabel}>{copy.pronunciation.expected}</span>
            <span className={styles.saidValue}>{p.expected.latin}</span>
            <span className={styles.saidValue} lang="kn-IN">
              {p.expected.kannada ?? '—'}
            </span>

            <span className={styles.saidLabel}>{copy.pronunciation.actual}</span>
            <span className={styles.saidValue} data-role="actual">
              {p.actual.latin}
            </span>
            <span className={styles.saidValue} data-role="actual" lang="kn-IN">
              {p.actual.kannada ?? '—'}
            </span>
          </div>
          <span className={styles.flagCaveat}>{copy.pronunciation.unverified}</span>
        </div>
      ))}
    </>
  );
}

export function VoiceDrift({ variant }: { variant: Variant }) {
  if (!variant.voiceDrift) return null;
  const { fromMs, toMs, note } = variant.voiceDrift;
  return (
    <div className={styles.flagBlock} data-kind="pronunciation">
      <span className={styles.flagHead}>{copy.voice.heading}</span>
      <span className={styles.flagBody}>
        {copy.voice.at} {at(fromMs)} and {at(toMs)} — {note}
      </span>
    </div>
  );
}

export function TimingFlags({ variant }: { variant: Variant }) {
  const bad = variant.segments.filter((s) => s.timing !== 'fits');
  if (!bad.length) return null;
  return (
    <div className={styles.flagBlock} data-kind="term">
      <span className={styles.flagHead}>{copy.timing.heading}</span>
      {bad.map((segment) => (
        <span className={styles.flagBody} key={segment.index}>
          Segment {segment.index + 1} at {at(segment.startMs)} —{' '}
          {segment.timing === 'overrun'
            ? copy.timing.overrun(segment.overByMs ?? 0)
            : copy.timing.underrun(segment.overByMs ?? 0)}
        </span>
      ))}
    </div>
  );
}

/** The subtitle inside the box it has to live in — expansion as a design fact. */
export function SubtitleProof({ variant }: { variant: Variant }) {
  if (!variant.overflow && !variant.clipped && !variant.scriptFallback) return null;
  return (
    <div className={styles.flagBlock} data-kind="typography">
      <span className={styles.flagHead}>Subtitle</span>
      <div className={styles.probe}>
        <p className={styles.probeText} lang={variant.lang}>
          {variant.text}
          {variant.scriptFallback && <span className={styles.tofu}>&#9633;</span>}
        </p>
      </div>
      {variant.overflow && (
        <span className={styles.probeOver}>
          {copy.typography.overflow(variant.overflow.container, variant.overflow.overBy)}
        </span>
      )}
      {variant.clipped && <span className={styles.probeOver}>{copy.typography.clipped}</span>}
      {variant.scriptFallback && (
        <span className={styles.probeOver}>
          {copy.typography.fallback(variant.scriptFallback.codepoint)}
        </span>
      )}
    </div>
  );
}

/** Escalation: one question, one timecode. Aiming a scarce reviewer is the job. */
export function Escalation({
  variant,
  onEvents,
}: {
  variant: Variant;
  onEvents: (events: AgentEvent[]) => void;
}) {
  const review = variant.review;
  const [question, setQuestion] = useState(review?.question ?? '');

  if (review?.verdict) {
    return (
      <p className={styles.flagBody}>
        {review.verdict === 'approved'
          ? copy.review.approvedBy(review.by ?? 'The reviewer')
          : copy.review.rejectedBy(review.by ?? 'The reviewer')}
        {review.reason ? ` — ${review.reason}` : ''}
      </p>
    );
  }

  return (
    <div className={styles.flagBlock} data-kind="term">
      <span className={styles.flagHead}>{copy.review.heading}</span>
      <span className={styles.flagCaveat}>{copy.review.note}</span>
      {review?.timedOutSince && (
        <span className={styles.gateBlocked}>{copy.review.timedOut(review.timedOutSince)}</span>
      )}
      <span className={styles.flagBody}>
        {copy.review.question}: {question || '—'}
      </span>
      {review?.atMs !== undefined && (
        <span className={styles.flagCaveat}>
          {copy.clause.at} {at(review.atMs)}
          {review.clause ? ` — “${review.clause}”` : ''}
        </span>
      )}
      {!review?.timedOutSince && (
        <span>
          <button
            type="button"
            className={styles.button}
            disabled={!question}
            onClick={() =>
              onEvents([
                {
                  t: 'review.result',
                  lang: variant.lang,
                  by: 'Meera K (native reviewer)',
                  verdict: 'rejected',
                  reason: 'The second sentence does turn the exclusion into a condition',
                  at: Date.now(),
                },
              ])
            }
          >
            {copy.review.send}
          </button>
        </span>
      )}
    </div>
  );
}

export function ApproveVariant({
  variant,
  onEvents,
}: {
  variant: Variant;
  onEvents: (events: AgentEvent[]) => void;
}) {
  const canCheck = SHE_READS.includes(variant.lang);
  if (variant.approved) {
    return (
      <p className={styles.flagCaveat}>
        {variant.approved.verified ? copy.board.approved : copy.board.approvedUnverified} —{' '}
        {variant.approved.by}
      </p>
    );
  }
  return (
    <div className={styles.flagBlock} data-kind="term">
      <span className={styles.flagHead}>{copy.approve.heading}</span>
      <span className={styles.flagBody}>
        {canCheck ? copy.approve.canCheck : copy.approve.cannotCheck}
      </span>
      <span>
        <button
          type="button"
          className={styles.button}
          onClick={() =>
            onEvents([
              {
                t: 'variant.approved',
                lang: variant.lang,
                verified: canCheck,
                by: OWNER,
                at: Date.now(),
              },
            ])
          }
        >
          {canCheck ? copy.approve.approve : copy.approve.approveUnverified}
        </button>
      </span>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   The side column
   ------------------------------------------------------------------------ */

export function ConsentPanel({
  state,
  onEvents,
}: {
  state: ContentState;
  onEvents: (events: AgentEvent[]) => void;
}) {
  const consent = state.consent;
  if (!consent) return null;

  const body =
    consent.state === 'on_file'
      ? copy.consent.onFile(consent.voiceName, consent.grantedFor ?? '—', consent.untilIso ?? '—')
      : consent.state === 'expired'
        ? copy.consent.expired(consent.voiceName, consent.untilIso ?? '—')
        : consent.state === 'scope_exceeded'
          ? copy.consent.scope(consent.voiceName, consent.grantedFor ?? '—')
          : copy.consent.missing(consent.voiceName);

  return (
    <section className={styles.consent} data-state={consent.state} aria-labelledby="consent">
      <h2 className={styles.consentHead} id="consent">
        {copy.consent.heading}
      </h2>
      <p className={styles.consentBody}>{body}</p>
      {consent.note && <p className={styles.consentBody}>{consent.note}</p>}
      {consent.state !== 'on_file' && !state.consentAck && (
        <span>
          <button
            type="button"
            className={styles.button}
            onClick={() =>
              onEvents([
                {
                  t: 'consent.acknowledged',
                  voiceId: consent.voiceId,
                  by: OWNER,
                  at: Date.now(),
                  scope: 'Nine-language explainer dub, published to customers',
                },
              ])
            }
          >
            {copy.consent.proceed}
          </button>
        </span>
      )}
      {state.consentAck && (
        <p className={styles.consentAck}>
          {copy.consent.proceeded(state.consentAck.by)} — {state.consentAck.scope}
        </p>
      )}
    </section>
  );
}

/**
 * Errors. The gallery caught this one: with `unsupported_combination` the whole run
 * is a single error event, and the surface rendered an empty board — the worst
 * possible answer to "why is nothing here". A language that works for speech-to-text
 * and not for this voice has to be said before she waits.
 */
export function Errors({ state }: { state: ContentState }) {
  if (!state.errors.length) return null;
  return (
    <section className={styles.section} aria-labelledby="cerr">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle} id="cerr">
          Nothing came back
        </h2>
      </div>
      {state.errors.map((error) => (
        <div className={styles.flagBlock} data-kind="clause" key={error.message}>
          <span className={styles.flagHead}>{error.kind.replace(/_/g, ' ')}</span>
          <span className={styles.flagBody}>{error.message}</span>
          <span className={styles.flagCaveat}>
            {error.retryable ? 'Worth retrying.' : 'Retrying will not help.'}
          </span>
        </div>
      ))}
    </section>
  );
}

export function NonFindings({ state }: { state: ContentState }) {
  if (!state.nonfindings.length) return null;
  return (
    <section className={styles.section} aria-labelledby="cnf">
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle} id="cnf">
          {copy.nonfinding.heading}
        </h2>
      </div>
      {state.nonfindings.map((nf) => (
        <div className={styles.nonfinding} key={nf.looked_for}>
          <span className={styles.nonfindingWhat}>{nf.looked_for}</span>
          <span className={styles.nonfindingWhere}>
            {copy.nonfinding.where}: {nf.boundary.corpus}
          </span>
        </div>
      ))}
    </section>
  );
}

export function PublishGate({
  state,
  onEvents,
  onOpen,
}: {
  state: ContentState;
  onEvents: (events: AgentEvent[]) => void;
  onOpen: (lang: string) => void;
}) {
  const { blocking, unverified, canPublish, consentUnresolved } = publishability(state);
  const counts = shape(state);
  if (!counts.total) return null;

  return (
    <section className={styles.gate} aria-labelledby="publish">
      <h2 className={styles.gateHead} id="publish">
        {copy.approve.publish}
      </h2>
      <p className={styles.gateBody}>{copy.approve.publishConsequence}</p>

      {blocking.length > 0 && (
        <>
          <p className={styles.gateBlocked}>{copy.approve.publishBlocked(blocking.length)}</p>
          <ul className={styles.trail}>
            {blocking.map((variant) => (
              <li key={variant.lang}>
                <button
                  type="button"
                  className={styles.button}
                  data-kind="quiet"
                  onClick={() => onOpen(variant.lang)}
                >
                  {languageName(variant.lang)}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {unverified.length > 0 && (
        <p className={styles.gateUnverified}>{copy.approve.unverifiedCount(unverified.length)}</p>
      )}
      {consentUnresolved && (
        <p className={styles.gateBlocked}>
          The voice has no usable consent record and nobody has chosen to proceed.
        </p>
      )}

      <span>
        <button
          type="button"
          className={styles.button}
          data-kind="primary"
          disabled={!canPublish}
          onClick={() =>
            onEvents([
              {
                t: 'publish.blocked',
                reason: 'Published',
                langs: [],
              },
            ])
          }
        >
          {copy.approve.publish}
        </button>
      </span>
    </section>
  );
}
