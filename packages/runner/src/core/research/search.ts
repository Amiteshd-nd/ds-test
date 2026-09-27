/**
 * Web search, behind an interface (PRD section 6.4).
 *
 * This is the one external service with no useful local stand-in. A sandbox can
 * be a directory and a model can be a script, but "search the web" offline is
 * either a lie or a fixture, and pretending otherwise would make the research
 * suite report a pass for work it never did.
 *
 * So there are two implementations and they are honest about which they are.
 * Tavily is the real one and has never run - no account has been authorised
 * (PRD rule 7). Fixtures replay recorded results for the queries the eval suite
 * asks, and return nothing for anything else, which is what makes a fixture run
 * distinguishable from a real one instead of quietly plausible.
 */

import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

import type { SearchProvider, SearchResult } from '../providers/interfaces.ts';

/* ------------------------------------------------------------------ tavily */

interface TavilyResponse {
  results?: Array<{ title?: string; url?: string; content?: string }>;
  answer?: string;
}

export class TavilySearchProvider implements SearchProvider {
  readonly name = 'tavily';
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(query: string, limit = 6): Promise<SearchResult[]> {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: this.apiKey,
        query,
        max_results: limit,
        // The snippets are what the researcher reads first, and short ones send
        // it off to fetch the whole page for information that was already
        // there. Paying for longer snippets is cheaper than the extra fetches.
        search_depth: 'advanced',
        include_answer: false,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`Tavily returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }

    const body = (await response.json()) as TavilyResponse;
    return (body.results ?? [])
      .filter((r) => r.url && r.title)
      .map((r) => ({
        title: r.title!,
        url: r.url!,
        snippet: (r.content ?? '').slice(0, 1_200),
      }));
  }
}

/* ---------------------------------------------------------------- fixtures */

interface Fixture {
  /** Every one of these words must appear in the query for the fixture to match. */
  match: string[];
  results: SearchResult[];
}

/**
 * Recorded results, for running the research pipeline without an account.
 *
 * Matching is deliberately strict: every word in `match` has to be in the
 * query. A loose matcher would answer questions it has no results for, and a
 * researcher given the wrong sources writes a confident report about the wrong
 * thing. Returning nothing is a worse-looking result and a more honest one.
 */
export class FixtureSearchProvider implements SearchProvider {
  readonly name = 'fixtures';
  private fixtures: Fixture[] | null = null;
  private readonly dir: string;
  /** Queries that found nothing, so the runner can say what is missing. */
  readonly misses: string[] = [];

  constructor(dir = path.join(process.cwd(), 'evals', 'fixtures', 'search')) {
    this.dir = dir;
  }

  private async load(): Promise<Fixture[]> {
    if (this.fixtures) return this.fixtures;
    if (!existsSync(this.dir)) return (this.fixtures = []);

    const files = (await readdir(this.dir)).filter((f) => f.endsWith('.json'));
    const loaded: Fixture[] = [];
    for (const file of files) {
      loaded.push(...(JSON.parse(await readFile(path.join(this.dir, file), 'utf8')) as Fixture[]));
    }
    return (this.fixtures = loaded);
  }

  async search(query: string, limit = 6): Promise<SearchResult[]> {
    const fixtures = await this.load();
    const haystack = query.toLowerCase();

    const matched = fixtures.filter((f) => f.match.every((word) => haystack.includes(word.toLowerCase())));
    if (matched.length === 0) {
      this.misses.push(query);
      return [];
    }

    return matched.flatMap((f) => f.results).slice(0, limit);
  }
}

export function searchProvider(): SearchProvider {
  const choice = process.env.SEARCH_PROVIDER ?? (process.env.TAVILY_API_KEY ? 'tavily' : 'fixtures');

  if (choice === 'tavily') {
    const key = process.env.TAVILY_API_KEY;
    if (!key) throw new Error('SEARCH_PROVIDER=tavily requires TAVILY_API_KEY');
    return new TavilySearchProvider(key);
  }

  if (choice === 'fixtures') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'the fixture search provider replays recorded results and must not run in production; ' +
          'set TAVILY_API_KEY',
      );
    }
    return new FixtureSearchProvider();
  }

  throw new Error(`unknown SEARCH_PROVIDER: ${choice}`);
}
