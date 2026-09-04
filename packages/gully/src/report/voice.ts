/**
 * The voice path — a peer to the camera, not a fallback (PRD §7 Phase 2).
 *
 * "Tanker on 3rd cross" has to work for a rider who has not taken their gloves
 * off, and for Suresh, whose budget for this is zero seconds and voice only.
 * Kannada, Hindi and English are all first-class: the keyword table below is
 * transliteration-tolerant because Web Speech returns Latin script for Kannada
 * as often as it returns Kannada.
 */
import type { ObstructionType } from './types';

export type VoiceLang = 'en-IN' | 'kn-IN' | 'hi-IN';

export const VOICE_LANGS: { code: VoiceLang; label: string }[] = [
  { code: 'en-IN', label: 'English' },
  { code: 'kn-IN', label: 'ಕನ್ನಡ' },
  { code: 'hi-IN', label: 'हिंदी' },
];

/** Matched as substrings against a lowercased transcript, longest first. */
const KEYWORDS: Record<ObstructionType, string[]> = {
  tanker: ['water tanker', 'tanker', 'ಟ್ಯಾಂಕರ್', 'टैंकर', 'neeru gaadi', 'ನೀರಿನ ಟ್ಯಾಂಕರ್', 'pani ka tanker'],
  mixer: ['concrete mixer', 'cement mixer', 'mixer', 'ಮಿಕ್ಸರ್', 'मिक्सर', 'ready mix'],
  garbage: ['garbage', 'auto tipper', 'ಕಸದ', 'ಕಸ', 'कचरा', 'kasa gaadi', 'bbmp truck'],
  lorry: ['lorry', 'truck', 'ಲಾರಿ', 'लॉरी', 'ट्रक'],
  construction: ['construction', 'digging', 'road work', 'ಕಾಮಗಾರಿ', 'निर्माण', 'खुदाई', 'jcb'],
  event: ['function', 'wedding', 'pandal', 'tent', 'ಸಮಾರಂಭ', 'शादी', 'marriage'],
  other: [],
};

const ORDINALS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7,
  eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12,
};

export interface Utterance {
  transcript: string;
  type: ObstructionType | null;
  /** Normalised street reference, e.g. "3rd cross". Null when none was heard. */
  street: string | null;
  /** True for "it's clear", "gaadi hogide", "road is free". */
  clear: boolean;
}

const CLEAR_PHRASES = [
  'clear', 'it is clear', 'road is clear', 'free', 'nothing here', 'gone', 'moved',
  'ಕ್ಲಿಯರ್', 'ಖಾಲಿ', 'ಹೋಗಿದೆ', 'साफ', 'खाली', 'चला गया',
];

export function parseUtterance(raw: string): Utterance {
  const text = raw.toLowerCase().trim();

  const clear = CLEAR_PHRASES.some((p) => text.includes(p));

  let type: ObstructionType | null = null;
  let bestLen = 0;
  for (const [t, words] of Object.entries(KEYWORDS) as [ObstructionType, string[]][]) {
    for (const w of words) {
      if (w.length > bestLen && text.includes(w)) {
        type = t;
        bestLen = w.length;
      }
    }
  }

  return { transcript: raw.trim(), type, street: parseStreet(text), clear };
}

/**
 * "on third cross" / "3rd cross" / "2nd main" → "3rd cross" / "2nd main".
 * Bengaluru layouts are numbered, which makes this far more tractable than
 * general street-name recognition — and the numbering is what people say.
 */
export function parseStreet(text: string): string | null {
  const kind = /(cross|main|ಕ್ರಾಸ್|ಮೇನ್|क्रॉस|मेन)/.exec(text);
  if (!kind) return null;
  const noun = /cross|ಕ್ರಾಸ್|क्रॉस/.test(kind[1]) ? 'cross' : 'main';

  const digits = /(\d{1,2})\s*(?:st|nd|rd|th)?\s*(?:cross|main|ಕ್ರಾಸ್|ಮೇನ್|क्रॉस|मेन)/.exec(text);
  if (digits) return `${Number(digits[1])} ${noun}`;

  for (const [word, n] of Object.entries(ORDINALS)) {
    if (text.includes(`${word} ${noun}`)) return `${n} ${noun}`;
  }
  return null;
}

/**
 * Score a segment name against a heard street reference. Returns 0 when the
 * reference does not apply, so callers can fall back to plain distance snapping
 * rather than trusting a bad match.
 */
export function streetScore(segmentName: string, street: string | null): number {
  if (!street) return 0;
  const [num, noun] = street.split(' ');
  const name = segmentName.toLowerCase();
  if (!name.includes(noun)) return 0;
  const found = /(\d{1,2})\s*(?:st|nd|rd|th)?\s/.exec(name);
  if (!found) return 0.4; // right kind of street, unknown number
  return Number(found[1]) === Number(num) ? 1 : 0;
}

// ── recognition ─────────────────────────────────────────────────────────────

type SpeechCtor = new () => SpeechRecognitionLike;

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

function ctor(): SpeechCtor | null {
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const speechAvailable = () => ctor() !== null;

export interface Listener {
  stop(): void;
  done: Promise<Utterance | null>;
}

/** One shot. Resolves null if nothing intelligible arrived. */
export function listen(lang: VoiceLang): Listener {
  const Ctor = ctor();
  if (!Ctor) return { stop() {}, done: Promise.resolve(null) };

  const rec = new Ctor();
  rec.lang = lang;
  rec.continuous = false;
  rec.interimResults = false;
  rec.maxAlternatives = 3;

  let settle: (u: Utterance | null) => void;
  const done = new Promise<Utterance | null>((r) => (settle = r));
  let got: Utterance | null = null;

  rec.onresult = (e) => {
    const alts = e.results[0];
    // Take the first alternative that names an obstruction; speech engines rank
    // by acoustics, and "tanker" often sits second behind "thank you".
    for (let i = 0; i < alts.length; i++) {
      const parsed = parseUtterance(alts[i].transcript);
      if (parsed.type || parsed.clear) {
        got = parsed;
        break;
      }
      if (!got) got = parsed;
    }
  };
  rec.onerror = () => {};
  rec.onend = () => settle(got);

  try {
    rec.start();
  } catch {
    settle!(null);
  }

  return { stop: () => rec.stop(), done };
}
