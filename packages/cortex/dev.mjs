// `pnpm dev:cortex` / the hub's Play button.
//
// Two processes: the CORTEX service on 6182 and the Atlas demo on 6181, which proxies
// /v1 to the service. Started together because a demo with no service behind it is a
// blank screen with a network error, which is the worst way to learn that.

import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const children = [];

function start(name, command, args, cwd) {
  const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
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
    try { c.kill('SIGTERM'); } catch { /* already gone */ }
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

for (const [name, port] of [['api', 6182], ['web', 6181]]) {
  if (await portBusy(port)) {
    process.stderr.write(
      `\n✖ Port ${port} is already in use, so ${name} cannot start.\n` +
        `  Something is still listening there — usually a dev server from a previous run.\n` +
        `  Free it and try again:\n\n    lsof -ti tcp:${port} | xargs kill\n\n`,
    );
    process.exit(1);
  }
}

start('api', process.execPath, ['--watch', path.join(ROOT, 'src/server/main.ts')], ROOT);
start('web', path.join(ROOT, 'node_modules/.bin/vite'), ['--config', path.join(ROOT, 'demo/vite.config.ts')], ROOT);
