import { logKiri } from "./logger";

// Server-side job sweeper. Keeps reconstructions progressing (and completed
// models downloaded) even when no browser tab is open — "closing the tab is
// safe" for real. Registered once per process; the globalThis guard survives
// Next.js dev-mode HMR, which re-evaluates modules.

const SWEEP_MS = 30_000;

const g = globalThis as typeof globalThis & { __blockmodelSweeper?: NodeJS.Timeout };

export function startSweeper(): void {
  if (g.__blockmodelSweeper) return;

  g.__blockmodelSweeper = setInterval(async () => {
    try {
      // Lazy import: keeps db/kiri out of module-eval on environments that
      // load this file but never tick (e.g. build-time analysis).
      const { sweepActiveJobs } = await import("./jobs");
      const active = await sweepActiveJobs();
      if (active > 0) {
        logKiri({ direction: "request", method: "SWEEP", url: `synced ${active} active job(s)` });
      }
    } catch (err) {
      logKiri({ direction: "error", method: "SWEEP", url: "tick", body: String(err) });
    }
  }, SWEEP_MS);
  // Never hold the process open just to sweep.
  g.__blockmodelSweeper.unref?.();

  console.log(`[blockmodel] job sweeper running (every ${SWEEP_MS / 1000}s)`);
}
