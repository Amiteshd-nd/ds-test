# Manifests

Agents are declared, not coded. That is what makes them configurable teammates instead of
six hand-rolled classes, and it is what lets a non-engineer read one.

---

## Skill manifest

```yaml
id: people.search
version: 1
name: Find people
description: >
  Searches for people by name, role, team, or what they work on, and returns each match
  with a one-line summary and an entity ref. Use this when the question asks who someone
  is, who owns or maintains something, or who to ask about a topic. Do not use it to read
  a specific document or to check a project's status — docs.search and projects.status
  cover those, and this returns people rather than the thing they own.
owner: platform-team

input_schema:
  type: object
  required: [query]
  properties:
    query:
      type: string
      description: The person, role, team, or topic to search for, in the user's own words.
      maxLength: 300
      x_fill_from_question: true    # a deterministic selector may fill this one verbatim
output_schema:
  type: object
  properties:
    people: { type: array, items: { type: object, properties: { ref: { type: string } } } }

side_effect: none                   # none | write | irreversible | external
requires_entitlements: ["people.read"]
rate_limit: { per_principal_per_day: 200 }
idempotency: { key_fields: [recipient_ref, body], window_minutes: 10 }
timeout_ms: 2000
retry: { attempts: 2, on: [timeout] }

binding: { kind: native }           # openapi | mcp | native
```

**The description is not documentation.** It is the only thing the model reads when
deciding whether to call this. Bad descriptions are the single largest source of wrong
tool calls, so the registry lints three things and refuses to load otherwise:

- at least twenty words,
- it says **when to use** the skill,
- it says **when not to** — usually by naming the skill that covers the adjacent case.

Two more controls stop the registry becoming four hundred near-duplicates in eighteen
months: an embedding-similarity check at load (warn above 0.88, fail above 0.94) and a
CODEOWNERS rule requiring human review on the manifest directory.

## Agent manifest

```yaml
id: atlas-guide
version: 1
name: Atlas Guide
description: Answers questions about people, projects, decisions, and documents.
owner: platform-team

surfaces: [chat, background]
visibility: { entitlements: ["docs.read", "people.read", "projects.read"] }

model_policy:
  default: reasoning.balanced       # a capability class, never a vendor
  steps: { plan: fast.cheap, compose: reasoning.balanced }
  max_cost_usd_per_run: 0.15
  max_latency_ms_p95: 6000

prompt: atlas-guide@1               # id@version, resolved from prompts/

skills:                             # the allow-list. Anything absent is uncallable.
  - people.search
  - projects.status

grounding:
  sources: [doc, project, person, decision]
  graph: { enabled: true, seed: [principal.self], edge_types: [OWNS, MENTIONS], depth: 2 }
  max_context_tokens: 6000

memory:
  session: { turns: 12, semantic_recall: true }
  profile: { read: [tone, team, focus], write: [focus] }

hitl:
  gates:
    - on: skill.side_effect != "none"
      mode: require_approval
    - on: cost_projection > 0.10
      mode: notify

output: { formats: [text, entity_card, skill_call, choice] }
evals: { golden_set: evals/golden/atlas-guide/, min_pass_rate: 0.90 }
```

**Validate at load, and fail the build:**

1. Every skill exists in the registry, and every entitlement its skills require appears in
   this agent's `visibility.entitlements`. (Get the direction right: if you can see the
   agent, you can use all of it. The reverse permits an agent that denies half its own
   advertised capability.)
2. Every declared surface is supported by the declared output formats — an `inline` agent
   without `diff_proposal` cannot function on the surface it claims.
3. The prompt resolves to a versioned file that exists.
4. **Any side-effecting skill has a matching approval gate.** This one is not a
   configuration mistake; it is the thing the entire human-in-the-loop section exists to
   make impossible.

## Prompts

```
prompts/
  _shared/           safety.j2 · untrusted.j2 · citations.j2 · output_format.j2
  atlas-guide/v1/    system.j2 · meta.yaml
```

- **Jinja2 with a declared variable contract.** Rendering with an undefined variable
  raises; it never silently emits an empty string.
- **Shared fragments are included, not copied.** One edit to the safety rules propagates
  to every agent. That is the whole reason for a central prompt store.
- **Versioned and ramped.** An agent pins `id@version`; rollout is a percentage in config,
  bucketed stably per principal, so a bad prompt never reaches everyone at once and one
  user never flips versions mid-conversation.
- **No prompt strings in code.** A CI grep fails on any string literal over 200 characters
  inside the core.
