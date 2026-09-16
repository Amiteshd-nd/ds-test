import Link from 'next/link';
import styles from './front.module.css';

const SURFACES = [
  {
    href: '/coding',
    order: 1,
    name: 'Coding Agents',
    build: 'built',
    what: 'A forty-minute run, and staying in control of it. Visible plan, mid-run steering, semantic checkpoints.',
  },
  {
    href: '/doc',
    order: 2,
    name: 'Doc Agents',
    build: 'built',
    what: 'Extraction review: provenance down to the region, confidence without numbers, non-findings.',
  },
  {
    href: '/content',
    order: 3,
    name: 'Content Agents',
    build: 'built',
    what: 'Approving media you cannot evaluate. Nine scripts, back-translation, drift.',
  },
  {
    href: '/work',
    order: 4,
    name: 'Work Agents',
    build: 'built',
    what: 'Agents acting as you, with an audit trail that holds up. Authority, not accuracy.',
  },
  {
    href: '/voice',
    order: 5,
    name: 'Voice Agents',
    build: 'built',
    what: 'Authoring an agent, then simulating a thousand calls before one reaches a person.',
  },
];

export default function Front() {
  return (
    <main className={styles.front}>
      <header className={styles.head}>
        <h1 className={styles.title}>Six surfaces, one design grammar</h1>
        <p className={styles.lede}>
          Working prototypes for user testing. Each one runs in the browser against a deterministic,
          fault-injectable agent runtime, so every failure state can be reproduced on demand — which
          is the only way to design for them.
        </p>
      </header>

      <ol className={styles.list}>
        {SURFACES.map((surface) => (
          <li className={styles.row} key={surface.href} data-built={String(surface.build === 'built')}>
            <span className={styles.order}>{surface.order}</span>
            <span className={styles.rowMain}>
              {surface.build === 'built' ? (
                <Link className={styles.name} href={surface.href}>
                  {surface.name}
                </Link>
              ) : (
                <span className={styles.name}>{surface.name}</span>
              )}
              <span className={styles.what}>{surface.what}</span>
            </span>
            <span className={styles.state}>{surface.build}</span>
          </li>
        ))}
      </ol>

      <section className={styles.also}>
        <h2 className={styles.alsoTitle}>Also here</h2>
        <ul className={styles.alsoList}>
          <li>
            <Link href="/patterns">The pattern language</Link>
            <span>Seventeen patterns, each earned in at least two surfaces.</span>
          </li>
          <li>
            <Link href="/dev/gallery/coding">State gallery — coding</Link>
            <span>Every state on one page, unstyled, driven by the runtime.</span>
          </li>
          <li>
            <Link href="/studies">Background studies</Link>
            <span>Four vector backgrounds and a water surface. Not part of the program.</span>
          </li>
        </ul>
      </section>
    </main>
  );
}
