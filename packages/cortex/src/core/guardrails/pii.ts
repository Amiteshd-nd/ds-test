// PII on ingress and egress. PRD §14.3.
//
// Detection is per class, and the action per class is configuration, not code: a host
// that must block outbound phone numbers and one that must merely mask them are the same
// deployment with different settings.

export type PiiClass = 'email' | 'phone' | 'card' | 'govt_id' | 'secret';
export type PiiAction = 'allow' | 'mask' | 'block';

const DETECTORS: { cls: PiiClass; re: RegExp }[] = [
  { cls: 'email', re: /\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b/g },
  { cls: 'phone', re: /(?<!\d)(?:\+\d{1,3}[ -]?)?(?:\d[ -]?){9,13}\d(?!\d)/g },
  { cls: 'card', re: /\b(?:\d[ -]?){12,15}\d\b/g },
  { cls: 'govt_id', re: /\b[A-Z]{5}\d{4}[A-Z]\b|\b\d{3}-\d{2}-\d{4}\b/g },
  { cls: 'secret', re: /\b(sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})\b/g },
];

export interface PiiFinding { cls: PiiClass; value: string }

export function detectPii(text: string): PiiFinding[] {
  const out: PiiFinding[] = [];
  for (const { cls, re } of DETECTORS) {
    for (const m of text.matchAll(re)) out.push({ cls, value: m[0] });
  }
  return out;
}

export type PiiPolicy = Partial<Record<PiiClass, PiiAction>>;

const DEFAULT_POLICY: PiiPolicy = { secret: 'block', card: 'block', govt_id: 'block', phone: 'mask', email: 'allow' };

export function applyPiiPolicy(text: string, policy: PiiPolicy = DEFAULT_POLICY): { text: string; blocked: PiiClass[]; masked: PiiClass[] } {
  const blocked: PiiClass[] = [];
  const masked: PiiClass[] = [];
  let out = text;

  for (const finding of detectPii(text)) {
    const action = policy[finding.cls] ?? 'allow';
    if (action === 'block' && !blocked.includes(finding.cls)) blocked.push(finding.cls);
    if (action === 'mask') {
      if (!masked.includes(finding.cls)) masked.push(finding.cls);
      const keep = finding.value.slice(-2);
      out = out.split(finding.value).join('•'.repeat(Math.max(finding.value.length - 2, 3)) + keep);
    }
  }
  return { text: out, blocked, masked };
}
