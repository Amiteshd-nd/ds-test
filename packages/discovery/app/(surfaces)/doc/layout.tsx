import { SurfaceNav } from '@/components/dev/SurfaceNav';
import styles from '../surface.module.css';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.product} data-product="doc">
      <SurfaceNav current="doc" />
      <nav className={styles.nav} aria-label="Surface">
        <span className={styles.navHere}>Doc Agents</span>
        <span className={styles.navRole}>Reviewing what an agent read out of a document you did not</span>
      </nav>
      {children}
    </div>
  );
}
