/**
 * The tool bridge.
 *
 * # The schemas are not written here
 * Every tool's input schema comes from `cargo xtask gen-schemas`, which generates it from
 * the Rust command registry with `schemars`. Hand-writing one would be an I3 violation —
 * the agent's idea of what a command looks like would be free to drift from the UI's, and
 * the drift would be silent until a commit was rejected in production.
 *
 * So this file loads the generated JSON and wraps it. If you find yourself editing a
 * schema shape here, the fix is in `crates/api/src/command.rs`.
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { jsonSchema, tool, type Tool } from 'ai'

const here = dirname(fileURLToPath(import.meta.url))
const SCHEMA_DIR = join(here, '..', '..', '..', 'crates', 'api', 'schemas')

interface GeneratedTool {
  name: string
  description: string
  input_schema: Record<string, unknown>
  requires_approval: boolean
}

async function loadGenerated(name: string): Promise<GeneratedTool> {
  const raw = await readFile(join(SCHEMA_DIR, `${name}.json`), 'utf8')
  return JSON.parse(raw) as GeneratedTool
}

export const TOOL_NAMES = [
  'query_entities',
  'describe_region',
  'measure',
  'render_view',
  'apply_commands',
] as const

export type ToolName = (typeof TOOL_NAMES)[number]

/** What a tool call ultimately does, supplied by the host. */
export interface ToolBackend {
  call(name: ToolName, args: unknown): Promise<unknown>
}

/**
 * Build the AI SDK tool set.
 *
 * Write tools are marked `needsApproval`, which is AI SDK 7's own approval mechanism and
 * maps directly onto invariant I7 (PRD §4.7). The flag is not decided here either — it
 * comes from `requires_approval` in the generated definition, which comes from the
 * registry's `ToolKind`. One source of truth, three consumers.
 */
export async function buildTools(backend: ToolBackend): Promise<Record<string, Tool>> {
  const tools: Record<string, Tool> = {}

  for (const name of TOOL_NAMES) {
    const def = await loadGenerated(name)
    tools[name] = tool({
      description: def.description,
      inputSchema: jsonSchema(def.input_schema),
      needsApproval: def.requires_approval,
      execute: async (args: unknown) => backend.call(name, args),
    })
  }

  return tools
}

/**
 * A guard against the failure this whole arrangement exists to prevent: a tool reaching
 * the model that the Rust side does not know about, or vice versa. Run it at startup —
 * failing loudly on boot is better than failing subtly on a customer's drawing.
 */
export async function assertNoDrift(): Promise<void> {
  const missing: string[] = []
  for (const name of TOOL_NAMES) {
    try {
      const def = await loadGenerated(name)
      if (def.name !== name) missing.push(`${name}: file declares "${def.name}"`)
    } catch {
      missing.push(`${name}: no generated schema — run \`cargo xtask gen-schemas\``)
    }
  }
  if (missing.length) {
    throw new Error(`tool schema drift:\n  ${missing.join('\n  ')}`)
  }
}
