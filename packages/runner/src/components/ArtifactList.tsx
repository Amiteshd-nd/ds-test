'use client';

import { motion, rise, staggerChildren, tokens, useMotionSafe } from '@cloud-march/motion/react';

import styles from './workbench.module.css';

export interface FiledArtifact {
  filename: string;
  href: string;
  bytes: number;
  modified: string;
}

/** What a task produced that the owner can open: reports, decks, exports. */
export function ArtifactList({ artifacts }: { artifacts: FiledArtifact[] }) {
  const item = useMotionSafe(rise());

  if (artifacts.length === 0) {
    return (
      <section>
        <h2 className={styles.panelHeading}>Files</h2>
        <p className={styles.placeholder}>Reports and decks land here.</p>
      </section>
    );
  }

  return (
    <section>
      <h2 className={styles.panelHeading}>Files</h2>
      <motion.ul
        className={styles.artifacts}
        variants={staggerChildren(artifacts.length)}
        initial="hidden"
        animate="visible"
      >
        {artifacts.map((artifact) => (
          <motion.li key={artifact.href} variants={item} transition={tokens.spring.firm}>
            <a className={styles.artifact} href={artifact.href} download>
              <span className={styles.artifactKind}>{kind(artifact.filename)}</span>
              <span className={styles.artifactName}>{artifact.filename}</span>
              <span className={styles.artifactSize}>{size(artifact.bytes)}</span>
            </a>
          </motion.li>
        ))}
      </motion.ul>
    </section>
  );
}

function kind(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return { md: 'Report', pdf: 'PDF', pptx: 'Slides', html: 'Page' }[ext] ?? ext.toUpperCase();
}

function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
