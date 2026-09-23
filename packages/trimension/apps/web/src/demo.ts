/**
 * Seed content for the shell, built through the *same* command registry the agent uses.
 *
 * Deliberately not a fixture file: if the demo could construct a document by any route
 * other than commands, that route would be a second write path and I1 would be a lie.
 */
import type { DocumentClient, GenerationResult, Plan } from './doc'

/**
 * Seed the shell by *generating* a plan, not by drawing one.
 *
 * The earlier version issued wall commands directly, which produced geometry with no
 * brief behind it — so the compliance panel had nothing to check and honestly reported
 * nothing, which looked like a broken panel rather than a missing input. Generating is
 * also what the product actually does.
 */
export function seedDocument(doc: DocumentClient): GenerationResult {
  return doc.generate({
    units: 'feet',
    plot_width: 30,
    plot_depth: 40,
    road_facing: 'north',
    road_width_m: 9,
    bedrooms: 2,
    floors: 2,
    car_parking: 1,
  })
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
