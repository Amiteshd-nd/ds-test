import { SurfaceNav } from '@/components/dev/SurfaceNav';
import styles from '../surface.module.css';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.product} data-product="voice">
      <SurfaceNav current="voice" />
      <nav className={styles.nav} aria-label="Surface">
        <span className={styles.navHere}>Voice Agents</span>
        <span className={styles.navRole}>Authoring an agent, and simulating a thousand calls first</span>
      </nav>
      {children}
    </div>
  );
}
