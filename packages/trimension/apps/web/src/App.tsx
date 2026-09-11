import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMachine } from '@xstate/react'
import { Chat, type Message } from './Chat'
import { DocumentClient, type Plan } from './doc'
import { planMachine } from './planMachine'
import { Inspector } from './Inspector'
import { Viewports, type ViewModeName } from './Viewports'
import { demoPlan, seedDocument } from './demo'

export function App() {
  const [doc, setDoc] = useState<DocumentClient | null>(null)
  const [revision, setRevision] = useState(0)
  const [focused, setFocused] = useState<ViewModeName | null>(null)
  const [selection, setSelection] = useState<number[]>([])
  const [build, setBuild] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'agent',
      text:
        'Document open. Ask me to measure something, or describe a change and I will ' +
        'propose a plan for you to approve before anything is written.',
    },
  ])
  const [state, send] = useMachine(planMachine)

  useEffect(() => {
    DocumentClient.open('amitesh').then(async (client) => {
      seedDocument(client)
      // Extrude immediately: the elevations and the perspective have nothing to show
      // until the 2D→3D pipeline has run, and it runs as a commit like everything else.
      setBuild(client.buildSolids().summary)
      setDoc(client)
      setRevision((r) => r + 1)
    })
  }, [])

  const bump = useCallback(() => setRevision((r) => r + 1), [])

  const summary = useMemo(() => (doc ? doc.describe() : null), [doc, revision])

  const onSend = useCallback(
    (text: string) => {
      if (!doc) return
      setMessages((m) => [...m, { role: 'user', text }])

      // A local stand-in for the agent host in apps/agent: it demonstrates the loop the
      // real host drives — read tools answer directly, writes must go through a plan.
      const lower = text.toLowerCase()
      if (lower.includes('how') || lower.includes('what') || lower.includes('measure')) {
        const d = doc.describe()
        setMessages((m) => [
          ...m,
          { role: 'tool', tool: 'describe_region', summary: d.headline },
          {
            role: 'agent',
            text:
              `${d.headline}. ` +
              (d.by_confidence.Assumed
                ? `${d.by_confidence.Assumed} value(s) are assumed rather than read from the ` +
                  `drawing — those are the ones to check before signing anything off.`
                : 'Everything here traces back to the source drawing.'),
          },
        ])
        return
      }

      const plan = demoPlan(text)
      doc.approvePlan
      setMessages((m) => [...m, { role: 'plan', plan }])
      send({ type: 'PROPOSE', plan })
    },
    [doc, send],
  )

  const onApprove = useCallback(() => {
    if (!doc || !state.context.plan) return
    const plan: Plan = state.context.plan
    // The human's decision, recorded in Wasm. Until this call, every agent write fails.
    doc.approvePlan(plan)
    send({ type: 'APPROVE' })

    try {
      for (const step of plan.steps) {
        const result = doc.applyAgent(plan.id, step.commands, step.message)
        send({ type: 'APPLIED', commit: result.commit_id })
      }
      // Re-extrude so the 3D views reflect the change the agent just made.
      setBuild(doc.buildSolids().summary)
      bump()
      const commits = doc.commitsForPlan(plan.id)
      setMessages((m) => [
        ...m,
        {
          role: 'agent',
          text: `Applied ${commits.length} commit(s) under plan ${plan.id}. The document is now ${doc
            .hash()
            .slice(0, 12)}. Every one of those commits is attributed to the agent and to this plan.`,
        },
      ])
      send({ type: 'DONE' })
    } catch (e) {
      send({ type: 'FAILED', error: String(e) })
      setMessages((m) => [
        ...m,
        { role: 'agent', text: `The commit was rejected: ${String(e)}. Nothing was written.` },
      ])
    } finally {
      // Approval is per-plan, never standing.
      doc.revokeApproval()
    }
  }, [doc, state.context.plan, send, bump])

  const onReject = useCallback(() => {
    doc?.revokeApproval()
    send({ type: 'REJECT' })
    setMessages((m) => [...m, { role: 'agent', text: 'Understood — nothing was written.' }])
  }, [doc, send])

  if (!doc) {
    return <div className="loading">loading the document core…</div>
  }

  return (
    <div className="app">
      <header className="topbar">
        <strong>trimension</strong>
        <span className="sep">/</span>
        <span data-testid="doc-hash">{doc.hash().slice(0, 12)}</span>
        <span className="sep">·</span>
        <span data-testid="entity-count">{doc.entityCount()} entities</span>
        <span className="sep">·</span>
        <span>{doc.commitCount()} commits</span>
        <span className="spacer" />
        <span className="target">document core: {doc.target}</span>
      </header>

      <main>
        <section className="canvas-pane">
          <Viewports
            doc={doc}
            revision={revision}
            focused={focused}
            onFocus={setFocused}
            onSelect={setSelection}
          />
          {summary && (
            <div className="overlay" data-testid="region-summary">
              {summary.headline}
              {build && <span className="build"> · {build}</span>}
            </div>
          )}
        </section>

        <aside className="side">
          <Inspector doc={doc} selection={selection} revision={revision} />
          <Chat
            doc={doc}
            messages={messages}
            planState={state.value as 'idle' | 'proposed' | 'approved' | 'failed'}
            applied={state.context.appliedCommits}
            error={state.context.error}
            onSend={onSend}
            onApprove={onApprove}
            onReject={onReject}
            onDone={() => send({ type: 'DONE' })}
          />
        </aside>
      </main>
    </div>
  )
}
