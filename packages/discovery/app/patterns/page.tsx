import fs from 'node:fs/promises';
import path from 'node:path';
import styles from './patterns.module.css';

/**
 * The pattern library, surface #6's front half. It reads grammar/patterns.md at
 * build time rather than duplicating the text, so the document stays the single
 * source and this page can't drift from it.
 *
 * Not yet: a live demo per pattern with a fault toggle. That's the shell brief's
 * real work, and it belongs after a second surface exists to extract from.
 */
type Pattern = { number: number; name: string; oneLiner: string; usedIn: string };

async function readPatterns(): Promise<{ patterns: Pattern[]; premise: string[] }> {
  const file = path.join(process.cwd(), 'grammar', 'patterns.md');
  const text = await fs.readFile(file, 'utf8');

  const patterns: Pattern[] = [];
  const sections = text.split(/^### /m).slice(1);
  for (const section of sections) {
    const [heading, ...rest] = section.split('\n');
    const match = /^(\d+)\.\s+(.*)$/.exec(heading.trim());
    if (!match) continue;
    const body = rest.join('\n');
    const oneLiner = /^>\s*\*(.+?)\*/m.exec(body)?.[1] ?? '';
    const usedIn = /\*\*Used in\.\*\*\s*(.+)/.exec(body)?.[1] ?? '';
    patterns.push({
      number: Number(match[1]),
      name: match[2].trim(),
      oneLiner: oneLiner.trim(),
      usedIn: usedIn.replace(/`/g, '').trim(),
    });
  }

  const premise = (/## The premise\n([\s\S]*?)\n---/.exec(text)?.[1] ?? '')
    .split('\n\n')
    .map((p) => p.replace(/\n/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 2);

  return { patterns, premise };
}

export default async function Patterns() {
  const { patterns, premise } = await readPatterns();
  const earnedByCoding = patterns.filter((p) => p.usedIn.includes('coding'));

  return (
    <main className={styles.page} data-product="shell">
      <header className={styles.head}>
        <h1 className={styles.title}>The pattern language</h1>
        {premise.map((paragraph) => (
          <p className={styles.lede} key={paragraph.slice(0, 24)}>
            {paragraph}
          </p>
        ))}
        <p className={styles.meta}>
          {patterns.length} patterns. {earnedByCoding.length} of them are owed by the coding surface, which is
          the only one built so far — so most of these are claims, not yet evidence.
        </p>
      </header>

      <ol className={styles.list}>
        {patterns.map((pattern) => (
          <li className={styles.row} key={pattern.number} data-coding={String(pattern.usedIn.includes('coding'))}>
            <span className={styles.number}>{String(pattern.number).padStart(2, '0')}</span>
            <span className={styles.main}>
              <span className={styles.name}>{pattern.name}</span>
              {pattern.oneLiner && <span className={styles.one}>{pattern.oneLiner}</span>}
            </span>
            <span className={styles.used}>{pattern.usedIn}</span>
          </li>
        ))}
      </ol>

      <p className={styles.footnote}>
        Full text, rules and changelogs live in <code>grammar/patterns.md</code>. A pattern is only earned
        when a second surface uses it, which is also the rule for entering{' '}
        <code>components/grammar/</code>.
      </p>
    </main>
  );
}
