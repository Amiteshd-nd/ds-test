/**
 * The worker *bundle* boots and answers.
 *
 * This test exists because of a specific failure: Turbopack resolved
 * `new Worker(new URL("./compress.worker.ts", import.meta.url))` to a static
 * asset and served the browser a raw TypeScript file. The worker never started,
 * every request quietly fell through to the main-thread fallback, and nothing in
 * the type checker, the build, or the unit tests noticed. The only way to catch
 * that class of bug is to load the artifact that actually ships.
 */

import { beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { installBrowserShims } from "./support/browser-shims";
import { buildFixture } from "../../scripts/fixture.mjs";
import type { WorkerRequest, WorkerResponse } from "@/worker/protocol";

const root = path.join(import.meta.dirname, "..", "..");
const bundle = path.join(root, "public", "compress-worker.js");

/** Stands in for `DedicatedWorkerGlobalScope`: the bundle assigns `self.onmessage`. */
interface FakeScope {
  onmessage: ((event: { data: WorkerRequest }) => void) | null;
  postMessage: (response: WorkerResponse) => void;
  addEventListener: () => void;
  removeEventListener: () => void;
}

let scope: FakeScope;
const outbox: WorkerResponse[] = [];

beforeAll(async () => {
  installBrowserShims();
  // Build it here rather than depending on a previous script run, so a checkout
  // that has never run `pnpm dev` still exercises the real artifact.
  execFileSync(process.execPath, [path.join(root, "scripts", "build-worker.mjs")], { cwd: root, stdio: "pipe" });
  expect(fs.existsSync(bundle)).toBe(true);

  scope = {
    onmessage: null,
    postMessage: (response) => outbox.push(response),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  (globalThis as Record<string, unknown>).self = scope;

  await import(pathToFileURL(bundle).href);
}, 120_000);

async function send(request: WorkerRequest, until: (response: WorkerResponse) => boolean): Promise<WorkerResponse> {
  outbox.length = 0;
  scope.onmessage?.({ data: request });
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const match = outbox.find(until);
    if (match) return match;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`The bundle never answered ${request.kind}. Saw: ${outbox.map((r) => r.kind).join(", ") || "nothing"}`);
}

describe("the shipped worker bundle", () => {
  it("installs a message handler when it loads", () => {
    expect(typeof scope.onmessage).toBe("function");
  });

  it("answers the handshake the client waits for", async () => {
    const response = await send({ id: "h", kind: "ping" }, (r) => r.kind === "pong");
    expect(response.kind).toBe("pong");
  });

  it("runs a real analysis through the bundled pipeline", async () => {
    const fixture = await buildFixture({ pages: 1 });
    const bytes = fixture.slice().buffer as ArrayBuffer;
    const response = await send({ id: "a", kind: "analyse", bytes }, (r) => r.kind === "analysed" || r.kind === "error");
    expect(response.kind).toBe("analysed");
    if (response.kind !== "analysed") return;
    expect(response.inventory.pageCount).toBe(1);
    expect(response.inventory.images).toHaveLength(1);
  }, 120_000);
});
