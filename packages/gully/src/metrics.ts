/**
 * Pilot instrumentation — PRD §7 Phase 5.
 *
 * One metric matters: **decision-changed rate**. Everything else here is
 * supporting evidence. If the panel never changes which way somebody leaves,
 * it does not matter how fast capture is or how good the classifier gets — the
 * product does nothing.
 *
 * Explicitly not measured: "time saved". PRD §7 rules it out and it is right
 * to. It is not credibly measurable without a counterfactual nobody has, and
 * claiming it reads as naive.
 *
 * All of this stays on the device until the pilot exports it.
 */
import type { BlockageEvent } from './state/types';
import type { LocalReport } from './report/types';
import { dwellP50Min } from './state/priors';

const KEY = 'gully.metrics';

interface Store {
  /** One entry per time the panel was opened and a recommendation was on screen. */
  views: { at: number; recommended: string | null; changed: boolean }[];
  /** Milliseconds from opening the panel to the next deliberate action. */
  decisions: number[];
}

const empty: Store = { views: [], decisions: [] };

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...empty, ...(JSON.parse(raw) as Store) } : { ...empty };
  } catch {
    return { ...empty };
  }
}

const save = (s: Store) => localStorage.setItem(KEY, JSON.stringify(s));

let openedAt: number | null = null;
let lastRecommended: string | null = null;

/**
 * Called whenever the panel shows a recommendation.
 *
 * "Changed" means the recommended exit is not the one that was recommended the
 * last time this person looked. It is a proxy — the honest measurement is
 * asking somebody which way they were going to go before they opened it, and
 * that is the pilot interview in MANUAL.md, not this counter.
 */
export function recordView(recommended: string | null) {
  const s = load();
  const changed = lastRecommended !== null && recommended !== lastRecommended;
  s.views.push({ at: Date.now(), recommended, changed });
  lastRecommended = recommended;
  openedAt = performance.now();
  save(s);
}

/** Time from the panel appearing to the first deliberate action on it. */
export function recordDecision() {
  if (openedAt === null) return;
  const s = load();
  s.decisions.push(Math.round(performance.now() - openedAt));
  openedAt = null;
  save(s);
}

export interface PilotMetrics {
  views: number;
  decision_changed_rate: number | null;
  corroboration_rate: number | null;
  clear_time_error_min: number | null;
  time_to_decision_ms: number | null;
  reports_per_week: number | null;
}

const median = (ns: number[]) => {
  if (!ns.length) return null;
  const s = [...ns].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function pilotMetrics(reports: LocalReport[], events: BlockageEvent[]): PilotMetrics {
  const s = load();

  const obstructions = events.filter((e) => e.obstruction_type);
  const corroborated = obstructions.filter((e) => e.reporters.length >= 2).length;

  // How wrong the "usually clears by" promise was, for events that did clear.
  const errors = events
    .filter((e) => e.state === 'cleared' && e.ended_at !== null)
    .map((e) =>
      Math.abs((e.ended_at! - e.started_at) / 60_000 - dwellP50Min(e.obstruction_type)),
    );

  const span = reports.length
    ? (Math.max(...reports.map((r) => r.created_at)) -
        Math.min(...reports.map((r) => r.created_at))) /
      (7 * 86_400_000)
    : 0;

  return {
    views: s.views.length,
    // Needs a handful of looks before the rate means anything at all.
    decision_changed_rate:
      s.views.length >= 5 ? s.views.filter((v) => v.changed).length / s.views.length : null,
    corroboration_rate: obstructions.length ? corroborated / obstructions.length : null,
    clear_time_error_min: median(errors),
    time_to_decision_ms: median(s.decisions),
    reports_per_week: span > 0.1 ? reports.length / span : null,
  };
}

export function resetMetrics() {
  localStorage.removeItem(KEY);
  lastRecommended = null;
  openedAt = null;
}
