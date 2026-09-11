/**
 * The single seam between TypeScript and the document.
 *
 * Invariant I2: TypeScript holds zero entity data. Everything below either sends a
 * command in or pulls a *view* out — a query result, a summary, a measurement. There is
 * deliberately no `entities` array, no cache, and no store of geometry anywhere in this
 * app. If a component needs to know something about the model, it asks Wasm.
 *
 * The one thing TS does own is view state: camera, selection ids, active tool, and the
 * chat transcript. That is the list from the PRD, and it is exhaustive.
 */
import init, {
  Session,
  Viewport,
  commandSchema,
  toolDefinitions,
  buildTarget,
} from '../wasm/trimension.js'

export type EntityKind = 'wall' | 'opening' | 'polyline' | 'annotation' | 'solid' | 'other'

export interface EntitySummary {
  id: number
  kind: string
  layer: string | null
  label: string | null
  confidence: string | null
  point_count: number
}

export interface QueryResult {
  entities: EntitySummary[]
  total_matched: number
  truncated: boolean
}

export interface RegionDescription {
  entity_count: number
  by_kind: Record<string, number>
  by_layer: Record<string, number>
  by_confidence: Record<string, number>
  total_wall_length_mm: number
  headline: string
}

export interface Measurement {
  entity: number
  kind: string
  length_mm: number | null
  area_m2: number | null
  volume_m3: number | null
  height_mm: number | null
  thickness_mm: number | null
  provenance: Record<string, string>
  contains_assumptions: boolean
}

export interface LayerInfo {
  id: number
  name: string
  visible: boolean
  color: [number, number, number, number]
}

export interface HistoryEntry {
  id: string
  message: string
  author: string
  isAgent: boolean
  plan: string | null
  ops: number
}

/** A plan an agent proposed. Nothing is applied until a human approves it (I7). */
export interface Plan {
  id: string
  agent: string
  summary: string
  steps: { message: string; commands: unknown[] }[]
}

let ready: Promise<void> | null = null

export function initWasm(): Promise<void> {
  ready ??= init().then(() => undefined)
  return ready
}

export class DocumentClient {
  private constructor(private readonly inner: Session) {}

  /**
   * The Wasm handle, needed by `Viewport.render`.
   *
   * Exposed rather than wrapped because a viewport draws from the document directly in
   * Wasm — passing geometry through here would be the I2 violation this design exists to
   * avoid.
   */
  get session(): Session {
    return this.inner
  }

  /** Bind a canvas to the wgpu renderer. */
  attachViewport(canvas: HTMLCanvasElement, mode: string): Promise<Viewport> {
    return Viewport.attach(canvas, mode)
  }

  /** Run the 2D→3D pipeline and commit the solids. */
  buildSolids(): { walls: number; openings: number; summary: string } {
    return this.inner.buildSolids() as { walls: number; openings: number; summary: string }
  }

  heightRangeMm(): [number, number] {
    const r = this.inner.heightRangeMm()
    return [r[0], r[1]]
  }

  static async open(user: string): Promise<DocumentClient> {
    await initWasm()
    return new DocumentClient(new Session(user))
  }

  get target(): string {
    return buildTarget()
  }

  hash(): string {
    return this.session.documentHash()
  }

  entityCount(): number {
    return this.session.entityCount()
  }

  commitCount(): number {
    return this.session.commitCount()
  }

  layers(): LayerInfo[] {
    return this.session.layerList() as LayerInfo[]
  }

  history(): HistoryEntry[] {
    return this.session.history() as HistoryEntry[]
  }

  // ---- reads: the same tools the agent has (I3) ----------------------------

  query(args: {
    bbox?: { min_x: number; min_y: number; max_x: number; max_y: number }
    layer?: string
    kind?: EntityKind
    limit?: number
  }): QueryResult {
    return this.session.queryEntities(JSON.stringify(args)) as QueryResult
  }

  describe(bbox?: {
    min_x: number
    min_y: number
    max_x: number
    max_y: number
  }): RegionDescription {
    return this.session.describeRegion(JSON.stringify({ bbox })) as RegionDescription
  }

  measure(ids: number[]): Measurement[] {
    return this.session.measure(JSON.stringify({ ids })) as Measurement[]
  }

  // ---- writes --------------------------------------------------------------

  /** A human edit, through the shared command registry. */
  applyUser(commands: unknown[], message: string) {
    return this.session.applyUserCommands(JSON.stringify(commands), message) as {
      commit: string
      hash: string
      wire: string
    }
  }

  /** Record a human's approval of an agent plan. Until this runs, agent writes fail. */
  approvePlan(plan: Plan): void {
    this.session.approvePlan(JSON.stringify(plan))
  }

  revokeApproval(): void {
    this.session.revokeApproval()
  }

  approvedPlanId(): string | undefined {
    return this.session.approvedPlanId()
  }

  /** An agent write. Throws unless the cited plan has been approved (I7). */
  applyAgent(planId: string, commands: unknown[], message: string) {
    return this.session.applyAgentCommands(
      JSON.stringify({ plan_id: planId, commands, message }),
    ) as { commit_id: string; ops_applied: number; document_hash: string }
  }

  commitsForPlan(planId: string): HistoryEntry[] {
    return this.session.commitsForPlan(planId) as HistoryEntry[]
  }

  // ---- server sync ---------------------------------------------------------

  loadSnapshot(documentJson: string): void {
    this.session.loadSnapshot(documentJson)
  }

  applyRemoteCommit(commitJson: string): void {
    this.session.applyRemoteCommit(commitJson)
  }
}

/** The command palette is generated from the same schema the agent's tools are (I3). */
export async function paletteSchema(): Promise<unknown> {
  await initWasm()
  return commandSchema()
}

export async function agentTools(): Promise<unknown[]> {
  await initWasm()
  return toolDefinitions() as unknown[]
}
