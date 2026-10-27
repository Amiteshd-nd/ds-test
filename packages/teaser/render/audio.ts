/**
 * Synthesises the soundtrack from the timeline's own cues, with no external tools.
 *
 *   node render/audio.ts  ->  out/sfx.wav   (effects only, film-length)
 *                             out/audio.wav (effects + synthesised bed, film-length)
 *
 * Cues come from out/events.json, which render/capture.ts writes from the mockup
 * (window.events), so sound and picture cannot drift: `key` is one typewriter
 * strike per typed character, `send` a carriage-return bell, `click` a soft pop,
 * `chime` a two-note chime (plan complete, edit landed, export). The bed is a
 * warm, minimal pad progression with a light plucked arpeggio, in the register of
 * product-launch films. Drop a real track at assets/music.(mp3|wav|m4a|aac) and
 * assemble.sh mixes that under sfx.wav instead of the bed.
 *
 * Both files are the full film length: when assets/hero.jpg exists the UI starts
 * hero.seconds - hero.dissolve in, and the effects are offset to match while the
 * bed starts at zero. Loudness is normalised in assemble.sh.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const script = JSON.parse(readFileSync(path.join(root, 'demo', 'script.json'), 'utf8'));
const evFile = path.join(root, 'out', 'events.json');
if (!existsSync(evFile)) { console.error('audio: out/events.json missing; run the capture first'); process.exit(1); }
const ev = JSON.parse(readFileSync(evFile, 'utf8')) as { duration: number; events: { t: number; kind: string }[] };
const A = script.audio;
const SR = 48000;
const hero = existsSync(path.join(root, 'assets', 'hero.jpg'));
const lead = hero ? script.hero.seconds - script.hero.dissolve : 0;
const total = ev.duration + 2 * lead;
const length = Math.ceil(total * SR);

function rng(seed: number) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const vary = rng(1234);

class Track {
  L = new Float32Array(length); R = new Float32Array(length);
  add(at: number, samples: (i: number) => number, dur: number, gain: number, pan = 0) {
    const start = Math.floor(at * SR), n = Math.floor(dur * SR);
    const gl = gain * Math.cos((pan + 1) * Math.PI / 4), gr = gain * Math.sin((pan + 1) * Math.PI / 4);
    for (let i = 0; i < n && start + i < length; i++) { if (start + i < 0) continue; const v = samples(i); this.L[start + i] += v * gl; this.R[start + i] += v * gr; }
  }
}
const env = (i: number, attack: number, decay: number) => { const a = attack * SR, d = decay * SR; return i < a ? i / a : Math.exp(-(i - a) / d); };

// ---- effects ---------------------------------------------------------------
const sfx = new Track();
// a mechanical typewriter strike: a hard transient (key hitting the platen), a
// metallic ring from the typebar, and a short wooden thud from the carriage.
function strike(at: number) {
  const g = A.typewriter.gain * (0.8 + vary() * 0.4), pan = (vary() - 0.5) * 0.3;
  const ring = 2600 + vary() * 900, ring2 = 4100 + vary() * 700, thud = 160 + vary() * 40;
  let hp = 0, prev = 0;
  sfx.add(at, (i) => {
    const p = i / SR;
    const noise = Math.random() * 2 - 1; hp = 0.92 * (hp + noise - prev); prev = noise;      // bright click
    const click = hp * env(i, 0.0004, 0.004) * 1.4;
    const metal = (Math.sin(2 * Math.PI * ring * p) * 0.5 + Math.sin(2 * Math.PI * ring2 * p) * 0.3) * env(i, 0.0005, 0.018);
    const body = Math.sin(2 * Math.PI * thud * p) * env(i, 0.001, 0.03) * 0.9;
    return click + metal + body;
  }, 0.09, g, pan);
}
// carriage-return bell on send: a small bell with inharmonic partials, then the carriage slide
function bell(at: number) {
  const f = 2093;
  sfx.add(at, (i) => { const p = i / SR; return (Math.sin(2 * Math.PI * f * p) + 0.45 * Math.sin(2 * Math.PI * f * 2.76 * p) * Math.exp(-p * 9) + 0.25 * Math.sin(2 * Math.PI * f * 5.4 * p) * Math.exp(-p * 14)) * env(i, 0.001, 0.42); }, 1.4, A.bell.gain, 0.15);
  let lp = 0;
  sfx.add(at + 0.06, (i) => { const noise = Math.random() * 2 - 1; lp += (noise - lp) * 0.08; const p = i / SR; return lp * 2.2 * Math.sin(Math.PI * Math.min(1, p / 0.22)) * env(i, 0.01, 0.2); }, 0.3, A.bell.gain * 0.5, -0.1);
}
const pop = (at: number, gain: number) => sfx.add(at, (i) => { const p = i / SR; const f = 420 * Math.exp(-p * 16) + 150; return Math.sin(2 * Math.PI * f * p * 0.9) * env(i, 0.002, 0.04); }, 0.14, gain);
const chime = (at: number, notes: number[], gain: number) => notes.forEach((f, k) => sfx.add(at + k * 0.09, (i) => { const p = i / SR; return (Math.sin(2 * Math.PI * f * p) + 0.25 * Math.sin(2 * Math.PI * f * 2 * p) * Math.exp(-p * 6)) * env(i, 0.015, 0.5); }, 2.0, gain * (k === 0 ? 1 : 0.8), k === 0 ? -0.2 : 0.2));

const counts: Record<string, number> = {};
let chimeIndex = 0;
for (const e of ev.events) {
  const at = lead + e.t;
  counts[e.kind] = (counts[e.kind] ?? 0) + 1;
  if (e.kind === 'key') strike(at);
  else if (e.kind === 'send') bell(at);
  else if (e.kind === 'click') pop(at, A.pop.gain);
  else if (e.kind === 'chime') chime(at, chimeIndex++ % 2 === 0 ? [659.25, 987.77] : [587.33, 880], A.chime.gain);
}

// ---- bed -------------------------------------------------------------------
// Four chords, two bars each, looping: Cmaj9, Am9, Fmaj7, G6 (warm, unresolved,
// hopeful). Pads are detuned sines with a slow attack; a plucked arpeggio walks
// the chord tones on eighth notes, dropping some at random; a soft sub on 1 and 3.
const bed = new Track();
const B = A.bed;
const beat = 60 / B.bpm;
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
const chords = [[48, 55, 59, 62, 64], [45, 52, 55, 59, 60], [41, 48, 52, 57, 60], [43, 50, 55, 57, 59]];
const chordLen = 8 * beat;
const bedFade = (p: number) => Math.min(1, p / B.fadeIn, Math.max(0, (total - p) / B.fadeOut));
const arpRand = rng(99);
for (let c = 0, start = 0; start < total; c++, start += chordLen) {
  const chord = chords[c % chords.length];
  chord.slice(1).forEach((n, k) => {
    const f = midi(n + 12);
    bed.add(start - 0.4, (i) => { const p = i / SR; const a = Math.min(1, p / 1.6) * Math.min(1, (chordLen + 0.9 - p) / 1.2); return (Math.sin(2 * Math.PI * f * p) + Math.sin(2 * Math.PI * f * 1.003 * p + 1) + 0.35 * Math.sin(2 * Math.PI * f * 2 * p)) * a * bedFade(start + p); }, chordLen + 0.9, B.gain * 0.045, (k - 1.5) * 0.3);
  });
  for (let b = 0; b < 8; b += 2) {
    const f = midi(chord[0]);
    bed.add(start + b * beat, (i) => { const p = i / SR; return Math.sin(2 * Math.PI * f * p) * env(i, 0.03, 0.9) * bedFade(start + b * beat + p); }, 2.0, B.gain * 0.11);
  }
  const tones = chord.slice(1).map((n) => n + 24);
  for (let e = 0; e < 16; e++) {
    if (arpRand() < 0.35) continue;
    const n = tones[(e * 3 + Math.floor(arpRand() * 2)) % tones.length];
    const f = midi(n), at = start + e * beat / 2;
    bed.add(at, (i) => { const p = i / SR; return (Math.sin(2 * Math.PI * f * p) + 0.2 * Math.sin(2 * Math.PI * f * 3 * p) * Math.exp(-p * 9)) * env(i, 0.004, 0.32) * bedFade(at + p); }, 1.4, B.gain * 0.05, (arpRand() - 0.5) * 0.6);
  }
}

// ---- write -----------------------------------------------------------------
function writeWav(file: string, tracks: Track[]) {
  const bytes = new DataView(new ArrayBuffer(44 + length * 4));
  const str = (o: number, s: string) => [...s].forEach((c, i) => bytes.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); bytes.setUint32(4, 36 + length * 4, true); str(8, 'WAVE'); str(12, 'fmt ');
  bytes.setUint32(16, 16, true); bytes.setUint16(20, 1, true); bytes.setUint16(22, 2, true); bytes.setUint32(24, SR, true); bytes.setUint32(28, SR * 4, true); bytes.setUint16(32, 4, true); bytes.setUint16(34, 16, true);
  str(36, 'data'); bytes.setUint32(40, length * 4, true);
  let peak = 0;
  for (let i = 0; i < length; i++) for (const tr of tracks) peak = Math.max(peak, Math.abs(tr.L[i]), Math.abs(tr.R[i]));
  const norm = peak > 0.7 ? 0.7 / peak : 1;
  for (let i = 0; i < length; i++) {
    let l = 0, r = 0; for (const tr of tracks) { l += tr.L[i]; r += tr.R[i]; }
    bytes.setInt16(44 + i * 4, Math.round(Math.max(-1, Math.min(1, l * norm)) * 32767), true);
    bytes.setInt16(46 + i * 4, Math.round(Math.max(-1, Math.min(1, r * norm)) * 32767), true);
  }
  writeFileSync(file, Buffer.from(bytes.buffer));
}
mkdirSync(path.join(root, 'out'), { recursive: true });
writeWav(path.join(root, 'out', 'sfx.wav'), [sfx]);
writeWav(path.join(root, 'out', 'audio.wav'), [sfx, bed]);
console.log(`audio: ${total.toFixed(1)}s (${lead}s lead-in), cues ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')}, bed at ${B.bpm} bpm -> out/sfx.wav, out/audio.wav`);
