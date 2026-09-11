/**
 * The chat panel, with the canvas rendered *inline* rather than beside it.
 *
 * PRD §4.7 names MCP Apps as the mechanism; the property that matters is that a render
 * appears in the conversation at the point the agent produced it, so a reviewer sees what
 * the agent saw when it made a claim. A screenshot in a side panel that has since moved
 * on does not do that.
 */
import { useState } from 'react'
import type { DocumentClient, Plan } from './doc'
import { PlanApproval } from './PlanApproval'

export type Message =
  | { role: 'user'; text: string }
  | { role: 'agent'; text: string }
  | { role: 'tool'; tool: string; summary: string }
  /** A render the agent produced, shown where it happened. */
  | { role: 'render'; png: string; caption: string }
  | { role: 'plan'; plan: Plan }

interface Props {
  doc: DocumentClient
  messages: Message[]
  planState: 'idle' | 'proposed' | 'approved' | 'failed'
  applied: string[]
  error: string | null
  onSend: (text: string) => void
  onApprove: () => void
  onReject: () => void
  onDone: () => void
}

export function Chat({
  messages,
  planState,
  applied,
  error,
  onSend,
  onApprove,
  onReject,
  onDone,
}: Props) {
  const [draft, setDraft] = useState('')

  return (
    <div className="chat">
      <div className="transcript" data-testid="transcript">
        {messages.map((m, i) => {
          switch (m.role) {
            case 'user':
              return (
                <div key={i} className="msg user">
                  {m.text}
                </div>
              )
            case 'agent':
              return (
                <div key={i} className="msg agent">
                  {m.text}
                </div>
              )
            case 'tool':
              return (
                <div key={i} className="msg tool">
                  <code>{m.tool}</code> {m.summary}
                </div>
              )
            case 'render':
              return (
                <figure key={i} className="msg render" data-testid="inline-render">
                  <img src={`data:image/png;base64,${m.png}`} alt={m.caption} />
                  <figcaption>{m.caption}</figcaption>
                </figure>
              )
            case 'plan':
              return (
                <PlanApproval
                  key={i}
                  plan={m.plan}
                  state={planState === 'idle' ? 'proposed' : planState}
                  applied={applied}
                  error={error}
                  onApprove={onApprove}
                  onReject={onReject}
                  onDone={onDone}
                />
              )
          }
        })}
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault()
          if (!draft.trim()) return
          onSend(draft.trim())
          setDraft('')
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask about the model, or describe a change…"
          data-testid="chat-input"
        />
        <button type="submit">Send</button>
      </form>
    </div>
  )
}
