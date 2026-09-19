// "What does it remember about me" — PRD §10.2 and §15.
//
// Built in this slice rather than later, because a system that derives facts about a
// person owes them a way to see and delete each one, with the evidence that produced it.

import { useEffect, useState } from 'react';
import type { CortexClient } from '../../../src/sdk/client.ts';

interface Record_ { id: string; type: string; key?: string; value: string; provenance: { evidence: string; at: string } }

export function Memory({ client }: { client: CortexClient }) {
  const [records, setRecords] = useState<Record_[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setRecords((await client.memory()).records);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => { void load(); }, [client]);

  return (
    <div>
      <p className="lede">
        Everything Atlas holds about you, with where it came from. Turns expire after 180
        days; a preference needs two observations before it counts as one.
      </p>
      {error ? <div className="notice notice-alarm" role="alert"><span className="kind">error</span><span>{error}</span></div> : null}
      <table className="records">
        <thead>
          <tr><th>type</th><th>what</th><th>from</th><th /></tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id}>
              <td className="mono">{r.type}</td>
              <td>{r.key ? <strong>{r.key}: </strong> : null}{r.value.slice(0, 220)}{r.value.length > 220 ? '…' : ''}</td>
              <td className="mono">{r.provenance.evidence}<br />{r.provenance.at.slice(0, 16).replace('T', ' ')}</td>
              <td>
                <button
                  className="btn-quiet"
                  type="button"
                  onClick={async () => { await client.forget(r.id); await load(); }}
                >
                  forget
                </button>
              </td>
            </tr>
          ))}
          {records.length === 0 ? <tr><td colSpan={4}>Nothing yet. Ask the agent something and come back.</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}
