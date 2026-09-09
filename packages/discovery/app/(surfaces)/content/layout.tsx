import { SurfaceNav } from '@/components/dev/SurfaceNav';
import styles from '../surface.module.css';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.product} data-product="content">
      <SurfaceNav current="content" />
      <nav className={styles.nav} aria-label="Surface">
        <span className={styles.navHere}>Content Agents</span>
        <span className={styles.navRole}>Approving media you cannot evaluate</span>
      </nav>
      {children}
    </div>
  );
}
