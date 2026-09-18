// `next dev`, with the two build steps it depends on run first.
//
// The hub starts packages by spawning a binary directly, which skips npm's
// predev hook — so the asset copy and the worker bundle live here instead,
// where both entry points get them.
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = import.meta.dirname;

await run(process.execPath, [path.join(root, "scripts/copy-pdfjs-worker.mjs")]);
await run(process.execPath, [path.join(root, "scripts/build-worker.mjs")]);

// Keep the worker bundle in step with edits to src/worker and src/core.
const watcher = spawn(process.execPath, [path.join(root, "scripts/build-worker.mjs"), "--watch"], {
  cwd: root,
  stdio: "inherit",
});

const next = spawn(nextBin(), ["dev", "-p", "6179"], { cwd: root, stdio: "inherit" });
const stop = () => {
  watcher.kill();
  next.kill();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
next.on("exit", (code) => {
  watcher.kill();
  process.exit(code ?? 0);
});

function nextBin() {
  // Resolve from the package itself so a hoisted or nested install both work.
  const pkg = path.dirname(require.resolve("next/package.json"));
  return path.join(pkg, "dist", "bin", "next");
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: "inherit" });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${args[0]} exited with ${code}`))));
  });
}
