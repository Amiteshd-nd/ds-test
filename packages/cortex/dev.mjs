// `pnpm dev:cortex` / the hub's Play button.
//
// Two processes: the CORTEX service on 6182 and the Atlas demo on 6181, which proxies
// /v1 to the service. Started together because a demo with no service behind it is a
// blank screen with a network error, which is the worst way to learn that.

import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const children = [];

function start(name, command, args, cwd) {
  // `detached` puts each child in its own process group so `stopAll` can kill the group
  // rather than just the child. `node --watch` in particular runs the real server as a
  // grandchild: kill only the child and the grandchild is orphaned, keeps the port, and
  // every later start is refused by the check below — which is exactly what happened
  // here, and the symptom was "cortex will not start" long after the cause.
  const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  const tag = `[${name}] `;
  const pipe = (stream, out) => {
    let buf = '';
    stream.on('data', (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        out.write(tag + buf.slice(0, i) + '\n');
        buf = buf.slice(i + 1);
      }
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on('exit', (code) => {
    process.stdout.write(`${tag}exited (${code})\n`);
    stopAll();
    process.exit(code ?? 1);
  });
  children.push(child);
  return child;
}

function stopAll() {
  for (const c of children) {
    try {
      // Negative pid = the whole group, which is the point of `detached` above.
      process.kill(-c.pid, 'SIGTERM');
    } catch {
      try { c.kill('SIGTERM'); } catch { /* already gone */ }
    }
  }
}

process.on('SIGINT', () => { stopAll(); process.exit(0); });
process.on('SIGTERM', () => { stopAll(); process.exit(0); });

// --watch so the service restarts on an edit, the way the Vite side already does.
// Runs resume from their checkpoints on each restart, which is a pleasant way to be
// reminded that durability is real.
// Check the ports before starting anything.
//
// `node --watch` reacts to a failed start by printing the error and waiting for a file
// change. With a stale server still holding the port, that means the old code keeps
// serving while the new process sits there quietly — so an edit appears to do nothing
// and the obvious conclusion is that the edit is wrong. Better to refuse to start.
function portBusy(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => { socket.destroy(); resolve(false); });
  });
}

/** Who is holding a port, so the message can name it rather than describe it. */
function holderOf(port) {
  const pids = spawnSync('lsof', ['-ti', `tcp:${port}`], { encoding: 'utf8' }).stdout?.trim().split('\n').filter(Boolean) ?? [];
  return pids.map((pid) => {
    const command = spawnSync('ps', ['-o', 'command=', '-p', pid], { encoding: 'utf8' }).stdout?.trim() ?? '';
    const ours = command.includes('packages/cortex');
    return { pid, command: command.slice(0, 110), ours };
  });
}

for (const [name, port] of [['api', 6182], ['web', 6181]]) {
  if (!(await portBusy(port))) continue;

  const holders = holderOf(port);
  const leftovers = holders.filter((h) => h.ours);
  process.stderr.write(`\n✖ Port ${port} is already in use, so ${name} cannot start.\n\n`);
  for (const h of holders) {
    process.stderr.write(`  pid ${h.pid}${h.ours ? '  (this project)' : ''}\n    ${h.command}\n`);
  }
  process.stderr.write(
    leftovers.length
      ? `\n  That is a leftover from a previous run of this project — usually one that was\n` +
          `  killed hard enough that it never cleaned up. Free it and try again:\n\n` +
          `    kill ${leftovers.map((h) => h.pid).join(' ')}\n\n`
      : `\n  That is not this project. Stop it, or change the port in cortex.config.yaml\n` +
          `  and demo/vite.config.ts.\n\n`,
  );
  process.exit(1);
}

start('api', process.execPath, ['--watch', path.join(ROOT, 'src/server/main.ts')], ROOT);
start('web', path.join(ROOT, 'node_modules/.bin/vite'), ['--config', path.join(ROOT, 'demo/vite.config.ts')], ROOT);
