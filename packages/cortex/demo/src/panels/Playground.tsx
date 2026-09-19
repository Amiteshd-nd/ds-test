// The developer playground (§16.4), as a host screen.
//
// Impersonate a principal, see exactly what the agent would be given for a question, and
// diff two prompt versions on the same input. Nothing here runs the agent: it is the
// assembled context, which is the thing that is hard to reason about and easy to get
// wrong.

import { useState } from 'react';
import type { CortexClient } from '../../../src/sdk/client.ts';
import type { ContextInspection, PromptDiff } from '../../../src/core/playground/playground.ts';
import { PRINCIPALS } from '../data.ts';

export function Playground({ client, agentId, initialQuestion }: { client: CortexClient; agentId: string; initialQuestion?: string }) {
  const [as, setAs] = useState('ananya');
  const [q, setQ] = useState(initialQuestion ?? 'What are the 2026 compensation bands?');
  const [ctx, setCtx] = useState<ContextInspection | null>(null);
  const [diff, setDiff] = useState<PromptDiff | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function inspect() {
    setError(null);
    try {
      setCtx(await client.playgroundContext(agentId, q, as));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function showDiff() {
    setError(null);
    try {
      setDiff(await client.promptDiff('atlas-guide', 1, 1));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div>
      <p className="lede">
        The same question, as different people. Retrieval filters on permission before the
        model exists, so the difference you see here is the whole security model —
        not a filter on the way out.
      </p>

      <div className="composer" style={{ position: 'static', marginTop: 0 }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void inspect();
          }}
        >
          <select className="impersonate" value={as} onChange={(e) => setAs(e.target.value)} aria-label="Impersonate">
            {PRINCIPALS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Question to inspect" />
          <button className="btn btn-primary" type="submit">Inspect</button>
        </form>
      </div>

      {error ? <div className="notice notice-alarm" role="alert"><span className="kind">error</span><span>{error}</span></div> : null}

      {ctx ? (
        <div className="grid2" style={{ marginTop: 24 }}>
          <div>
            <section className="panel">
              <h3>What retrieval kept</h3>
              <table className="records">
                <thead><tr><th>id</th><th>record</th></tr></thead>
                <tbody>
                  {ctx.chunks.map((c) => (
                    <tr key={c.sourceId + c.ref}>
                      <td className="mono">{c.sourceId}</td>
                      <td>{c.title}<div className="mono">{c.ref} · {c.via}</div></td>
                    </tr>
                  ))}
                  {ctx.chunks.length === 0 ? <tr><td colSpan={2}>Nothing above the relevance floor.</td></tr> : null}
                </tbody>
              </table>
              <p className="footnote">
                {ctx.filteredCount} candidate{ctx.filteredCount === 1 ? '' : 's'} removed by the permission filter
                before anything reached the model.
              </p>
            </section>

            <section className="panel">
              <h3>Skills this principal can call</h3>
              <p className="footnote" style={{ marginTop: 0 }}>{ctx.skillsVisible.join(', ') || 'none'}</p>
              <h3>Would run for this question</h3>
              <pre className="dump">{JSON.stringify(ctx.skillsThatWouldRun, null, 2)}</pre>
            </section>

            <section className="panel">
              <h3>Memory assembled</h3>
              <pre className="dump">{ctx.memory.items.length ? ctx.memory.items.map((i) => `(${i.kind}) ${i.text}`).join('\n') : 'nothing remembered yet'}</pre>
            </section>
          </div>

          <div>
            <section className="panel">
              <h3>Rendered prompt · {ctx.agent.promptId}@{ctx.agent.promptVersion} · ~{ctx.prompt.tokensEstimated} tokens</h3>
              <pre className="dump">{ctx.prompt.text}</pre>
            </section>
            <section className="panel">
              <h3>Prompt versions</h3>
              <button className="btn" type="button" onClick={() => void showDiff()}>Diff v1 against v1</button>
              {diff ? (
                <div className="diff" style={{ marginTop: 12 }}>
                  {diff.lines.slice(0, 60).map((l, i) => (
                    <div key={i} className={l.kind}>{l.kind === 'added' ? '+ ' : l.kind === 'removed' ? '- ' : '  '}{l.text}</div>
                  ))}
                </div>
              ) : (
                <p className="footnote">Only one version of this prompt exists. Add <code>prompts/atlas-guide/v2/</code> and the diff has something to say.</p>
              )}
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}
