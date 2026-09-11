/**
 * Seed content for the shell, built through the *same* command registry the agent uses.
 *
 * Deliberately not a fixture file: if the demo could construct a document by any route
 * other than commands, that route would be a second write path and I1 would be a lie.
 */
import type { DocumentClient, Plan } from './doc'

export function seedDocument(doc: DocumentClient): void {
  doc.applyUser(
    [
      { command: 'create_layer', name: 'A-WALL' },
      { command: 'create_layer', name: 'A-DOOR' },
    ],
    'set up layers',
  )

  doc.applyUser(
    [
      {
        command: 'create_wall',
        centreline_mm: [
          { x: 0, y: 0 },
          { x: 8000, y: 0 },
        ],
        thickness_mm: 230,
        height_mm: 2700,
        layer: 1,
      },
      {
        command: 'create_wall',
        centreline_mm: [
          { x: 8000, y: 0 },
          { x: 8000, y: 5000 },
        ],
        thickness_mm: 230,
        height_mm: 2700,
        layer: 1,
      },
      {
        command: 'create_wall',
        centreline_mm: [
          { x: 8000, y: 5000 },
          { x: 0, y: 5000 },
        ],
        thickness_mm: 230,
        height_mm: 2700,
        layer: 1,
      },
      {
        command: 'create_wall',
        centreline_mm: [
          { x: 0, y: 5000 },
          { x: 0, y: 0 },
        ],
        thickness_mm: 230,
        height_mm: 2700,
        layer: 1,
      },
      {
        // No height given, so this one records an Assumed 2700mm — the shell needs at
        // least one honestly-uncertain value or the provenance UI has nothing to show.
        command: 'create_wall',
        centreline_mm: [
          { x: 4500, y: 0 },
          { x: 4500, y: 5000 },
        ],
        thickness_mm: 110,
        layer: 1,
      },
    ],
    'trace the envelope and the partition',
  )

  doc.applyUser(
    [
      {
        command: 'create_opening',
        host: 5,
        kind: 'door',
        position_mm: 1200,
        width_mm: 900,
        height_mm: 2100,
      },
      {
        // In the west wall, so it is face-on in the left elevation. An elevation of a
        // building with no openings in the wall it faces is correct and tells you
        // nothing, which makes it a poor demonstration of an elevation.
        command: 'create_opening',
        host: 4,
        kind: 'window',
        position_mm: 2500,
        width_mm: 1500,
        height_mm: 1200,
        sill_mm: 900,
      },
    ],
    'door into the back room, window to the west',
  )
}

/**
 * A stand-in for what the agent host in `apps/agent` produces. Real plans come from the
 * model; this exists so the approval gate can be exercised without an API key.
 */
export function demoPlan(request: string): Plan {
  return {
    id: `plan-${Date.now().toString(36)}`,
    agent: 'claude',
    summary: request,
    steps: [
      {
        message: 'add a window to the south wall',
        commands: [
          {
            command: 'create_opening',
            host: 1,
            kind: 'window',
            position_mm: 6000,
            width_mm: 1200,
            height_mm: 1500,
            sill_mm: 900,
          },
        ],
      },
      {
        message: 'label the south wall',
        commands: [{ command: 'set_label', entity: 1, label: 'W-01 south' }],
      },
    ],
  }
}
