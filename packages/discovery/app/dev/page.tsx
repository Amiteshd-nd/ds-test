import Link from 'next/link';
import styles from './dev.module.css';

/* The dev index. Everything here is a design tool; none of it is product UI. */
export default function Dev() {
  return (
    <main className={styles.dev}>
      <h1 className={styles.title}>Development surfaces</h1>
      <ul className={styles.list}>
        <li>
          <Link href="/dev/gallery/coding">State gallery — coding</Link>
          <span>Every state in projects/coding/states.md, side by side, driven by the runtime.</span>
        </li>
        <li>
          <Link href="/dev/gallery/content">State gallery — content</Link>
          <span>Every state in projects/content/states.md, each with a variant open.</span>
        </li>
        <li>
          <Link href="/dev/gallery/doc">State gallery — doc</Link>
          <span>
            Every state in projects/doc/states.md, each with its own source pane — half of doc&apos;s
            states are about whether a value can be pointed at.
          </span>
        </li>
        <li>
          <span>Fault toolbar</span>
          <span>Mounted on the coding surface itself, fixed to the bottom of the viewport.</span>
        </li>
        <li>
          <span>SSE endpoint</span>
          <span>
            <code>POST /api/agent</code> with <code>{'{ script, seed, faults, speed }'}</code>. Scripted runs
            need no key; <code>live: true</code> returns 501 until a key exists.
          </span>
        </li>
      </ul>
    </main>
  );
}
