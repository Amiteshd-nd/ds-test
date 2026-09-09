'use client';

/**
 * The state gallery for doc. Every case in lib/scripts/doc.ts, collected instantly
 * through the runtime and rendered with the real components.
 *
 * The source pane is included per case on purpose: half of doc's states are about
 * whether a value can be *pointed at*, and a gallery that showed only the ledger
 * would hide exactly the states that matter — a missing region, a rotated scan.
 */
import { useEffect, useState } from 'react';
import { collectRun } from '@/lib/agent-runtime';
import { docCases } from '@/lib/scripts/doc';
import { auditLine, initialDocState, reduceAllDoc, verification, type DocState } from '@/lib/surfaces/doc/reducer';
import { FieldDetail } from '@/components/surfaces/doc/FieldDetail';
import { Ledger } from '@/components/surfaces/doc/Ledger';
import { NonFindings, SystematicBanner, ScriptFallbacks } from '@/components/surfaces/doc/Panels';
import { SourcePane } from '@/components/surfaces/doc/SourcePane';
import styles from '../coding/gallery.module.css';

const noop = () => {};

export default function DocGallery() {
  const [states, setStates] = useState<Record<string, DocState>>({});
  const [selected, setSelected] = useState<Record<string, string>>({});

  /** The field each case is really about, opened by default. */
  const FOCUS: Record<string, string> = {
    clean: 'guarantor_name',
    confusable: 'pincode',
    'struck-through': 'employer_name',
    'out-of-range': 'date_of_birth',
    'no-provenance': 'applicant_name',
    degraded: 'applicant_name',
    systematic: 'existing_emi',
    planted: 'loan_amount',
    'repair-exhausted': 'address',
    'page-only': 'applicant_name',
    everything: 'employer_name',
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const collected: Record<string, DocState> = {};
      for (const testCase of docCases) {
        const events = await collectRun(testCase.script, { seed: 1, faults: testCase.faults });
        collected[testCase.id] = reduceAllDoc(initialDocState, events);
      }
      if (!cancelled) setStates(collected);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className={styles.gallery} data-product="doc">
      <header className={styles.head}>
        <h1 className={styles.title}>doc — every state, one page</h1>
        <p className={styles.lede}>
          {docCases.length} cases from <code>lib/scripts/doc.ts</code>, folded through the real reducer.
          The state names match <code>projects/doc/states.md</code>. The document is synthetic and the
          assumptions behind it are listed in <code>grammar/log/2026-09-09-doc-decisions.md</code>.
        </p>
      </header>

      {docCases.map((testCase) => {
        const state = states[testCase.id];
        const pick = selected[testCase.id] ?? FOCUS[testCase.id];
        const field = state?.fields.find((f) => f.name === pick);
        return (
          <section className={styles.case} key={testCase.id} aria-labelledby={`c-${testCase.id}`}>
            <div className={styles.caseHead}>
              <h2 className={styles.caseTitle} id={`c-${testCase.id}`}>
                {testCase.state}
              </h2>
              <span className={styles.caseId}>{testCase.id}</span>
              <span className={styles.caseFaults}>
                {testCase.faults.length ? testCase.faults.join(' + ') : 'no faults'}
              </span>
            </div>
            <p className={styles.caseShows}>{testCase.shows}</p>

            {!state ? (
              <p className={styles.pending}>collecting…</p>
            ) : (
              <div className={styles.caseBody}>
                <p className={styles.orientLine} data-worry={verification(state).blocking.length ? 'now' : 'no'}>
                  {auditLine(state)} — {verification(state).blocking.length} need eyes
                </p>
                <ScriptFallbacks state={state} />
                <SystematicBanner state={state} onSelect={(f) => setSelected((s) => ({ ...s, [testCase.id]: f }))} />
                <Ledger
                  state={state}
                  selected={pick}
                  onSelect={(f) => setSelected((s) => ({ ...s, [testCase.id]: f }))}
                />
                {/* The repair states only exist inside an open field, so a gallery
                    without this one would be missing four of them. */}
                {field && <FieldDetail field={field} onEvents={noop} />}
                <NonFindings state={state} />
                <SourcePane state={state} selected={field} page={field?.provenance?.region?.page ?? 1} onPage={noop} />
              </div>
            )}
          </section>
        );
      })}
    </main>
  );
}
