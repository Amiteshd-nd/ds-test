import { SurfaceNav } from '@/components/dev/SurfaceNav';
import styles from '../surface.module.css';

/* One route, one `data-product`. Every theme value flows from this attribute, so a
   surface cannot accidentally borrow another's density or palette. It sits on a
   wrapper rather than <html> because the root layout is shared, and the wrapper
   paints `--bg-canvas` itself so the theme still owns the whole viewport. */
export default function CodingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.product} data-product="coding">
      <SurfaceNav current="coding" />
      <nav className={styles.nav} aria-label="Surface">
        <span className={styles.navHere}>Coding Agents</span>
        <span className={styles.navRole}>A forty-minute run, and staying in control of it</span>
      </nav>
      {children}
    </div>
  );
}
