// Next.js boot hook — runs once when the server starts.
// https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
export async function register() {
  // Only in the Node.js runtime (not edge, not the client build).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startSweeper } = await import("./lib/sweeper");
    startSweeper();
  }
}
