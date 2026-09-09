import Link from 'next/link';
import styles from './surface.module.css';

/**
 * A surface with a brief and no build yet. It says that plainly, and points at the
 * brief and the patterns it owes, because an empty themed shell reads as broken and
 * teaches nobody anything.
 */
export function StubSurface({
  name,
  order,
  title,
  lede,
  banks,
  brief,
}: {
  name: string;
  order: number;
  title: string;
  lede: string;
  banks: string[];
  brief: string;
}) {
  return (
    <div className={styles.stub}>
      <h1 className={styles.stubTitle}>{title}</h1>
      <p className={styles.stubLede}>{lede}</p>
      <ul className={styles.stubList}>
        <li>
          <span className={styles.stubKey}>Build order</span>
          <span>
            #{order} of 6 — after coding
          </span>
        </li>
        <li>
          <span className={styles.stubKey}>Brief</span>
          <span className={styles.stubPath}>{brief}</span>
        </li>
        <li>
          <span className={styles.stubKey}>Patterns it owes</span>
          <span>{banks.join(', ')}</span>
        </li>
        <li>
          <span className={styles.stubKey}>Next step</span>
          <span>
            The state list, in <span className={styles.stubPath}>projects/{name}/states.md</span> — before any
            screen. <Link href="/coding">coding</Link> is the worked example.
          </span>
        </li>
      </ul>
    </div>
  );
}
