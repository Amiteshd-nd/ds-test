/**
 * The agent host: an AI SDK 7 loop over the generated tool surface.
 *
 * # The shape of the loop, and why it is this shape
 *
 * Read tools run freely. The model can query, describe, measure and *render* as much as
 * it likes, because none of those change anything. `render_view` matters more than it
 * looks: PRD §4.7 notes that a model driven through a loop that can see its own geometry
 * substantially outperforms the same model writing scripts blind, and this is where that
 * loop closes.
 *
 * Writes stop. `apply_commands` is declared `needsApproval`, so the SDK suspends the run
 * and surfaces the intended call before it executes (invariant I7). The Rust side refuses
 * unapproved writes independently — the approval here is the human's *interface*, not the
 * enforcement.
 *
 * Nothing in this file serialises the document (invariant I5). The system prompt does not
 * contain the model, the context does not accumulate the model, and there is no
 * "summarise the whole drawing" step. If the agent needs to know something, it asks.
 */
import { anthropic } from '@ai-sdk/anthropic'
import { generateText, stepCountIs } from 'ai'
import { SessionClient } from './client.ts'
import { assertNoDrift, buildTools, type ToolBackend, type ToolName } from './tools.ts'

const SYSTEM = `
You are a drafting assistant working directly on a 3D building model. You are a peer of
the person using the app: you edit the same document they do, through the same commands
their toolbar dispatches.

How to work:

- You cannot see the model. Nobody hands you the drawing. Use describe_region to get your
  bearings, query_entities to find things in a specific area, measure for numbers, and
  render_view when you need to actually look at something. Never ask for the whole model;
  ask a better question.
- Provenance is the product. Every number you read carries whether it was Measured from
  the drawing, Inferred by a rule, or Assumed from a default. When you report a figure that
  rests on an assumption, say so and say which assumption. A confident wrong number is
  worse here than an honest uncertain one.
- Before you change anything, describe what you intend to do and why. Writes go through an
  approval step; the reviewer is deciding based on your description, so make it specific.
  "Add a 1200mm window centred 6m along the south wall, sill at 900mm" — not "improve the
  elevation".
- If you are about to default a dimension, stop and ask instead. A defaulted value that a
  human never saw is exactly the failure this system is built to prevent.
`.trim()

export interface HostOptions {
  serverUrl: string
  documentId: string
  model?: string
  /** Called when a write needs sign-off. Return true to let it proceed (I7). */
  approve: (call: { toolName: string; input: unknown }) => Promise<boolean>
}

/** Routes a tool call to the session server. */
class ServerBackend implements ToolBackend {
  constructor(private readonly client: SessionClient) {}

  async call(name: ToolName, args: unknown): Promise<unknown> {
    this.client.send({ type: 'tool', data: { name, args } })
    const reply = await this.client.next()
    if (reply.type === 'error') {
      throw new Error(`server refused ${name}: ${JSON.stringify(reply.data)}`)
    }
    return reply.data
  }
}

export async function run(prompt: string, options: HostOptions): Promise<string> {
  // Fail on boot rather than mid-conversation if the schemas are stale.
  await assertNoDrift()

  const client = new SessionClient(options.serverUrl, options.documentId)
  await client.connect()

  try {
    const tools = await buildTools(new ServerBackend(client))

    const result = await generateText({
      model: anthropic(options.model ?? 'claude-opus-5'),
      system: SYSTEM,
      prompt,
      tools,
      // Enough steps to orient, look, decide and act. Not unbounded: a loop that never
      // terminates is a loop that burns the token budget PRD §8 asks us to watch.
      stopWhen: stepCountIs(24),
      onStepFinish: async ({ toolCalls }) => {
        for (const call of toolCalls) {
          if (call.toolName === 'apply_commands') {
            const ok = await options.approve({
              toolName: call.toolName,
              input: call.input,
            })
            if (!ok) {
              throw new Error('the reviewer declined this change; nothing was written')
            }
          }
        }
      },
    })

    return result.text
  } finally {
    client.close()
  }
}

// Run directly: `node --experimental-strip-types src/main.ts "<prompt>"`
if (process.argv[1]?.endsWith('main.ts')) {
  const prompt = process.argv.slice(2).join(' ')
  if (!prompt) {
    console.error('usage: main.ts "<what you want done>"')
    process.exit(2)
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set')
    process.exit(2)
  }

  const text = await run(prompt, {
    serverUrl: process.env.TRIMENSION_SERVER ?? 'http://127.0.0.1:8788',
    documentId: process.env.TRIMENSION_DOC ?? 'demo',
    approve: async ({ input }) => {
      // A terminal host approves on the console; the browser host uses the plan card in
      // the chat panel. Both are the same gate.
      console.error('\n--- this change needs your approval ---')
      console.error(JSON.stringify(input, null, 2))
      console.error('--- set TRIMENSION_AUTO_APPROVE=1 to skip this prompt in a sandbox ---')
      return process.env.TRIMENSION_AUTO_APPROVE === '1'
    },
  })
  console.log(text)
}
