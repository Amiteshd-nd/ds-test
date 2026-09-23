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

export type Standing = 'ok' | 'tight' | 'over' | 'unmeasured'

export interface Metric {
  id: string
  label: string
  value: number
  limit: number | null
  unit: string
  standing: Standing
  provenance: 'Measured' | 'Inferred' | 'Assumed'
  reason: string
}

export interface ComplianceDiagnostic {
  rule_id: string
  severity: 'hard' | 'soft' | 'advisory'
  message: string
  entities: number[]
  source: string
  measured: number | null
  limit: number | null
}

export interface ComplianceReport {
  metrics: Metric[]
  diagnostics: ComplianceDiagnostic[]
  authority: string
  effective: string
  disclaimer: string
  reviewed: boolean
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

/** One generated option. Ranked in Rust; the shell only displays the order it is given. */
export interface OptionSummary {
  /** `3bhk.side-corridor.v1` or `3bhk.side-corridor.v1+larger-bedrooms`. */
  key: string
  label: string
  /** Why it ranked where it did, in a sentence. */
  note: string
  template?: string
  awkward?: number
  /** Present only when the brief asked for Vaastu. `null`/absent means the layer is off. */
  vaastu?: {
    score: number
    conflicts: string[]
    authority: string
    placements: { name: string; kind: string; sector: string; verdict: string }[]
  } | null
  /** What choosing this option cost against the best non-Vaastu one, in plain words. */
  cost?: string
  summary?: string
  rooms?: { name: string; kind: string; area_mm2: number }[]
  hash?: string
}

export interface GenerationResult {
  chosen: string
  options: OptionSummary[]
}

/** What a one-line brief was read as, before anybody has confirmed it. */
export interface IntakeReading {
  brief: Record<string, unknown>
  /** Fields the brief itself supplied. */
  stated: string[]
  /** Tier-1 fields nobody stated. Filled so the card has something to show, and marked. */
  guessed: string[]
  chips: { field: string; question: string }[]
  /** `local`, or `anthropic/claude-sonnet-5`. */
  source: string
}

/** A file Rust produced, for the browser to hand to the user. */
export interface ExportedFile {
  bytes: number[]
  summary: string
  name: string
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

  /**
   * Generate a plan from the six intake answers.
   *
   * The whole flow lands in Rust: brief → parameters → ruleset → template → commits.
   * Nothing about the layout is decided here.
   */
  generate(brief: {
    units?: string
    plot_width: number
    plot_depth: number
    road_facing: string
    road_width_m?: number
    bedrooms: number
    floors: number
    car_parking: number
    vaastu?: boolean | null
  }): GenerationResult {
    return this.inner.generate(JSON.stringify(brief)) as GenerationResult
  }

  /**
   * Read a one-line brief with no model and no network.
   *
   * Throws with a question if the brief is genuinely underspecified — "I want a nice
   * house" has no plot in it, and answering it would mean inventing the site.
   */
  readBrief(text: string): IntakeReading {
    return this.inner.readBrief(text) as IntakeReading
  }

  /**
   * The layered DXF, and a printable plan sheet.
   *
   * Both come back as bytes rather than being written anywhere: the browser is the only
   * thing that knows where the user wants the file, and Rust has no business guessing.
   */
  exportDxf(): ExportedFile {
    return this.inner.exportDxf() as ExportedFile
  }

  exportPdf(): ExportedFile {
    return this.inner.exportPdf() as ExportedFile
  }

  /** The extrusion as a mesh. Massing only — see the header the file carries. */
  exportObj(): ExportedFile {
    return this.inner.exportObj() as ExportedFile
  }

  /** The correction log, as a file. Nothing sends it anywhere. */
  exportCorrections(): ExportedFile {
    return this.inner.exportCorrections() as ExportedFile
  }

  /**
   * What the solver drew and where the architect moved it.
   *
   * Derived from the commit history on every call rather than accumulated, so it cannot
   * disagree with the document.
   */
  corrections(): {
    summary: string
    exported: boolean
    wallEditsBeforeExport: number
    corrections: { step: number; author: string; kind: string; message: string }[]
    chosenOption: string | null
    optionsOffered: string[]
  } {
    return this.inner.corrections() as ReturnType<DocumentClient['corrections']>
  }

  /** Is this entity a wall? The canvas asks before starting a drag. */
  isWall(entity: number): boolean {
    return this.inner.isWall(BigInt(entity)) as boolean
  }

  /**
   * Move a wall, as a mouse drag does.
   *
   * Dispatches `Command::MoveWall` — the same variant an agent calls. There is
   * deliberately no drag-specific write path: one would mean the undo stack knew about
   * mouse edits and not about agent edits.
   */
  moveWall(entity: number, dxMm: number, dyMm: number): { commit: string; hash: string } {
    return this.inner.moveWall(BigInt(entity), dxMm, dyMm) as {
      commit: string
      hash: string
    }
  }

  /** Step back one commit. Human and agent edits are the same commits, so both undo. */
  undo(): boolean {
    return this.inner.undo() as boolean
  }

  redo(): boolean {
    return this.inner.redo() as boolean
  }

  historyState(): {
    applied: number
    total: number
    canUndo: boolean
    canRedo: boolean
    last: string | null
  } {
    return this.inner.historyState() as {
      applied: number
      total: number
      canUndo: boolean
      canRedo: boolean
      last: string | null
    }
  }

  /** The options from the last generation, in rank order, and which is in front. */
  options(): { current: string | null; options: OptionSummary[] } {
    return this.inner.options() as { current: string | null; options: OptionSummary[] }
  }

  /**
   * Bring an option to the front.
   *
   * Lossless both ways: Rust writes the working branch back before taking the new one,
   * so leaving an option and returning to it keeps whatever was done to it.
   */
  chooseOption(key: string): { chosen: string; hash: string; entities: number } {
    return this.inner.chooseOption(key) as {
      chosen: string
      hash: string
      entities: number
    }
  }

  /** The compliance report. A view over data Rust already computed. */
  compliance(): ComplianceReport {
    return this.inner.compliance() as ComplianceReport
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
