import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMachine } from '@xstate/react'
import { Chat, type Message } from './Chat'
import { DocumentClient, type IntakeReading, type OptionSummary, type Plan } from './doc'
import { planMachine } from './planMachine'
import { Inspector } from './Inspector'
import { Compliance } from './Compliance'
import { Viewports, type ViewModeName } from './Viewports'
import { demoPlan, seedDocument } from './demo'
import { Options } from './Options'
import { Intake } from './Intake'

export function App() {
  const [doc, setDoc] = useState<DocumentClient | null>(null)
  const [revision, setRevision] = useState(0)
  const [focused, setFocused] = useState<ViewModeName | null>(null)
  const [selection, setSelection] = useState<number[]>([])
  const [build, setBuild] = useState<string | null>(null)
  const [options, setOptions] = useState<OptionSummary[]>([])
  const [chosen, setChosen] = useState<string | null>(null)
  const [reading, setReading] = useState<IntakeReading | null>(null)
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
      // Generation extrudes as part of its own commit sequence, so there is nothing to
      // rebuild here.
      const seeded = seedDocument(client)
      const first = seeded.options.find((o) => o.key === seeded.chosen) ?? seeded.options[0]
      setBuild(first ? `${first.label} — ${first.note}` : null)
      setOptions(seeded.options)
      setChosen(seeded.chosen)
      setDoc(client)
      setRevision((r) => r + 1)
    })
  }, [])

  const bump = useCallback(() => setRevision((r) => r + 1), [])

  /**
   * Undo and redo.
   *
   * One pair of controls for every edit in the document, because every edit is a commit:
   * a mouse drag, an agent's approved plan and a whole generation all step back the same
   * way. A stack that only knew about mouse edits would need an opinion about how many
   * commits an agent's plan is worth, and would be wrong about it.
   */
  const step = useCallback(
    (back: boolean) => {
      if (!doc) return
      if (back ? doc.undo() : doc.redo()) setRevision((n) => n + 1)
    },
    [doc],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return
      // Not while the composer has focus: undo belongs to the text field there.
      const el = document.activeElement
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return
      e.preventDefault()
      step(!e.shiftKey)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step])

  const history = useMemo(() => (doc ? doc.historyState() : null), [doc, revision])

  /**
   * Download an export.
   *
   * The bytes come from Rust; the browser only decides where they land. Errors are shown
   * rather than swallowed — an export that silently does nothing is worse than one that
   * says why it could not.
   */
  const download = useCallback(
    (kind: 'dxf' | 'pdf' | 'obj' | 'log') => {
      if (!doc) return
      try {
        const f =
          kind === 'dxf'
            ? doc.exportDxf()
            : kind === 'pdf'
              ? doc.exportPdf()
              : kind === 'obj'
                ? doc.exportObj()
                : doc.exportCorrections()
        const types = {
          dxf: 'image/vnd.dxf',
          pdf: 'application/pdf',
          obj: 'model/obj',
          log: 'application/json',
        }
        const blob = new Blob([new Uint8Array(f.bytes)], { type: types[kind] })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = f.name
        a.click()
        URL.revokeObjectURL(url)
        setMessages((m) => [...m, { role: 'agent', text: `${f.name} — ${f.summary}` }])
        // An export is the signal the output was usable, and it is the one thing the log
        // cannot derive from the history — recording it changes what `corrections()`
        // reports, hence the bump.
        setRevision((n) => n + 1)
      } catch (e) {
        setMessages((m) => [...m, { role: 'agent', text: String(e) }])
      }
    },
    [doc],
  )

  const corrections = useMemo(() => (doc ? doc.corrections() : null), [doc, revision])

  /**
   * Switch the working plan to another option.
   *
   * The state is set from what Rust reports rather than from the key that was clicked, so
   * the strip and the canvas cannot drift apart: if the switch is refused, nothing moves.
   */
  const onChoose = useCallback(
    (key: string) => {
      if (!doc) return
      const r = doc.chooseOption(key)
      const picked = options.find((o) => o.key === r.chosen)
      setChosen(r.chosen)
      if (picked) setBuild(`${picked.label} — ${picked.note}`)
      setRevision((n) => n + 1)
    },
    [doc, options],
  )

  const summary = useMemo(() => (doc ? doc.describe() : null), [doc, revision])
  // Recomputed on every revision, so the panel updates live as the plan changes.
  const compliance = useMemo(() => (doc ? doc.compliance() : null), [doc, revision])

  /**
   * Generate from a confirmed brief.
   *
   * Only reachable from the confirmation card, which is the point: `from_brief` stamps
   * every tier-1 value `Measured`, and this is the moment that becomes true.
   */
  const onConfirmBrief = useCallback(
    (chips: Record<string, boolean>) => {
      if (!doc || !reading) return
      const brief = { ...reading.brief, ...chips } as Parameters<DocumentClient['generate']>[0]
      try {
        const g = doc.generate(brief)
        const first = g.options.find((o) => o.key === g.chosen) ?? g.options[0]
        setOptions(g.options)
        setChosen(g.chosen)
        setBuild(first ? `${first.label} — ${first.note}` : null)
        setReading(null)
        setMessages((m) => [
          ...m,
          { role: 'agent', text: `${g.options.length} option(s). Pick one from the strip.` },
        ])
        setRevision((n) => n + 1)
      } catch (e) {
        setMessages((m) => [...m, { role: 'agent', text: String(e) }])
      }
    },
    [doc, reading],
  )

  const onSend = useCallback(
    (text: string) => {
      if (!doc) return
      setMessages((m) => [...m, { role: 'user', text }])

      // A brief, before anything else. "3BHK on a 30x40 north facing site" is a request to
      // generate, not a question about the drawing, and it is read with no model and no
      // network — see `tri-intake`. A sentence that is not a brief falls through.
      try {
        const got = doc.readBrief(text)
        setReading(got)
        return
      } catch (e) {
        // Underspecified *and* brief-shaped: pass the question on rather than swallowing
        // it. Anything else is not a brief at all and belongs to the agent below.
        const why = String(e)
        if (why.includes('?')) {
          setMessages((m) => [...m, { role: 'agent', text: why.replace(/^Error:\s*/, '') }])
          return
        }
      }

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
        {history && (
          <span className="undo">
            <button
              type="button"
              onClick={() => step(true)}
              disabled={!history.canUndo}
              title={history.last ? `Undo ${history.last}` : 'Nothing to undo'}
            >
              ↶ undo
            </button>
            <button
              type="button"
              onClick={() => step(false)}
              disabled={!history.canRedo}
              title="Redo"
            >
              ↷ redo
            </button>
          </span>
        )}
        <span className="export">
          <button type="button" onClick={() => download('dxf')} title="Layered DXF for AutoCAD">
            DXF
          </button>
          <button type="button" onClick={() => download('pdf')} title="Printable plan sheet">
            PDF
          </button>
          <button
            type="button"
            onClick={() => download('obj')}
            title="Extrusion as a mesh — massing only"
          >
            OBJ
          </button>
        </span>
        <span className="target">document core: {doc.target}</span>
      </header>

      <main>
        <section className="canvas-pane">
          {/* The drawing and its overlay share a positioning context, so the status line
              anchors to the bottom of the canvas rather than to the option strip. */}
          <div className="canvas-main">
            <Viewports
              doc={doc}
              revision={revision}
              focused={focused}
              onFocus={setFocused}
              onSelect={setSelection}
              onEdit={bump}
            />
            {summary && (
              <div className="overlay" data-testid="region-summary">
                {summary.headline}
                {build && <span className="build"> · {build}</span>}
                {/* The correction count, visible rather than silently accumulating. What
                    is being kept about a session should be legible in the session, and
                    clicking it downloads the file rather than sending it anywhere. */}
                {corrections && corrections.corrections.length > 0 && (
                  <button
                    type="button"
                    className="corrections"
                    onClick={() => download('log')}
                    title="Download the correction log. Nothing is sent anywhere."
                  >
                    {corrections.summary}
                  </button>
                )}
              </div>
            )}
          </div>
          <Options doc={doc} options={options} chosen={chosen} onChoose={onChoose} />
        </section>

        <aside className="side">
          {reading && (
            <Intake
              reading={reading}
              onConfirm={onConfirmBrief}
              onCancel={() => setReading(null)}
            />
          )}
          {compliance && <Compliance report={compliance} onSelect={setSelection} />}
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
