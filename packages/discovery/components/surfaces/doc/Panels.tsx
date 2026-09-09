'use client';

/**
 * The rest of the left column: non-findings, the systematic-error banner, the
 * accept gate, and the export choice.
 *
 * The gate is a Consequence Gate (pattern 4) and is deliberately a different *kind*
 * of thing from the rows above it — a heavier border, a sentence about what happens,
 * and two channels of friction rather than one. Friction is placed where consequence
 * earns it: agreeing with a clearly-read field is one click; sending 22 values into a
 * credit decision is not.
 *
 * The bulk action can only clear fields that don't need eyes. That's the behavioural
 * half of Confidence Without Numbers, and it lives in `needsEyes()` in the reducer.
 */
import { copy } from './copy';
import { fieldLabel } from './Ledger';
import type { AgentEvent } from '@/lib/agent-runtime';
import {
  auditLine,
  correctionsOf,
  verification,
  type DocState,
  type ExportFormat,
} from '@/lib/surfaces/doc/reducer';
import styles from './doc.module.css';

const REVIEWER = 'Kavitha R';

export function NonFindings({ state }: { state: DocState }) {
  if (!state.nonfindings.length) return null;
  return (
    <section className={styles.block} aria-labelledby="nf">
      <h2 className={styles.blockHead} id="nf">
        {copy.nonfinding.heading}
      </h2>
      <ul>
        {state.nonfindings.map((nf) => (
          <li className={styles.nonfinding} key={nf.looked_for}>
            <span className={styles.nonfindingWhat}>{nf.looked_for}</span>
            <span className={styles.nonfindingKind}>{copy.nonfinding[nf.kind]}</span>
            <span className={styles.nonfindingWhere}>
              {copy.nonfinding.where}: {nf.boundary.corpus}
              {nf.boundary.languages ? ` (${nf.boundary.languages.join(', ')})` : ''}
            </span>
            {/* Absent and illegible have different next actions. That's the reason
                the two states are kept apart at all. */}
            <span className={styles.nonfindingNext}>
              {nf.kind === 'absent' ? copy.nonfinding.nextAbsent : copy.nonfinding.nextIllegible}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SystematicBanner({
  state,
  onSelect,
}: {
  state: DocState;
  onSelect: (field: string) => void;
}) {
  const systematic = state.systematic;
  if (!systematic) return null;
  return (
    <div className={styles.systematic} role="group" aria-label={copy.systematic.heading}>
      <span className={styles.systematicHead}>{copy.systematic.heading}</span>
      <p className={styles.blockNote}>
        {copy.systematic.body(
          fieldLabel(systematic.field),
          systematic.documentsAffected,
          systematic.documentType,
        )}
      </p>
      <p className={styles.blockNote}>{copy.systematic.note}</p>
      <div className={styles.gateActions}>
        <button type="button" className={styles.button} onClick={() => onSelect(systematic.field)}>
          Show me the field
        </button>
      </div>
    </div>
  );
}

export function ScriptFallbacks({ state }: { state: DocState }) {
  if (!state.scriptFallbacks.length) return null;
  return (
    <>
      {state.scriptFallbacks.map((fallback) => (
        <p className={styles.fallback} key={fallback.codepoint}>
          <strong>{copy.scriptFallback.heading}. </strong>
          {copy.scriptFallback.body(fallback.lang, fallback.codepoint)}
        </p>
      ))}
    </>
  );
}

export function AcceptGate({
  state,
  onEvents,
  onSelect,
}: {
  state: DocState;
  onEvents: (events: AgentEvent[]) => void;
  onSelect: (field: string) => void;
}) {
  const { checked, total, blocking, bulkable, canAccept, partial } = verification(state);
  const decided = ['accepted', 'accepted_partially_verified', 'rejected', 'escalated'].includes(
    state.docState,
  );
  const corrections = correctionsOf(state);

  return (
    <div className={styles.gate}>
      <span className={styles.gateHead}>{copy.accept.heading}</span>
      <p className={styles.gateConsequence}>{copy.accept.consequence(total)}</p>

      {blocking.length > 0 && (
        <>
          <p className={styles.gateBlocked}>{copy.accept.blocked(blocking.length)}</p>
          <ul className={styles.trail}>
            {blocking.slice(0, 6).map((field) => (
              <li key={field.name}>
                <button
                  type="button"
                  className={styles.button}
                  data-kind="quiet"
                  onClick={() => onSelect(field.name)}
                >
                  {fieldLabel(field.name)}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {partial && blocking.length === 0 && (
        <p className={styles.gatePartial}>{copy.accept.partialWarning(checked, total)}</p>
      )}

      {!decided ? (
        <div className={styles.gateActions}>
          {bulkable.length > 0 && (
            <button
              type="button"
              className={styles.button}
              onClick={() =>
                onEvents(
                  bulkable.map((field) => ({
                    t: 'field.reviewed',
                    field: field.name,
                    by: REVIEWER,
                    at: Date.now(),
                  })),
                )
              }
            >
              {copy.accept.bulk(bulkable.length)}
            </button>
          )}
          <button
            type="button"
            className={styles.button}
            data-kind="primary"
            disabled={!canAccept}
            onClick={() =>
              onEvents([
                {
                  t: 'doc.state',
                  state: checked === total ? 'accepted' : 'accepted_partially_verified',
                  at: Date.now(),
                  verified: { checked, total },
                },
              ])
            }
          >
            {copy.accept.accept}
          </button>
          <button
            type="button"
            className={styles.button}
            onClick={() => onEvents([{ t: 'doc.state', state: 'rejected', at: Date.now() }])}
          >
            {copy.accept.reject}
          </button>
          <button
            type="button"
            className={styles.button}
            onClick={() => onEvents([{ t: 'doc.state', state: 'escalated', at: Date.now() }])}
          >
            {copy.accept.escalate}
          </button>
        </div>
      ) : (
        <p className={styles.gateConsequence}>{auditLine(state)}</p>
      )}

      {/* The auditor's view: who, what, when, and what it replaced. */}
      {corrections.length > 0 && (
        <>
          <span className={styles.detailMeta}>{copy.accept.trail}</span>
          <ul className={styles.trail}>
            {corrections.map((correction) => (
              <li key={correction.field}>
                {fieldLabel(correction.field)}: {String(correction.from ?? '—')} → {correction.to} ·{' '}
                {correction.by} · {correction.via}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function ExportPanel({ state, onEvents }: { state: DocState; onEvents: (events: AgentEvent[]) => void }) {
  if (!state.exportFormats.length) return null;
  const { blocking } = verification(state);

  return (
    <section className={styles.block} aria-labelledby="export">
      <h2 className={styles.blockHead} id="export">
        {copy.exportPanel.heading}
      </h2>
      <p className={styles.blockNote}>{copy.exportPanel.note}</p>
      <div className={styles.formats}>
        {state.exportFormats.map((format) => {
          const loses = state.exportLosses[format as ExportFormat];
          return (
            <button
              key={format}
              type="button"
              className={styles.format}
              onClick={() =>
                blocking.length
                  ? onEvents([
                      {
                        t: 'export.blocked',
                        reason: copy.accept.blocked(blocking.length),
                        fields: blocking.map((f) => f.name),
                      },
                    ])
                  : onEvents([{ t: 'export.ready', formats: [format] }])
              }
            >
              <span className={styles.formatName}>{format}</span>
              {loses?.length ? (
                <span className={styles.formatLoses}>
                  {copy.exportPanel.loses} {loses.join(', ')}
                </span>
              ) : (
                <span className={styles.formatKeeps}>{copy.exportPanel.lossless}</span>
              )}
            </button>
          );
        })}
      </div>
      {state.exportBlocked && <p className={styles.gateBlocked}>{state.exportBlocked.reason}</p>}
    </section>
  );
}
