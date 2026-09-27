# Third-party notices

PRD section 0, rule 3: code from MIT / Apache-2.0 repositories may be adapted
with attribution here. Code from AGPL, Elastic Licence or unlicensed
repositories may be **studied for patterns only** and never copied.

## Dependencies

| Package | Licence | Used for |
| --- | --- | --- |
| [`@anthropic-ai/sdk`](https://github.com/anthropics/anthropic-sdk-typescript) | MIT | The Messages API client behind `AnthropicProvider`. |
| [`better-sqlite3`](https://github.com/WiseLibs/better-sqlite3) | MIT | The store. |
| [`next`](https://github.com/vercel/next.js), [`react`](https://github.com/facebook/react) | MIT | The app. |
| [`playwright`](https://github.com/microsoft/playwright) | Apache-2.0 | The headless browser behind the page checks and the visual QA loop. |
| [`pptxgenjs`](https://github.com/gitbrent/PptxGenJS) | MIT | Writing the editable PowerPoint export. |
| [`motion`](https://github.com/motiondivision/motion), via `@cloud-march/motion` | MIT | Every animation in the workbench. |

### In the site template (`templates/landing`)

These are installed into the template, not into the package, and they ship
inside every site the agent builds.

| Package | Licence | Used for |
| --- | --- | --- |
| [`astro`](https://github.com/withastro/astro) | MIT | The static site generator. |
| [`tailwindcss`](https://github.com/tailwindlabs/tailwindcss) | MIT | The styling layer. |
| [`astro-icon`](https://github.com/natemoo-re/astro-icon) + [`@iconify-json/ph`](https://github.com/iconify/icon-sets) | MIT | Phosphor icons, inlined at build time. |
| [Fontsource](https://github.com/fontsource/font-files) variable fonts | Per font, all open | Space Grotesk, Archivo, Outfit, Instrument Sans, Bricolage Grotesque (OFL); EB Garamond (OFL). Self-hosted so a built site has no font CDN dependency. |

`@e2b/code-interpreter` (MIT) is referenced by `sandbox-e2b.ts` through a dynamic
import but is **not** installed; the owner has not authorised an E2B account.
`wrangler` (MIT/Apache-2.0) is invoked through `npx` by the Cloudflare deploy
provider and is likewise not a dependency. Tavily, Resend and Stripe are reached
over HTTP with `fetch` and have no SDK here.

## Repositories studied

None of the code below is present in this package. Each was read to understand
how it solves a problem, and what was taken is an idea, named here.

| Repository | Licence | Reusable? | What was taken |
| --- | --- | --- | --- |
| [kortix-ai/suna](https://github.com/kortix-ai/suna) | **Elastic Licence 2.0** | **No** | Structure only: a tool registry as pure data mapping tool name to label and category, with prefix-based fallback so a new tool in an existing family needs no registry change. `src/core/agent/tool-labels.ts` implements that idea from scratch. The PRD (section 6.1) records this repo as Apache-2.0; it is not, and the licence rule therefore forbids reuse - see `DECISIONS.md` D3. |
| [FoundationAgents/OpenManus](https://github.com/FoundationAgents/OpenManus) | MIT | Yes | The think/act split with a step ceiling and a terminating condition. Our loop reaches the same shape without sharing code: `stop_reason` drives termination rather than a special `terminate` tool, because a tool the model must remember to call is a tool it can forget. |
| [e2b-dev/fragments](https://github.com/e2b-dev/fragments) | Apache-2.0 | Yes | How a sandbox is created per task, used, and disposed in a `finally`. Reflected in `SandboxProvider` and in the loop's teardown. |
| [langchain-ai/open_deep_research](https://github.com/langchain-ai/open_deep_research) | MIT | Yes | The supervisor and parallel-researcher shape, and one specific lesson from its compression prompt: most of that prompt exists to stop a compressor losing sources. We avoided the problem instead of re-solving it - compression here is the researcher's own final message, and citation numbers are assigned by our `SourceRegistry` rather than by any model. |
| [assafelovic/gpt-researcher](https://github.com/assafelovic/gpt-researcher) | Apache-2.0 | Yes | The planner / executors / publisher split, which is the same three stages as `research/agent.ts`. Its retriever abstraction informed keeping search behind `SearchProvider` rather than in the researcher's tools. |
| [icip-cas/PPTAgent](https://github.com/icip-cas/PPTAgent) | MIT | Yes | **PPTEval**: scoring a deck on Content, Design and Coherence rather than on content alone. The mechanical part of each dimension became assertions in `slides/deck.ts` and in the slides eval suite; the rest is left to a rubric and a person, which is what the paper argues for. |
| [presenton/presenton](https://github.com/presenton/presenton) | Apache-2.0 | Yes | Confirmed the HTML-template-to-export approach the PRD names. We took the shape and not the implementation: a deck here is a structured model with two renderers, because PPTX built from HTML is not editable in the way section 6.5 requires. The PRD flags this repo's licence as needing a check; it is Apache-2.0. |
| [gitroomhq/postiz-app](https://github.com/gitroomhq/postiz-app) | **AGPL-3.0** | **No** | Nothing. PRD section 6.7 flagged it as "likely copyleft" and it is: AGPL-3.0 in both the `LICENSE` file and `package.json`. `growth/postiz.ts` talks to a running instance over its public HTTP API, which is what section 6.7 directs. No code, and no structural reference either. |
| [stackblitz-labs/bolt.diy](https://github.com/stackblitz-labs/bolt.diy) | MIT | Yes | Read before the web builder. Its lesson was mostly a negative one: bolt.diy streams an XML action protocol in the assistant's text and tells the model never to emit a diff, because a half-parsed diff in a text stream is unrecoverable. Native tool calls remove that constraint, so `file_edit` does exact-string replacement and the whole-file rewrite is the fallback rather than the rule. |
| [dyad-sh/dyad](https://github.com/dyad-sh/dyad) | Apache-2.0 outside `src/pro/` | Yes, outside `src/pro/` | The `scaffold/AI_RULES.md` pattern: the template carries its own rules file, and the agent is told to read it before touching anything. `templates/landing/AI_RULES.md` is that idea. It means template changes and agent-prompt changes are the same change, and neither one can drift from the other. |

The clones live in `references/` at the repository root and are git-ignored.

## Design skills

The template's visual direction, and the rules `src/guard.ts` enforces at build
time, came from `.claude/skills/taste-skill`, which is vendored in this
repository from [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill)
(MIT). The palette, the type pairing and the accessibility checklist came from
`.claude/skills/ui-ux-pro-max`; the motion decisions from
`.claude/skills/design-motion-principles`.
