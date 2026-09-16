// cloud-march hub — a tiny dependency-free launcher.
// Lists the workspace projects and starts each one's dev server on demand
// ("Play"). Started by `pnpm dev` / `npm run dev` at the repo root.
//
// It spawns dev servers via the hoisted node_modules/.bin (vite/next) so it
// doesn't depend on pnpm being on PATH.

import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const HUB_PORT = Number(process.env.HUB_PORT || 8787);

/** The workspace projects. `bin` is resolved from each package's node_modules/.bin. */
const PROJECTS = [
  {
    id: 'personal-doc',
    name: 'Personal Doc',
    tag: 'Portfolio · Vite + React',
    desc: 'My portfolio site. The Bangalore Times game is embedded at /game/bangalore-times.',
    cwd: path.join(ROOT, 'packages/personal-doc'),
    bin: 'vite',
    args: ['--port', '6173', '--strictPort'],
    port: 6173,
  },
  {
    id: 'game',
    name: 'Bangalore Times',
    tag: 'Game · Phaser',
    desc: 'Namma Quest — the standalone game. Move with WASD / arrow keys.',
    cwd: path.join(ROOT, 'packages/game'),
    bin: 'vite',
    args: ['--port', '6174', '--strictPort'],
    port: 6174,
  },
  {
    id: 'gully',
    name: 'Gully',
    tag: 'Prototype · Vite + MapLibre',
    desc: 'One Bengaluru layout at true width, plus four-second report capture. See packages/gully/MANUAL.md for what needs a phone.',
    cwd: path.join(ROOT, 'packages/gully'),
    bin: 'vite',
    args: ['--port', '6175', '--strictPort'],
    port: 6175,
  },
  {
    id: 'discovery',
    name: 'Discovery',
    tag: 'Agentic UI · Next.js',
    desc: 'Six surfaces, one design grammar. Coding Agents is built; the rest are briefs. Background studies live at /studies.',
    cwd: path.join(ROOT, 'packages/discovery'),
    bin: 'next',
    args: ['dev', '-p', '6177'],
    port: 6177,
  },
  {
    id: 'trimension',
    name: 'trimension',
    tag: 'Agent-native CAD · Rust/Wasm + Vite',
    desc:
      'DXF in, 3D out. Four viewports — plan, both elevations, two-point perspective — ' +
      'drawn by a Rust/wgpu renderer in the browser. Needs the Wasm bundle built first: ' +
      'see packages/trimension/README.md.',
    cwd: path.join(ROOT, 'packages/trimension/apps/web'),
    bin: 'vite',
    args: ['--port', '6178', '--strictPort'],
    port: 6178,
    // The web app imports a wasm-bindgen bundle that is a build artifact, not checked in.
    // Without this the hub would "start" fine and the page would fail to resolve an
    // import — a blank screen and a stack trace in the browser rather than in the logs,
    // which is the worst place to discover a missing build step.
    requires: {
      path: 'packages/trimension/apps/web/wasm/trimension.js',
      hint:
        'The Wasm bundle has not been built.\n\n' +
        '  cd packages/trimension\n' +
        '  export RUSTUP_HOME="$PWD/.toolchain/rustup" CARGO_HOME="$PWD/.toolchain/cargo"\n' +
        '  export PATH="$PWD/.toolchain/cargo/bin:$PATH"\n' +
        '  cargo build -p tri-wasm --target wasm32-unknown-unknown --release\n' +
        '  wasm-bindgen --target web --out-dir apps/web/wasm --out-name trimension \\\n' +
        '    target/wasm32-unknown-unknown/release/tri_wasm.wasm\n',
    },
  },
  {
    id: 'blockmodel',
    name: 'blockmodel',
    tag: 'Prototype · Next.js',
    desc: 'Phone photos → 3D model. Needs a KIRI key in packages/blockmodel/.env.local.',
    cwd: path.join(ROOT, 'packages/blockmodel'),
    bin: 'next',
    args: ['dev', '-H', '0.0.0.0', '-p', '6176'],
    port: 6176,
  },
];

const byId = new Map(PROJECTS.map((p) => [p.id, p]));
// id -> { child, status: 'starting'|'running'|'stopped'|'error', logs: string[] }
const state = new Map();

function record(id) {
  if (!state.has(id)) state.set(id, { child: null, status: 'stopped', logs: [] });
  return state.get(id);
}

function urlFor(p) {
  return `http://localhost:${p.port}`;
}

// Resolve a project's dev binary from its own node_modules/.bin (pnpm places
// each package's bins there). Tolerates Windows .cmd shims.
function binPath(p) {
  const direct = path.join(p.cwd, 'node_modules', '.bin', p.bin);
  if (fs.existsSync(direct + '.cmd')) return direct + '.cmd';
  return direct;
}

function canConnect(host, port) {
  return new Promise((resolve) => {
    const sock = net.connect({ host, port });
    sock.once('connect', () => {
      sock.destroy();
      resolve(true);
    });
    sock.once('error', () => {
      sock.destroy();
      resolve(false);
    });
  });
}

// Vite binds IPv6 (::1), Next binds IPv4 (0.0.0.0) — probe both families.
function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const tick = async () => {
      const [v4, v6] = await Promise.all([canConnect('127.0.0.1', port), canConnect('::1', port)]);
      if (v4 || v6) return resolve(true);
      if (Date.now() > deadline) return resolve(false);
      setTimeout(tick, 500);
    };
    tick();
  });
}

async function startProject(id) {
  const p = byId.get(id);
  const rec = record(id);
  if (rec.child) return; // already running/starting

  // Some projects need a build artifact that is not checked in. Say so plainly rather
  // than starting a dev server that will serve a broken page.
  if (p.requires && !fs.existsSync(path.join(ROOT, p.requires.path))) {
    rec.status = 'error';
    rec.logs = [
      `✖ Can't start ${p.name} — a required build output is missing.\n`,
      `  Expected: ${p.requires.path}\n\n`,
      p.requires.hint,
    ];
    return;
  }

  // If the port is already taken (e.g. a leftover server from a previous run),
  // bail with a clear message. Otherwise Next silently moves to the next free
  // port and the hub would health-check the wrong one — the classic "it won't run".
  const busy = (await canConnect('127.0.0.1', p.port)) || (await canConnect('::1', p.port));
  if (busy) {
    rec.status = 'error';
    rec.logs = [
      `✖ Port ${p.port} is already in use — can't start ${p.name}.\n`,
      `  Something is already listening there (often a leftover dev server).\n`,
      `  Free it and hit Play again:\n\n    lsof -ti tcp:${p.port} | xargs kill\n`,
    ];
    return;
  }

  const child = spawn(binPath(p), p.args, {
    cwd: p.cwd,
    env: { ...process.env, FORCE_COLOR: '0' },
    detached: true, // own process group, so we can kill children (e.g. next's workers)
  });

  rec.child = child;
  rec.status = 'starting';
  rec.logs = [`▶ starting ${p.name} (${p.bin} ${p.args.join(' ')})\n`];

  // eslint-disable-next-line no-control-regex
  const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;
  const append = (d) => {
    rec.logs.push(d.toString().replace(ANSI, ''));
    if (rec.logs.length > 300) rec.logs.splice(0, rec.logs.length - 300);
  };
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  // Without this handler a failed spawn (bad path, EACCES, …) throws and would
  // crash the whole hub. Mark the project errored instead.
  child.on('error', (err) => {
    append(`\n✖ failed to start: ${err.message}\n`);
    rec.status = 'error';
    rec.child = null;
  });
  child.on('exit', (code) => {
    append(`\n■ exited (code ${code ?? 'null'})\n`);
    rec.child = null;
    if (rec.status !== 'stopped') rec.status = code === 0 || code === null ? 'stopped' : 'error';
  });

  waitForPort(p.port, 120000).then((ok) => {
    if (rec.child) rec.status = ok ? 'running' : 'error';
  });
}

function stopProject(id) {
  const rec = state.get(id);
  if (!rec?.child) return;
  const pid = rec.child.pid;
  rec.status = 'stopped';
  try {
    process.kill(-pid, 'SIGTERM'); // whole group (detached)
  } catch {
    try {
      rec.child.kill('SIGTERM');
    } catch {
      /* already gone */
    }
  }
  rec.child = null;
}

function snapshot() {
  return PROJECTS.map((p) => {
    const rec = record(p.id);
    return {
      id: p.id,
      name: p.name,
      tag: p.tag,
      desc: p.desc,
      port: p.port,
      url: urlFor(p),
      status: rec.status,
    };
  });
}

// ── HTTP ────────────────────────────────────────────────────────────────────
const INDEX = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));

function json(res, code, body) {
  const buf = Buffer.from(JSON.stringify(body));
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': buf.length });
  res.end(buf);
}

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://localhost:${HUB_PORT}`);

  if (req.method === 'GET' && pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(INDEX);
  }
  if (req.method === 'GET' && pathname === '/api/projects') {
    return json(res, 200, { projects: snapshot() });
  }

  const m = pathname.match(/^\/api\/projects\/([^/]+)\/(start|stop|logs)$/);
  if (m) {
    const [, id, action] = m;
    if (!byId.has(id)) return json(res, 404, { error: 'unknown project' });
    if (action === 'start' && req.method === 'POST') {
      await startProject(id);
      return json(res, 200, { ok: true, url: urlFor(byId.get(id)) });
    }
    if (action === 'stop' && req.method === 'POST') {
      stopProject(id);
      return json(res, 200, { ok: true });
    }
    if (action === 'logs' && req.method === 'GET') {
      return json(res, 200, { logs: record(id).logs.join('') });
    }
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(HUB_PORT, () => {
  console.log(`\n  cloud-march hub → http://localhost:${HUB_PORT}\n`);
  console.log('  Open it and hit Play on a project to start its dev server.\n');
});

// Clean up every child dev server when the hub exits.
function shutdown() {
  for (const id of state.keys()) stopProject(id);
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
