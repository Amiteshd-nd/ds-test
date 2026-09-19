// The inline surface, as Atlas would build it: a document, a selection, and an edit you
// approve by looking at it.
//
// There is no write skill and no approval gate in this path. The agent proposes a diff;
// accepting it is Atlas writing to Atlas's own document, which is the point — the diff
// preview *is* the gate.

import { useEffect, useState } from 'react';
import { useInlineAgent } from '../../../src/ui-headless/index.ts';
import type { CortexClient } from '../../../src/sdk/client.ts';

interface Doc { ref: string; title: string; body: string }

export function Documents({ client, agentId }: { client: CortexClient; agentId: string }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [current, setCurrent] = useState<Doc | null>(null);
  const [selection, setSelection] = useState('');
  const [instruction, setInstruction] = useState('Tighten this without changing any facts.');
  const [applied, setApplied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inline = useInlineAgent({
    client,
    agentId,
    selection: current && selection ? { ref: current.ref, title: current.title, body: current.body, selection } : null,
  });

  async function load() {
    try {
      const res = await client.hostDocuments();
      setDocs(res.documents);
      setCurrent((c) => (c ? res.documents.find((d) => d.ref === c.ref) ?? res.documents[0] : res.documents[0]) ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => { void load(); }, [client]);

  function captureSelection() {
    const text = String(window.getSelection() ?? '').trim();
    if (text.length > 15) setSelection(text);
  }

  async function accept() {
    setError(null);
    await inline.accept(async (before, after) => {
      if (!current) return;
      await client.hostApplyEdit(current.ref, before, after);
      setApplied(after);
      setSelection('');
      await load();
    });
  }

  return (
    <div>
      <p className="lede">
        Select a sentence and ask for a change. The agent proposes an edit; accepting it is
        Atlas writing to its own document. Nothing here goes through an approval gate,
        because the diff you are reading is the approval.
      </p>

      {error ? <div className="notice notice-alarm" role="alert"><span className="kind">error</span><span>{error}</span></div> : null}

      <div className="tracebar" style={{ marginBottom: 16 }}>
        <select
          aria-label="Document"
          value={current?.ref ?? ''}
          onChange={(e) => { setCurrent(docs.find((d) => d.ref === e.target.value) ?? null); setSelection(''); inline.reject(); }}
        >
          {docs.map((d) => <option key={d.ref} value={d.ref}>{d.title}</option>)}
        </select>
      </div>

      <div className="grid2">
        <section className="panel">
          <h3>{current?.title ?? 'no document'}</h3>
          <div className="docbody" onMouseUp={captureSelection} onKeyUp={captureSelection}>
            {(current?.body ?? '').split(/\n{2,}/).map((para, i) => (
              <p key={i} className={applied && para.includes(applied) ? 'just-edited' : undefined}>{para}</p>
            ))}
          </div>
        </section>

        <section className="panel">
          <h3>Edit the selection</h3>
          {!selection ? (
            <p className="footnote" style={{ marginTop: 0 }}>
              Select at least a sentence in the document. The selection is what gets sent —
              not the whole file.
            </p>
          ) : (
            <>
              <blockquote className="selection">{selection}</blockquote>
              <label className="field">
                <span className="field-label">what to change</span>
                <input value={instruction} onChange={(e) => setInstruction(e.target.value)} />
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" type="button" disabled={inline.status === 'drafting'} onClick={() => void inline.propose(instruction)}>
                  {inline.status === 'drafting' ? 'Drafting…' : 'Propose an edit'}
                </button>
                <button className="btn" type="button" onClick={() => { setSelection(''); inline.reject(); }}>Clear</button>
              </div>
            </>
          )}

          {inline.status === 'drafting' && inline.draft ? (
            <>
              <h3 style={{ marginTop: 20 }}>Drafting</h3>
              <p className="drafting">{inline.draft}<span className="cursor" aria-hidden="true" /></p>
            </>
          ) : null}

          {inline.status === 'unchanged' ? (
            <div className="notice" role="status" style={{ marginTop: 16 }}>
              <span className="kind">no change</span>
              <span>It left the passage alone. That is a valid edit.</span>
            </div>
          ) : null}

          {inline.error ? (
            <div className="notice notice-alarm" role="alert" style={{ marginTop: 16 }}>
              <span className="kind">{inline.error.kind.replace(/_/g, ' ')}</span><span>{inline.error.message}</span>
            </div>
          ) : null}

          {inline.status === 'ready' && inline.proposal ? (
            <>
              <h3 style={{ marginTop: 20 }}>Proposed</h3>
              <div className="diff">
                <div className="removed">{inline.proposal.before}</div>
                <div className="added">{inline.proposal.after}</div>
              </div>
              {inline.fallbackUsed ? (
                <p className="footnote">
                  No model is configured, so this is the offline stand-in: mechanical
                  tightening only — filler words and a few stock phrases. It cannot
                  rephrase anything. With a key, the same path returns a real rewrite.
                </p>
              ) : null}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button className="btn btn-primary" type="button" onClick={() => void accept()}>Accept the edit</button>
                <button className="btn" type="button" onClick={() => inline.reject()}>Reject</button>
              </div>
            </>
          ) : null}
        </section>
      </div>
    </div>
  );
}
