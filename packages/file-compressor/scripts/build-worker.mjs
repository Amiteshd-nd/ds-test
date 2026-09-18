// Bundles the compression worker into public/compress-worker.js.
//
// Why a separate build rather than `new Worker(new URL("./x.ts", import.meta.url))`:
// Turbopack emits that URL as a *static asset* — it copied the raw .ts file into
// .next/static/media and handed the browser a TypeScript file to execute. The
// worker never started, and the client silently ran the pipeline on the main
// thread instead. One esbuild pass is the honest fix; it also means the worker
// bundle is inspectable on disk.
//
//   node scripts/build-worker.mjs [--watch]
import path from "node:path";
import { build, context } from "esbuild";

const root = path.join(import.meta.dirname, "..");
const options = {
  entryPoints: [path.join(root, "src/worker/compress.worker.ts")],
  outfile: path.join(root, "public/compress-worker.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["chrome120", "firefox120", "safari17"],
  // Readable output when something goes wrong inside a worker, at the cost of
  // a larger file that is never served from a CDN anyway.
  minify: true,
  sourcemap: true,
  logLevel: "info",
  define: { "process.env.NODE_ENV": '"production"' },
};

if (process.argv.includes("--watch")) {
  const ctx = await context(options);
  await ctx.watch();
  console.log("[file-compressor] watching the compression worker");
} else {
  await build(options);
}
