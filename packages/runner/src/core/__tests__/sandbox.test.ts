import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { LocalSandboxProvider } from '../providers/sandbox-local.ts';
import type { Sandbox } from '../providers/interfaces.ts';

/**
 * The local sandbox is not isolation and these tests do not pretend it is. What
 * they check is that the guard against a path leaving the working directory
 * holds, and that a command cannot read the environment we run in — the two
 * ways an ordinary, non-adversarial mistake escapes it.
 */
describe('the local sandbox', () => {
  let root: string;
  let sandbox: Sandbox;

  beforeAll(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'runner-sandbox-test-'));
    sandbox = await new LocalSandboxProvider(root).create('test');
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('reads back what it writes', async () => {
    await sandbox.writeFile('notes/a.txt', 'hello');
    expect(await sandbox.readFile('notes/a.txt')).toBe('hello');
  });

  it('refuses a path that climbs out', async () => {
    await expect(sandbox.writeFile('../escaped.txt', 'x')).rejects.toThrow(/escapes/);
    await expect(sandbox.readFile('../../etc/hosts')).rejects.toThrow(/escapes/);
  });

  it('refuses an absolute path', async () => {
    await expect(sandbox.readFile('/etc/hosts')).rejects.toThrow(/escapes/);
  });

  it('does not forward our environment to a command', async () => {
    process.env.RUNNER_TEST_SECRET = 'do-not-leak';
    const result = await sandbox.exec('echo "[$RUNNER_TEST_SECRET]"');
    delete process.env.RUNNER_TEST_SECRET;
    expect(result.stdout).toContain('[]');
    expect(result.stdout).not.toContain('do-not-leak');
  });

  it('reports a non-zero exit rather than throwing', async () => {
    const result = await sandbox.exec('exit 3');
    expect(result.exit_code).toBe(3);
  });

  it('kills a command that runs past its timeout', async () => {
    const result = await sandbox.exec('sleep 5', { timeout_ms: 300 });
    expect(result.timed_out).toBe(true);
  });

  it('lists files relative to the working directory', async () => {
    await sandbox.writeFile('b.txt', 'x');
    const files = await sandbox.listFiles();
    expect(files).toContain('b.txt');
    expect(files.every((f) => !f.startsWith('/'))).toBe(true);
  });
});
