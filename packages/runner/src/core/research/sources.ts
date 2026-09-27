/**
 * The source registry.
 *
 * Citation numbering belongs to us, not to the model. Every URL a search
 * returns or a researcher opens is registered here and gets a stable number,
 * and that number is what the researchers are told to cite and what the
 * synthesiser is handed.
 *
 * The alternative - letting each researcher invent its own numbering and asking
 * the synthesiser to reconcile them - is how `[3]` ends up pointing at a
 * different page in each half of a report, which is worse than no citation
 * because it looks checked.
 */

import type { SearchResult } from '../providers/interfaces.ts';

export interface Source {
  n: number;
  title: string;
  url: string;
  /** True once a researcher opened the page rather than only seeing a snippet. */
  read: boolean;
}

export class SourceRegistry {
  private readonly byUrl = new Map<string, Source>();

  /** Registers if new, and returns the existing entry if not. Numbering is stable. */
  add(result: { title: string; url: string }): Source {
    const key = normalise(result.url);
    const existing = this.byUrl.get(key);
    if (existing) return existing;

    const source: Source = {
      n: this.byUrl.size + 1,
      title: result.title.trim() || result.url,
      url: result.url,
      read: false,
    };
    this.byUrl.set(key, source);
    return source;
  }

  addMany(results: SearchResult[]): Source[] {
    return results.map((r) => this.add(r));
  }

  markRead(url: string): Source | undefined {
    const source = this.byUrl.get(normalise(url));
    if (source) source.read = true;
    return source;
  }

  get(url: string): Source | undefined {
    return this.byUrl.get(normalise(url));
  }

  all(): Source[] {
    return [...this.byUrl.values()].sort((a, b) => a.n - b.n);
  }

  /** How the list is shown to a model: the number first, because that is what it cites. */
  format(onlyCited?: Set<number>): string {
    return this.all()
      .filter((s) => !onlyCited || onlyCited.has(s.n))
      .map((s) => `[${s.n}] ${s.title} - ${s.url}`)
      .join('\n');
  }

  /** The numbers actually cited in a piece of text, so the report's list can be trimmed. */
  static cited(text: string): Set<number> {
    const found = new Set<number>();
    for (const match of text.matchAll(/\[(\d{1,3})\]/g)) found.add(Number(match[1]));
    return found;
  }
}

/**
 * Two URLs that differ only in tracking parameters or a trailing slash are one
 * source, and numbering them twice makes a report look better researched than
 * it is.
 */
function normalise(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    for (const key of [...parsed.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_|ref$)/i.test(key)) parsed.searchParams.delete(key);
    }
    return parsed.toString().replace(/\/$/, '').toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}
