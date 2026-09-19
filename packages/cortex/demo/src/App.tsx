// Atlas — the demo host's own application shell.
//
// CORTEX is installed inside it: one client, one agent, three screens. Switching who you
// are at the top is not a demo trick — it is the fastest way to see that the permission
// filter runs at retrieval, where it cannot be argued with, rather than at render.

import { useMemo, useState } from 'react';
import { CortexClient } from '../../src/sdk/client.ts';
import { Chat } from './panels/Chat.tsx';
import { Playground } from './panels/Playground.tsx';
import { Memory } from './panels/Memory.tsx';
import { Traces } from './panels/Traces.tsx';
import { Documents } from './panels/Documents.tsx';
import { Activity } from './panels/Activity.tsx';
import { Bell } from './design/adapter.tsx';
import { AGENTS, PRINCIPALS } from './data.ts';
import './design/tokens.css';
import './design/atlas.css';

type Tab = 'ask' | 'documents' | 'activity' | 'playground' | 'traces' | 'memory';

const TAB_LABELS: Record<Tab, string> = {
  ask: 'Ask',
  documents: 'Documents',
  activity: 'Activity',
  playground: 'Playground',
  traces: 'Traces',
  memory: 'What it remembers',
};

export function App() {
  const [principal, setPrincipal] = useState(PRINCIPALS[0]);
  const [tab, setTab] = useState<Tab>('ask');
  const [agent, setAgent] = useState(AGENTS[0]);
  // "Replay this run in the playground" (addendum C1 item 6) — the trace hands the
  // question back and the playground opens with it loaded.
  const [replay, setReplay] = useState<string | null>(null);

  // A new client per principal, because the token is the identity and nothing else is.
  const client = useMemo(() => new CortexClient({ baseUrl: '', token: principal.token }), [principal]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="wordmark">Atlas <span>· internal knowledge</span></div>
        <nav className="tabs">
          {(['ask', 'documents', 'activity', 'playground', 'traces', 'memory'] as Tab[]).map((t) => (
            <button key={t} type="button" className="tab" aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>
              {TAB_LABELS[t]}
            </button>
          ))}
        </nav>
        <div className="spacer" />
        <Bell client={client} principalId={principal.id} onOpen={() => setTab('activity')} />
        <label className="who">
          Signed in as
          <select
            value={principal.id}
            onChange={(e) => setPrincipal(PRINCIPALS.find((p) => p.id === e.target.value) ?? PRINCIPALS[0])}
          >
            {PRINCIPALS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
      </header>

      <main>
        {tab === 'ask' ? (
          <>
            <p className="lede">
              {principal.note} Ask the same question as someone else and watch the answer
              change — the filter runs at retrieval, so there is nothing to slip past on
              the way out. {agent.note}
            </p>
            <div className="agentbar">
              {AGENTS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="tab"
                  aria-current={agent.id === a.id ? 'page' : undefined}
                  onClick={() => setAgent(a)}
                >
                  {a.name}
                </button>
              ))}
            </div>
            <Chat
              key={principal.id + agent.id}
              client={client}
              agentId={agent.id}
              agentName={agent.name}
              canComment={agent.canComment}
            />
          </>
        ) : null}
        {tab === 'playground' ? <Playground key={principal.id + (replay ?? '')} client={client} agentId="atlas-guide" initialQuestion={replay ?? undefined} /> : null}
        {tab === 'traces' ? (
          <Traces
            key={principal.id}
            client={client}
            onReplay={(question) => { setReplay(question); setTab('playground'); }}
          />
        ) : null}
        {tab === 'documents' ? <Documents key={principal.id} client={client} agentId="atlas-guide" /> : null}
        {tab === 'activity' ? <Activity key={principal.id} client={client} principalId={principal.id} /> : null}
        {tab === 'memory' ? <Memory key={principal.id} client={client} /> : null}

        <p className="footnote">
          Everything you see is rendered by Atlas's own components in{' '}
          <code>demo/src/design/</code>. The agent layer ships no styles — <code>pnpm lint</code>{' '}
          fails the build if a class name appears in <code>src/ui-headless/</code>.
        </p>
      </main>
    </div>
  );
}
