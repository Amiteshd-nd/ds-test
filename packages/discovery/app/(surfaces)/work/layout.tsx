import { SurfaceNav } from '@/components/dev/SurfaceNav';
import styles from '../surface.module.css';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.product} data-product="work">
      <SurfaceNav current="work" />
      <nav className={styles.nav} aria-label="Surface">
        <span className={styles.navHere}>Work Agents</span>
        <span className={styles.navRole}>Agents acting as you, with an audit trail that holds up</span>
      </nav>
      {children}
    </div>
  );
}
