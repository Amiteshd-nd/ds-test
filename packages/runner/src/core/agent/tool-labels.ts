/**
 * Tool names to labels, for the UI.
 *
 * Its own module with no imports, deliberately. The step cards need to turn
 * `site_build` into "Build the page", and importing that from `tools.ts` drags
 * the whole tool registry into the browser bundle - which reaches the web
 * builder, which reaches Playwright, which does not compile for a browser. A
 * client component should not be able to pull the server in by asking for a
 * string.
 *
 * The prefix fallback means a tool added to an existing family in a later phase
 * (`browser_navigate`, `search_web`) is categorised correctly without this file
 * changing. Pattern studied from kortix-ai/suna, reimplemented; see
 * THIRD_PARTY_NOTICES.md.
 */

export type ToolCategory =
  | 'shell'
  | 'files'
  | 'edit'
  | 'web'
  | 'search'
  | 'ask'
  | 'site'
  | 'deploy'
  | 'memory'
  | 'research'
  | 'slides'
  | 'growth';

const LABELS: Record<string, { label: string; category: ToolCategory }> = {
  shell_exec: { label: 'Run command', category: 'shell' },
  file_read: { label: 'Read file', category: 'files' },
  file_list: { label: 'List files', category: 'files' },
  file_write: { label: 'Write file', category: 'edit' },
  file_edit: { label: 'Edit file', category: 'edit' },
  ask_user: { label: 'Ask the owner', category: 'ask' },
  site_create: { label: 'Build the site', category: 'site' },
  site_build: { label: 'Build the page', category: 'site' },
  site_check: { label: 'Check the page', category: 'site' },
  site_deploy: { label: 'Publish the site', category: 'deploy' },
  memory_remember: { label: 'Remember a fact', category: 'memory' },
  research_run: { label: 'Research', category: 'research' },
  search_web: { label: 'Search', category: 'research' },
  read_page: { label: 'Read a page', category: 'research' },
  slides_create: { label: 'Build a deck', category: 'slides' },
  slides_build: { label: 'Build the deck', category: 'slides' },
  growth_draft: { label: 'Draft content', category: 'growth' },
  growth_queue: { label: 'Queue for approval', category: 'growth' },
};

const BY_PREFIX: Record<string, ToolCategory> = {
  shell: 'shell',
  file: 'edit',
  browser: 'web',
  search: 'search',
  deploy: 'deploy',
  site: 'site',
  image: 'web',
  ask: 'ask',
  memory: 'memory',
  research: 'research',
  slides: 'slides',
  growth: 'growth',
};

export function describeTool(name: string): { label: string; category: ToolCategory } {
  const known = LABELS[name];
  if (known) return known;

  return {
    label: name.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()),
    category: BY_PREFIX[name.split('_')[0]] ?? 'shell',
  };
}

/** Every tool the UI knows a label for. Used by the test that keeps the two in step. */
export const LABELLED_TOOLS = Object.keys(LABELS);
