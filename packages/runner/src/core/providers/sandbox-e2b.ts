/**
 * E2B adapter — the production `SandboxProvider` (PRD section 5, sandbox row).
 *
 * **Status: written, not exercised.** Nobody has run this against the real
 * service. The owner has not authorised an E2B account (PRD section 0, rule 7),
 * so `@e2b/code-interpreter` is not in `package.json` and this module reaches it
 * through a dynamic import that fails with instructions rather than at build
 * time. Treat the method names below as the shape we expect, not as verified
 * API: check them against E2B's current SDK docs before the first real run, and
 * delete this paragraph once it has executed the Phase 0 acceptance task.
 *
 * What is already settled and should not drift: one sandbox per task, no
 * ambient environment (our keys never enter the box), a hard timeout on every
 * command, and disposal in a `finally`.
 */

import path from 'node:path';

import type {
  ExecOptions,
  ExecResult,
  Sandbox,
  SandboxProvider,
} from './interfaces.ts';

const DEFAULT_TIMEOUT_MS = 60_000;
/** Minutes a sandbox may stay alive before E2B reclaims it. */
const SANDBOX_TTL_MS = 10 * 60_000;

interface E2BCommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** The slice of the E2B SDK this adapter uses. */
interface E2BSandbox {
  sandboxId: string;
  commands: {
    run(cmd: string, opts?: { cwd?: string; timeoutMs?: number; envs?: Record<string, string> }): Promise<E2BCommandResult>;
  };
  files: {
    read(p: string): Promise<string>;
    write(p: string, data: string): Promise<unknown>;
    list(p: string): Promise<Array<{ name: string; path: string; type: string }>>;
  };
  getHost(port: number): Promise<string> | string;
  kill(): Promise<unknown>;
}

async function loadSdk(): Promise<{ Sandbox: { create(opts: unknown): Promise<E2BSandbox> } }> {
  try {
    // Not a static import: the package is intentionally absent until the owner
    // approves the account, and a static import would break `next build`.
    // @ts-expect-error — not a dependency yet (see the note at the top of this
    // file). `webpackIgnore` keeps the bundler from trying to resolve it, so
    // `next build` succeeds without it and this fails at runtime with the
    // message below instead.
    return (await import(/* webpackIgnore: true */ '@e2b/code-interpreter')) as never;
  } catch {
    throw new Error(
      'SANDBOX_PROVIDER=e2b needs the E2B SDK. Run `pnpm --filter runner add @e2b/code-interpreter` ' +
        'and set E2B_API_KEY. Until then use SANDBOX_PROVIDER=local (development only).',
    );
  }
}

class E2BBackedSandbox implements Sandbox {
  readonly id: string;
  readonly workdir: string;
  private readonly inner: E2BSandbox;

  constructor(id: string, workdir: string, inner: E2BSandbox) {
    this.id = id;
    this.workdir = workdir;
    this.inner = inner;
  }

  private resolve(p: string): string {
    const full = path.posix.resolve(this.workdir, p);
    if (full !== this.workdir && !full.startsWith(this.workdir + '/')) {
      throw new Error(`path escapes the sandbox: ${p}`);
    }
    return full;
  }

  async exec(command: string, options: ExecOptions = {}): Promise<ExecResult> {
    const timeoutMs = options.timeout_ms ?? DEFAULT_TIMEOUT_MS;
    try {
      const r = await this.inner.commands.run(command, {
        cwd: options.cwd ? this.resolve(options.cwd) : this.workdir,
        timeoutMs,
        // Only what the caller passes. Never `process.env`.
        envs: options.env,
      });
      return { stdout: r.stdout, stderr: r.stderr, exit_code: r.exitCode, timed_out: false };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const timedOut = /timeout/i.test(message);
      return { stdout: '', stderr: message, exit_code: timedOut ? 124 : -1, timed_out: timedOut };
    }
  }

  readFile(p: string): Promise<string> {
    return this.inner.files.read(this.resolve(p));
  }

  async writeFile(p: string, contents: string): Promise<void> {
    await this.inner.files.write(this.resolve(p), contents);
  }

  async listFiles(p = '.'): Promise<string[]> {
    const entries = await this.inner.files.list(this.resolve(p));
    return entries
      .filter((e) => e.type === 'file')
      .map((e) => path.posix.relative(this.workdir, e.path))
      .sort();
  }

  async previewUrl(port: number): Promise<string> {
    return `https://${await this.inner.getHost(port)}`;
  }

  /**
   * Not implemented.
   *
   * The right shape is `tar -czf` inside the sandbox followed by a byte-level
   * download and an extract on the host, which needs a binary read this adapter
   * does not have yet. Phase 1 runs on the local sandbox, so this throws rather
   * than pretending: a site that silently failed to come back would look like a
   * successful task with nothing to show for it.
   */
  async exportDir(): Promise<void> {
    throw new Error(
      'E2BSandbox.exportDir is not implemented yet. It needs a tar-and-download path; ' +
        'see the note in sandbox-e2b.ts.',
    );
  }

  async dispose(): Promise<void> {
    await this.inner.kill();
  }
}

export class E2BSandboxProvider implements SandboxProvider {
  readonly name = 'e2b';

  private readonly apiKey: string;
  /**
   * A custom template with Node, Python, Playwright and the site scaffolds
   * already installed (PRD section 6.2) — the difference between a five second
   * cold start and a ninety second one.
   */
  private readonly template: string;

  constructor(apiKey: string, template = process.env.E2B_TEMPLATE ?? 'base') {
    this.apiKey = apiKey;
    this.template = template;
  }

  async create(taskId: string): Promise<Sandbox> {
    const { Sandbox: E2B } = await loadSdk();
    const inner = await E2B.create({
      template: this.template,
      apiKey: this.apiKey,
      timeoutMs: SANDBOX_TTL_MS,
      metadata: { task_id: taskId },
    });
    return new E2BBackedSandbox(inner.sandboxId, '/home/user', inner);
  }
}
