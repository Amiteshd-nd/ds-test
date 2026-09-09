import Link from 'next/link';
import Explorer from '@/components/surfaces/studies/Explorer';
import '@/components/surfaces/studies/studies.css';
import styles from './studies.module.css';

export const metadata = {
  title: 'Background studies — Discovery',
};

/**
 * The background studies: four vector backgrounds and a height-field water surface,
 * from the Figma Make export this package started as. Kept because the water is
 * worth keeping, fenced off because it belongs to no part of the program — it uses
 * none of the grammar, earns none of the patterns, and answers to none of the rules
 * in CLAUDE.md.
 */
export default function Studies() {
  return (
    <div className={styles.studies}>
      <nav className={styles.nav}>
        <Link href="/">Discovery</Link>
        <span>Background studies</span>
        <span className={styles.aside}>outside the program</span>
      </nav>
      <div className="studies">
        <Explorer />
      </div>
    </div>
  );
}
