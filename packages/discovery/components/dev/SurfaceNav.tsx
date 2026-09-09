import Link from 'next/link';
import styles from './surfacenav.module.css';

/**
 * A switcher across the surfaces, for building. Deliberately dev chrome — monospace,
 * muted, no product tokens — for the same reason the fault bar is: the real
 * cross-surface navigation is Pattern 17 and belongs to `shell`, which
 * docs/PROGRAM.md says is an extraction rather than an invention. Designing it now,
 * from one built surface, would be a guess wearing a system's clothes.
 *
 * Hidden by the same flag as the fault bar, so a user test sees only the product.
 */
const SURFACES = [
  { id: 'coding', href: '/coding', built: true },
  { id: 'doc', href: '/doc', built: true },
  { id: 'content', href: '/content', built: true },
  { id: 'work', href: '/work', built: false },
  { id: 'voice', href: '/voice', built: false },
];

export function SurfaceNav({ current }: { current: string }) {
  if (process.env.NEXT_PUBLIC_HIDE_DEV_CHROME === '1') return null;

  return (
    <nav className={styles.bar} aria-label="Surfaces (development only)">
      <Link className={styles.home} href="/">
        discovery
      </Link>
      <ul className={styles.list}>
        {SURFACES.map((surface) => (
          <li key={surface.id}>
            <Link
              className={styles.item}
              href={surface.href}
              data-here={String(surface.id === current)}
              data-built={String(surface.built)}
              aria-current={surface.id === current ? 'page' : undefined}
            >
              {surface.id}
            </Link>
          </li>
        ))}
      </ul>
      <span className={styles.aside}>
        <Link className={styles.item} href={`/dev/gallery/${current}`}>
          gallery
        </Link>
        <Link className={styles.item} href="/patterns">
          patterns
        </Link>
      </span>
    </nav>
  );
}
