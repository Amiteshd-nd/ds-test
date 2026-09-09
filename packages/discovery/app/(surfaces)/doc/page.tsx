'use client';

/**
 * Doc Agents — the review surface. One document, one reviewer, one screen.
 *
 * Left: the ledger of 22 fields, the open field, the non-findings, the accept gate.
 * Right: the source document with the provenance overlay. Selecting a field on the
 * left moves the overlay on the right — same screen, no modal, no navigation, which
 * is the whole reason verification stays cheap enough to actually happen.
 */
import { useEffect, useState } from 'react';
import { DOC_FAULTS, FaultBar } from '@/components/dev/FaultBar';
import { copy } from '@/components/surfaces/doc/copy';
import { FieldDetail } from '@/components/surfaces/doc/FieldDetail';
import { Ledger } from '@/components/surfaces/doc/Ledger';
import {
  AcceptGate,
  ExportPanel,
  NonFindings,
  ScriptFallbacks,
  SystematicBanner,
} from '@/components/surfaces/doc/Panels';
import { SourcePane } from '@/components/surfaces/doc/SourcePane';
import { useAgentStream } from '@/lib/grammar/useAgentStream';
import { initialDocState, reduceAllDoc, verification } from '@/lib/surfaces/doc/reducer';
import styles from '@/components/surfaces/doc/doc.module.css';

export default function DocSurface() {
  const { state, status, start, stop, apply } = useAgentStream({
    script: 'docReviewFull',
    initial: initialDocState,
    reduceAll: reduceAllDoc,
  });
  const [selected, setSelected] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const streaming = status === 'streaming';
  const field = state.fields.find((f) => f.name === selected);
  const { checked, total, blocking } = verification(state);

  useEffect(() => stop, [stop]);

  return (
    <>
      <div className={styles.surface}>
        <div className={styles.left}>
          <header className={styles.head}>
            <h1 className={styles.headTitle}>{state.source?.label ?? copy.surface.role}</h1>
            <span className={styles.headCounts}>
              {total > 0 && <span className={styles.headCount}>{copy.head.fields(total)}</span>}
              {total > 0 && (
                <span className={styles.headCount}>{copy.head.lookedAt(checked, total)}</span>
              )}
              {blocking.length > 0 ? (
                <span className={styles.headNeeds}>{copy.head.needsEyes(blocking.length)}</span>
              ) : (
                total > 0 && <span className={styles.headClear}>{copy.head.clear}</span>
              )}
            </span>
            <span className={styles.headActions}>
              <button
                type="button"
                className={styles.button}
                data-kind="primary"
                onClick={() => start()}
                disabled={streaming}
              >
                {state.runId ? copy.head.rereading : copy.head.start}
              </button>
              <button type="button" className={styles.button} onClick={stop} disabled={!streaming}>
                {copy.head.stop}
              </button>
            </span>
          </header>

          <ScriptFallbacks state={state} />
          <SystematicBanner state={state} onSelect={setSelected} />

          <Ledger state={state} selected={selected} onSelect={setSelected} />

          {field && <FieldDetail field={field} onEvents={apply} />}

          <NonFindings state={state} />
          {total > 0 && <AcceptGate state={state} onEvents={apply} onSelect={setSelected} />}
          <ExportPanel state={state} onEvents={apply} />
        </div>

        <div className={styles.right}>
          <SourcePane state={state} selected={field} page={page} onPage={setPage} />
        </div>
      </div>

      {process.env.NEXT_PUBLIC_HIDE_DEV_CHROME !== '1' && (
        <FaultBar
          options={DOC_FAULTS}
          streaming={streaming}
          onReplay={({ faults, speed, seed }) => {
            setSelected(undefined);
            start({ faults, speed, seed });
          }}
        />
      )}
    </>
  );
}
