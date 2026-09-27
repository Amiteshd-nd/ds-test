'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, rise, staggerChildren, tokens, useMotionSafe } from '@cloud-march/motion/react';

import type { PageCheck } from '@/core/types';

import styles from './workbench.module.css';

export interface SiteVersion {
  version: number;
  created_at: string;
  title: string;
  headline: string;
  deployed_url: string | null;
  preview_url: string;
}

type Device = 'desktop' | 'mobile';

/**
 * The preview: the built page, at two widths, with its version history.
 *
 * The device switch is deliberately not animated. Someone reviewing a page
 * flips between phone and desktop dozens of times in a sitting, and an
 * animation on an interaction at that frequency is friction rather than polish.
 * It is also a width change, which is a layout property and the wrong thing to
 * animate at any frequency.
 */
export function Preview({
  projectId,
  versions,
  checks,
  onRefresh,
}: {
  projectId: string;
  versions: SiteVersion[];
  checks: PageCheck[];
  onRefresh: () => void;
}) {
  const [device, setDevice] = useState<Device>('desktop');
  const [selected, setSelected] = useState<number | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState<{ url: string; is_public: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A cache-buster, so republishing the same version actually reloads the frame.
  const [nonce, setNonce] = useState(0);

  const current = versions.find((v) => v.version === selected) ?? versions[0];

  useEffect(() => {
    setNonce((n) => n + 1);
  }, [current?.version]);

  const publish = useCallback(async () => {
    if (!current) return;
    setPublishing(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/deploy`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version: current.version }),
      });
      const body = (await response.json()) as {
        url?: string;
        is_public?: boolean;
        error?: string;
      };
      if (!response.ok || !body.url) {
        setError(body.error ?? 'could not publish');
        return;
      }
      setPublished({ url: body.url, is_public: Boolean(body.is_public) });
      onRefresh();
    } finally {
      setPublishing(false);
    }
  }, [current, projectId, onRefresh]);

  if (!current) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyTitle}>No page yet.</p>
        <p>Describe the business and Runner will build one. It shows up here.</p>
      </div>
    );
  }

  return (
    <div className={styles.preview}>
      <div className={styles.previewBar}>
        <div className={styles.segmented} role="group" aria-label="Preview width">
          {(['desktop', 'mobile'] as Device[]).map((d) => (
            <button
              key={d}
              type="button"
              className={`${styles.segment} ${device === d ? styles.segmentActive : ''}`}
              onClick={() => setDevice(d)}
              aria-pressed={device === d}
            >
              {d === 'desktop' ? 'Desktop' : 'Phone'}
            </button>
          ))}
        </div>

        <span className={styles.hint}>
          v{current.version} · {current.title}
        </span>

        <a
          className={styles.textButton}
          href={current.preview_url}
          target="_blank"
          rel="noreferrer"
        >
          Open in a tab
        </a>
      </div>

      <div className={`${styles.previewStage} ${device === 'mobile' ? styles.previewPhone : ''}`}>
        <iframe
          key={`${current.version}-${nonce}`}
          className={styles.previewFrame}
          src={current.preview_url}
          title={`Preview of version ${current.version}`}
          /*
           * `allow-scripts` without `allow-same-origin`.
           *
           * The page has to run its own scripts or the preview is not a
           * preview. Granting both at once would be worse than granting
           * neither: together they put a model-generated document on this
           * app's origin, where it can read the session cookie and script the
           * parent. Scripts alone give it a unique opaque origin, which is
           * everything a static landing page needs and nothing else.
           */
          sandbox="allow-scripts"
          loading="eager"
        />
      </div>

      <div className={styles.previewFoot}>
        <button
          type="button"
          className={styles.send}
          onClick={() => void publish()}
          disabled={publishing}
        >
          {publishing ? 'Publishing…' : `Publish v${current.version}`}
        </button>

        {published ? (
          <span className={published.is_public ? styles.hint : styles.warn}>
            <a href={published.url} target="_blank" rel="noreferrer" className={styles.footKey}>
              {published.url}
            </a>
            {published.is_public ? '' : ' - on this machine only, not public'}
          </span>
        ) : null}

        {error ? <span className={styles.warn}>{error}</span> : null}
      </div>

      {/*
        Said on every page, every time, rather than once in the transcript where
        it scrolls away. The photographs are real and load correctly, and they
        are of nothing in particular - which is easy to miss on a page that
        otherwise looks finished.
      */}
      <p className={styles.previewNote}>
        The photographs are stand-ins. They are real images at the right shape, but not
        pictures of this business. Replace them before anyone sees this page.
      </p>

      {versions.length > 1 || checks.length > 0 ? (
        <div className={styles.previewAside}>
          {checks.length > 0 ? <ChecksList checks={checks} /> : null}
          {versions.length > 1 ? (
            <section>
              <h2 className={styles.panelHeading}>Versions</h2>
              <ul className={styles.versions}>
                {versions.map((v) => (
                  <li key={v.version}>
                    <button
                      type="button"
                      className={`${styles.version} ${v.version === current.version ? styles.versionActive : ''}`}
                      onClick={() => setSelected(v.version)}
                    >
                      <span className={styles.versionNumber}>v{v.version}</span>
                      <span className={styles.versionLabel}>{v.headline || v.title}</span>
                      {v.deployed_url ? <span className={styles.versionTag}>published</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * What the browser measured.
 *
 * These arrive after a build, while the reader is looking at the page rather
 * than at this list, so they animate in: the movement is what says the result
 * landed. Staggered inside a fixed budget so a run of twenty checks does not
 * read as a slow load.
 */
function ChecksList({ checks }: { checks: PageCheck[] }) {
  const item = useMotionSafe(rise());
  const failed = checks.filter((c) => !c.passed);
  const passed = checks.length - failed.length;

  return (
    <section>
      <h2 className={styles.panelHeading}>
        Browser checks · {passed}/{checks.length}
      </h2>

      {failed.length === 0 ? (
        <p className={styles.placeholder}>Everything measured passed, at both widths.</p>
      ) : (
        <motion.ul
          className={styles.checks}
          variants={staggerChildren(failed.length)}
          initial="hidden"
          animate="visible"
        >
          {failed.map((check) => (
            <motion.li
              key={`${check.viewport}-${check.id}`}
              className={styles.check}
              variants={item}
              transition={tokens.spring.firm}
            >
              <span
                className={`${styles.stepDot} ${check.blocking ? styles.stepDotError : ''}`}
                aria-hidden
              />
              <span>
                <span className={styles.checkLabel}>{check.label}</span>
                <span className={styles.checkDetail}>
                  {check.viewport}
                  {check.detail ? ` · ${check.detail}` : ''}
                </span>
              </span>
            </motion.li>
          ))}
        </motion.ul>
      )}
    </section>
  );
}
