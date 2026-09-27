/**
 * Where a page's photographs come from.
 *
 * PRD section 7 lists "image-generation API behind `ImageProvider`", and this
 * is that seam. What is behind it in Phase 1 is Picsum, and the difference
 * between the two is the single biggest quality gap in a generated site.
 *
 * Picsum returns a **real photograph chosen at random** by a seed string. It is
 * a real image, at the right aspect ratio, that loads - which is what keeps the
 * layout honest and the visual checks meaningful. It is not a photograph of
 * this business, of this trade, or of anything related to either. A hedgelaying
 * page gets a flat lay of sunglasses and a wristwatch.
 *
 * That is fine for a draft and not fine for a page a customer sees, so every
 * surface that shows a generated site says so: the template's AI_RULES tells
 * the builder to hand the site over with that caveat, and the preview repeats
 * it under the page. The fix is a generation provider here, and nothing above
 * this file has to change when one arrives.
 */

export interface GeneratedImage {
  src: string;
  width: number;
  height: number;
  /** True when the image is a stand-in rather than a picture of the subject. */
  is_placeholder: boolean;
}

export interface ImageProvider {
  readonly name: string;
  /**
   * @param subject  what the picture should be of, in words
   * @param seed     stable per slot, so the same slot keeps the same image
   */
  find(subject: string, seed: string, width: number, height: number): Promise<GeneratedImage>;
}

export class PicsumProvider implements ImageProvider {
  readonly name = 'picsum';

  async find(_subject: string, seed: string, width: number, height: number) {
    // `subject` is deliberately unused, and that is the whole limitation: the
    // seed picks a photo, the subject has no influence on which.
    return {
      src: `https://picsum.photos/seed/${encodeURIComponent(slug(seed))}/${width}/${height}`,
      width,
      height,
      is_placeholder: true,
    };
  }
}

export function imageProvider(): ImageProvider {
  const choice = process.env.IMAGE_PROVIDER ?? 'picsum';
  if (choice === 'picsum') return new PicsumProvider();
  throw new Error(
    `unknown IMAGE_PROVIDER: ${choice}. Only "picsum" exists; a generation provider is the ` +
      'next thing to add here.',
  );
}

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'image';
