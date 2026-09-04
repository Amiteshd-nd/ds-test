/**
 * On-device obstruction classification.
 *
 * The photo never has to leave the phone to be classified — that is a privacy
 * decision before it is a latency one (PRD §5). TF.js runs a MobileNetV3
 * fine-tune from `public/models/obstruction/`.
 *
 * There is no model in the repo, and there cannot be one until Phase 0 has
 * produced labelled photographs. So this module reports `unavailable` with a
 * confidence of exactly zero rather than inventing a number, and the capture
 * sheet falls back to a chip row. See MANUAL.md → "Train the classifier".
 */
import type { Classification, ObstructionType } from './types';
import { OBSTRUCTION_ORDER } from './types';

const MODEL_DIR = `${import.meta.env.BASE_URL}models/obstruction`;

interface ModelCard {
  labels: string[];
  input_size: number;
  /** How the training pipeline scaled pixels. Guessing this silently ruins top-1. */
  normalise: '0-1' | '-1-1';
  trained_on?: string;
  top1_holdout?: number;
}

export interface Classifier {
  available: boolean;
  card: ModelCard | null;
  classify(source: ImageBitmap | HTMLCanvasElement): Promise<Classification>;
  dispose(): void;
}

const UNAVAILABLE: Classifier = {
  available: false,
  card: null,
  async classify() {
    return { type: 'tanker', conf: 0, by: 'unavailable' };
  },
  dispose() {},
};

/**
 * Resolve the classifier once at startup. A missing model is the expected state
 * before Phase 0, not an error — so this never throws and never blocks capture.
 */
export async function loadClassifier(): Promise<Classifier> {
  let card: ModelCard;
  try {
    const res = await fetch(`${MODEL_DIR}/model-card.json`, { cache: 'no-store' });
    if (!res.ok) return UNAVAILABLE;
    card = (await res.json()) as ModelCard;
  } catch {
    return UNAVAILABLE;
  }

  try {
    // Only pulled when a model is actually present — Vite keeps TF.js in its own
    // chunk, so a phone with no model never downloads it.
    const [tf] = await Promise.all([
      import('@tensorflow/tfjs-core'),
      import('@tensorflow/tfjs-backend-webgl'),
    ]);
    const { loadGraphModel } = await import('@tensorflow/tfjs-converter');

    await tf.setBackend('webgl').catch(() => tf.setBackend('cpu'));
    await tf.ready();

    const model = await loadGraphModel(`${MODEL_DIR}/model.json`);
    const size = card.input_size ?? 224;

    return {
      available: true,
      card,
      async classify(source) {
        // Functional ops throughout: tfjs-core alone does not register the
        // chained `.div()` / `.toFloat()` helpers that `@tensorflow/tfjs` adds.
        const scores = tf.tidy(() => {
          const raw = tf.browser.fromPixels(source as HTMLCanvasElement);
          const resized = tf.image.resizeBilinear(tf.cast(raw, 'float32'), [size, size]);
          const scaled =
            card.normalise === '-1-1'
              ? tf.sub(tf.div(resized, 127.5), 1)
              : tf.div(resized, 255);
          const out = model.predict(tf.expandDims(scaled, 0)) as { dataSync(): Float32Array };
          return Array.from(out.dataSync());
        });

        const dist: Record<string, number> = {};
        card.labels.forEach((label, i) => (dist[label] = scores[i] ?? 0));

        let best = 0;
        for (let i = 1; i < scores.length; i++) if (scores[i] > scores[best]) best = i;

        return {
          type: normaliseLabel(card.labels[best]),
          conf: Math.round((scores[best] ?? 0) * 1000) / 1000,
          by: 'model',
          scores: dist,
        };
      },
      dispose() {
        model.dispose();
      },
    };
  } catch (err) {
    console.warn('[gully] obstruction model present but failed to load', err);
    return UNAVAILABLE;
  }
}

function normaliseLabel(label: string): ObstructionType {
  const l = (label ?? '').toLowerCase().trim();
  const hit = OBSTRUCTION_ORDER.find((t) => t === l);
  return hit ?? 'other';
}
