'use client';

/**
 * Time is the primary axis, so the dub is drawn against the source rather than
 * listed as sentences.
 *
 * Two tracks at the same scale: the source's segments on top, this language's below.
 * Alignment is the Provenance Link in the time dimension — a dub segment points at
 * the source segment that produced it, and a segment that can't say which is a
 * timeline made of decoration.
 *
 * `TIMING_OVERRUN` is the constraint that only exists in this medium: Tamil audio
 * for an English line is simply longer than the shot. It's drawn as an overhang past
 * the segment's box rather than as a colour, because the point is that it doesn't
 * fit — a badge would make it a property of the segment instead of a collision.
 *
 * The waveform is a deterministic placeholder shape and the caption says so. There
 * is no audio in this prototype (see the decision log): faking a voice would
 * misrepresent the exact thing this surface exists to judge.
 */
import { copy } from './copy';
import type { Segment, Variant } from '@/lib/surfaces/content/reducer';
import styles from './content.module.css';

const TICKS = 5;

/** A stable pseudo-waveform from the language tag — same shape every render. */
function bars(seed: string, count: number) {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return Array.from({ length: count }, (_, i) => {
    hash = (hash * 1103515245 + 12345) >>> 0;
    const base = ((hash >>> 16) % 100) / 100;
    // Shape it a little so it reads as speech rather than noise.
    return 0.25 + base * 0.6 * (0.7 + 0.3 * Math.sin(i / 3));
  });
}

function Track({
  segments,
  durationMs,
  role,
  selected,
  onSelect,
}: {
  segments: Segment[];
  durationMs: number;
  role: 'source' | 'dub';
  selected?: number;
  onSelect?: (index: number) => void;
}) {
  const pct = (ms: number) => `${Math.min(100, (ms / durationMs) * 100)}%`;
  return (
    <div className={styles.track} data-role={role}>
      {segments.map((segment) => {
        const start = role === 'source' ? segment.sourceStartMs ?? segment.startMs : segment.startMs;
        const end = role === 'source' ? segment.sourceEndMs ?? segment.endMs : segment.endMs;
        const width = Math.max(0, end - start);
        return (
          <div
            key={segment.index}
            className={styles.seg}
            data-timing={role === 'dub' ? segment.timing : 'fits'}
            data-selected={String(selected === segment.index)}
            style={{ left: pct(start), width: pct(width) }}
            onClick={onSelect ? () => onSelect(segment.index) : undefined}
            title={segment.text}
          >
            {segment.index + 1}
            {/* The overhang: what doesn't fit, drawn outside the shot it must fit. */}
            {role === 'dub' && segment.timing === 'overrun' && segment.overByMs && (
              <span
                className={styles.overhang}
                style={{ left: '100%', width: pct(segment.overByMs) }}
                aria-hidden="true"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function Timeline({
  variant,
  durationMs,
  selectedSegment,
  onSelectSegment,
}: {
  variant: Variant;
  durationMs: number;
  selectedSegment?: number;
  onSelectSegment?: (index: number) => void;
}) {
  const pct = (ms: number) => `${Math.min(100, (ms / durationMs) * 100)}%`;
  const marks = [
    ...variant.pronunciation.map((p) => ({ atMs: p.atMs, label: p.term })),
    ...(variant.clauseDropped ? [{ atMs: variant.clauseDropped.atMs, label: 'missing clause' }] : []),
  ];
  const wave = bars(variant.lang, 96);
  const unaligned = variant.segments.filter((s) => s.sourceStartMs === undefined);

  return (
    <div className={styles.timeline}>
      <div className={styles.timelineHead}>
        <span>{copy.head.source}</span>
        <span>{copy.head.duration(durationMs)}</span>
      </div>
      <Track segments={variant.segments} durationMs={durationMs} role="source" />

      <div className={styles.timelineHead}>
        <span lang={variant.lang}>{variant.lang}</span>
        {variant.expansion && variant.expansion > 1 && (
          <span>{copy.timing.expansion(variant.expansion)}</span>
        )}
      </div>
      <div style={{ position: 'relative' }}>
        <Track
          segments={variant.segments}
          durationMs={durationMs}
          role="dub"
          selected={selectedSegment}
          onSelect={onSelectSegment}
        />
        {marks.map((mark) => (
          <span key={mark.label} className={styles.mark} style={{ left: pct(mark.atMs) }} aria-hidden="true">
            <span className={styles.markLabel}>{mark.label}</span>
          </span>
        ))}
        {variant.voiceDrift && (
          <span
            className={styles.overhang}
            style={{
              left: pct(variant.voiceDrift.fromMs),
              width: pct(variant.voiceDrift.toMs - variant.voiceDrift.fromMs),
            }}
            aria-hidden="true"
          />
        )}
        {Array.from({ length: TICKS + 1 }, (_, i) => (
          <span key={i} className={styles.tick} style={{ left: `${(i / TICKS) * 100}%` }}>
            {copy.head.duration((durationMs * i) / TICKS)}
          </span>
        ))}
      </div>

      {unaligned.length > 0 && (
        <p className={styles.flagCaveat}>
          {unaligned.length} segment{unaligned.length > 1 ? 's' : ''} cannot say which part of the
          source produced {unaligned.length > 1 ? 'them' : 'it'}.
        </p>
      )}

      <svg className={styles.waveform} viewBox={`0 0 ${wave.length} 20`} preserveAspectRatio="none" role="img" aria-label={copy.audio.proxy}>
        {wave.map((height, i) => (
          <rect
            key={i}
            className={styles.waveBar}
            x={i + 0.15}
            y={10 - (height * 20) / 2}
            width={0.7}
            height={height * 20}
          />
        ))}
      </svg>
      <p className={styles.audioNote}>
        <strong>{copy.audio.heading}. </strong>
        {copy.audio.body} {copy.audio.proxy}
      </p>
    </div>
  );
}
