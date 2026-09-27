/**
 * A local sandbox: a scratch directory under `.runner/sandboxes/` plus child
 * processes.
 *
 * Read this before using it for anything real. **It is not isolation.** The
 * commands run as your user, on your machine, with your network and your home
 * directory one `cd ..` away. The path guard below stops accidents, not an
 * adversary, and nothing here contains a process that decides to misbehave.
 *
 * It exists because Phase 0's acceptance criterion — "create a hello-world
 * Python script and run it" — needs a filesystem and a shell, not a microVM, and
 * requiring an E2B account to run the test suite would put a paid dependency in
 * front of every contributor. The moment untrusted, user-driven code runs
 * through this loop, `SANDBOX_PROVIDER=e2b` is the only correct setting; the
 * registry refuses to hand out this provider when NODE_ENV is production.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir, stat, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type {
  ExecOptions,
  ExecResult,
  Sandbox,
  SandboxProvider,
} from './interfaces.ts';

const DEFAULT_TIMEOUT_MS = 60_000;

/** Files and directories a listing never surfaces to the model. */
const NOISE = new Set(['.git', 'node_modules', '__pycache__', '.venv', '.DS_Store']);

class LocalSandbox implements Sandbox {
  readonly id: string;
  readonly workdir: string;

  constructor(id: string, workdir: string) {
    this.id = id;
    this.workdir = workdir;
  }

  /**
   * Resolve a model-supplied path inside the sandbox, or throw.
   *
   * Every path the model produces comes through here. Absolute paths, `..`
   * climbs and symlink-shaped tricks all land outside `workdir` after
   * `path.resolve`, which is the one thing this check is good at catching.
   */
  private resolve(p: string): string {
    const full = path.resolve(this.workdir, p);
    const root = this.workdir + path.sep;
    if (full !== this.workdir && !full.startsWith(root)) {
      throw new Error(`path escapes the sandbox: ${p}`);
    }
    return full;
  }

  async exec(command: string, options: ExecOptions = {}): Promise<ExecResult> {
    const cwd = options.cwd ? this.resolve(options.cwd) : this.workdir;
    const timeout = options.timeout_ms ?? DEFAULT_TIMEOUT_MS;

    // A deliberately thin environment. Nothing else from process.env is
    // forwarded, so our own API keys cannot leak into a command the model wrote
    // (PRD section 6.2). The cast is only because Next augments ProcessEnv with
    // a required NODE_ENV, which a child of ours has no business inheriting.
    const env = {
      PATH: process.env.PATH ?? '/usr/bin:/bin:/usr/local/bin',
      HOME: this.workdir,
      LANG: 'C.UTF-8',
      ...options.env,
    } as unknown as NodeJS.ProcessEnv;

    return new Promise<ExecResult>((resolve) => {
      const child: ChildProcess = spawn('/bin/bash', ['-lc', command], {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env,
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      // Cap what a runaway command can push into context. The full output still
      // lives in the sandbox if the model redirects it to a file.
      const CAP = 60_000;
      child.stdout?.on('data', (d: Buffer) => {
        if (stdout.length < CAP) stdout += d.toString();
      });
      child.stderr?.on('data', (d: Buffer) => {
        if (stderr.length < CAP) stderr += d.toString();
      });

      const killer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeout);

      child.on('error', (err: Error) => {
        clearTimeout(killer);
        resolve({ stdout, stderr: String(err), exit_code: -1, timed_out: false });
      });

      child.on('close', (code: number | null) => {
        clearTimeout(killer);
        resolve({
          stdout: truncate(stdout, CAP),
          stderr: truncate(stderr, CAP),
          exit_code: code ?? -1,
          timed_out: timedOut,
        });
      });
    });
  }

  async readFile(p: string): Promise<string> {
    return readFile(this.resolve(p), 'utf8');
  }

  async writeFile(p: string, contents: string): Promise<void> {
    const full = this.resolve(p);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, contents, 'utf8');
  }

  async listFiles(p = '.'): Promise<string[]> {
    const root = this.resolve(p);
    if (!existsSync(root)) return [];
    const out: string[] = [];

    const walk = async (dir: string, depth: number): Promise<void> => {
      if (depth > 6 || out.length > 500) return;
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        if (NOISE.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        const rel = path.relative(this.workdir, full);
        if (entry.isDirectory()) {
          await walk(full, depth + 1);
        } else {
          out.push(rel);
        }
      }
    };

    const info = await stat(root);
    if (info.isDirectory()) await walk(root, 0);
    else out.push(path.relative(this.workdir, root));
    return out.sort();
  }

  async exportDir(source: string, destination: string, exclude: string[] = []): Promise<void> {
    const from = this.resolve(source);
    if (!existsSync(from)) throw new Error(`nothing to export at ${source}`);
    await mkdir(path.dirname(destination), { recursive: true });
    const skip = new Set(exclude);
    await cp(from, destination, {
      recursive: true,
      // `filter` runs per entry, so excluding node_modules here skips the walk
      // rather than copying 300MB and deleting it afterwards.
      filter: (src) => !skip.has(path.basename(src)),
      // Follow symlinks: the template seeds node_modules as a link, and a
      // dangling link in an exported site is worse than a missing file.
      dereference: true,
    });
  }

  async importDir(source: string, destination: string): Promise<void> {
    const to = this.resolve(destination);
    await mkdir(path.dirname(to), { recursive: true });
    await cp(source, to, { recursive: true });
  }

  async dispose(): Promise<void> {
    if (process.env.RUNNER_KEEP_SANDBOX === '1') return;
    await rm(this.workdir, { recursive: true, force: true });
  }
}

function truncate(s: string, cap: number): string {
  return s.length > cap ? `${s.slice(0, cap)}\n… [truncated at ${cap} chars]` : s;
}

export class LocalSandboxProvider implements SandboxProvider {
  readonly name = 'local';

  private readonly root: string;

  constructor(root = path.join(process.cwd(), '.runner', 'sandboxes')) {
    this.root = root;
  }

  async create(taskId: string): Promise<Sandbox> {
    await mkdir(this.root, { recursive: true });
    // mkdtemp, not a bare join, so two runs of the same task id cannot collide.
    const dir = await mkdtemp(path.join(this.root, `${safe(taskId)}-`));
    return new LocalSandbox(path.basename(dir), dir);
  }
}

/** Fall back to the OS temp dir when the process has no writable cwd. */
export function localSandboxRoot(): string {
  try {
    return path.join(process.cwd(), '.runner', 'sandboxes');
  } catch {
    return path.join(tmpdir(), 'runner-sandboxes');
  }
}

const safe = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'task';
