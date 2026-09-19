// Notifications and rules — the two async surfaces, as a person sees them.
//
// A run triggered by a rule or a schedule has nobody watching a socket, so a notification
// is its only delivery. The stream below is subscribed to the *principal*, not the
// session, which is what makes it cross-device: open this in a second window and both
// receive the same notification.

import { useEffect, useState } from 'react';
import type { CortexClient } from '../../../src/sdk/client.ts';

interface Notification { id: string; title: string; body: string; runId: string | null; kind: string; createdAt: string; readAt: string | null }
interface Rule { id: string; name: string; description: string; on: string; agent: string; surface: string; as: string; enabled: boolean; everySeconds?: number }

export function Activity({ client, principalId }: { client: CortexClient; principalId: string }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [n, r] = await Promise.all([client.notifications(), client.rules()]);
      setNotifications(n.notifications);
      setRules(r.rules);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    void load();
    // Poll rather than stream here: this panel is a list, and the bell in the top bar
    // already holds the live subscription. Two SSE connections for one inbox is one too
    // many.
    const timer = setInterval(() => void load(), 4000);
    return () => clearInterval(timer);
  }, [client, principalId]);

  return (
    <div>
      <p className="lede">
        Runs that nobody is watching. A rule turns a host event into a run; the schedule
        turns a clock into one. Either way the answer arrives here, addressed to the person
        the rule runs as — which is not always the person who caused it.
      </p>

      {error ? <div className="notice notice-alarm" role="alert"><span className="kind">error</span><span>{error}</span></div> : null}

      <div className="grid2">
        <section className="panel">
          <h3>Your notifications</h3>
          <table className="records">
            <tbody>
              {notifications.map((n) => (
                <tr key={n.id}>
                  <td className="mono">{n.createdAt.slice(11, 16)}</td>
                  <td>
                    <strong className={n.kind === 'approval_needed' ? 'needs' : undefined}>{n.title}</strong>
                    <div>{n.body}</div>
                    <div className="mono">{n.kind}{n.runId ? ` · ${n.runId}` : ''}</div>
                  </td>
                  <td>
                    {n.readAt ? <span className="mono">read</span> : (
                      <button className="btn-quiet" type="button" onClick={async () => { await client.markNotificationRead(n.id); await load(); }}>mark read</button>
                    )}
                  </td>
                </tr>
              ))}
              {notifications.length === 0 ? (
                <tr><td>Nothing yet. Fire a host event below, or wait for the schedule.</td></tr>
              ) : null}
            </tbody>
          </table>
        </section>

        <section className="panel">
          <h3>Rules</h3>
          <table className="records">
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.name}</strong>
                    <div className="footnote" style={{ marginTop: 2 }}>{r.description}</div>
                    <div className="mono">
                      {r.on}{r.everySeconds ? ` (every ${r.everySeconds}s)` : ''} → {r.agent} · {r.surface} · as {r.as}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="footnote">
            Firing a host event is the host's own job, so it needs the host's own
            credentials — a signed-in member is refused. That is deliberate: a rule runs as
            the principal it names, so an events endpoint open to anyone would let a member
            set someone else's agent to work.
          </p>
        </section>
      </div>
    </div>
  );
}
