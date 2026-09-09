# coding
### A run that goes for forty minutes, and staying in control of it

**Covers:** Coding Agents · long-running agent supervision · visible plans and mid-run steering ·
checkpoints · streaming · non-deterministic output · latency as a design material

**Build order:** #1 of 6 — start here. You are the user.
**Time:** ~1.5 weeks.

> **Reframed.** An earlier version framed this as an API playground and latency waterfall. That's
> the inference-stack and docs surface, not Coding Agents. Sarvam's Coding Agents is described as
> long-running runs where the plan stays visible so you can change direction mid-run, with
> checkpoints as it goes. That's Taskgraph + Commit Boundary + steering, which is a better fit for
> the grammar, and the latency waterfall survives as a component inside it.

---

## The trade-off

An agent works for forty minutes and touches sixty files. Watching every step defeats the purpose.
Not watching means arriving at a wall of changes you can either accept wholesale or throw away.

**The design problem is steering: changing direction while the work is in flight, without losing
what's already good.** Stop-and-restart is not steering. Reviewing at the end is not steering.

This is the one surface where you are your own user, which is why it goes first — no recruiting, no
field research, real output on screen the same day. It's also the surface where you have the most
prior intuition, so trust it and then check it against three other developers.

---

## The user

You, and three developers you can watch work. Be specific about which kind:

**The one who reads every diff.** Slow, safe, and frustrated by agents. Wants checkpoints.
**The one who accepts everything and reverts later.** Fast, occasionally catastrophic. Wants a good
undo more than a good review.
**The one who stopped using coding agents** after a bad experience. The most informative
conversation you'll have — find out exactly which moment broke their trust.

Constraints worth recording:
- Attention is bursty. They start a run, switch to something else, and come back. The interface has
  to be readable cold, forty minutes later, with no memory of what was happening.
- The cost of a wrong direction compounds. Twenty files edited on a wrong assumption is much worse
  than two, so the value of early intervention is nonlinear — which is an argument for making the
  plan legible early, not for making the diff good late.
- They don't want to read the reasoning. They want to know *where it is* and *whether to worry*.

---

## Scope

Three surfaces.

1. **The plan view.** What the agent intends, updated as it learns, at a glance. Answers "is this
   going the right way?" without reading a transcript.
2. **Mid-run steering.** Redirect, narrow, or veto a step while the run continues. The hard part is
   doing it without discarding completed work.
3. **Checkpoints and review.** Named, semantic, restorable boundaries. Accept up to boundary three,
   reject four.

The **latency waterfall** lives inside this as the run's time decomposition — how much went to
model time, tool time, waiting. It keeps its own pattern; it just isn't the whole project.

Out of scope: an editor, actual code execution beyond a sandbox, git integration beyond diffs.

---

## The state list

**Run states**
- `PLANNING`, `RUNNING`, `SUCCEEDED`, `FAILED`, `CANCELLED`
- `PLAN_REVISED` — it changed its own plan mid-run. Needs surfacing: a silent plan change is the
  moment trust dies.
- `AWAITING_STEERING` — paused, asking for direction
- `STEERING_APPLIED` — redirected, with what was kept and what was dropped made explicit
- `STALLED` — running with no progress. Looks healthy everywhere. Isn't.
- `DIVERGED` — the work no longer matches the stated plan. Distinct from failure and much more
  dangerous, because everything still looks like it's working.

**Step states**
- `QUEUED`, `RUNNING`, `DONE`, `SKIPPED`, `FAILED`, `RETRYING`
- `BLOCKED_ON_PERMISSION` — wants to run a command or touch a file outside its scope
- `SPECULATIVE` — done on an assumption not yet confirmed. Should be visually provisional, because
  it's the work most likely to be thrown away.

**Change states**
- `PROPOSED`, `APPLIED`, `REVERTED`
- `APPLIED_UNREVIEWED` — landed under the envelope without him looking
- `CONFLICTS_WITH_MANUAL_EDIT` — he edited a file the agent was working on. Guaranteed to happen
  and almost never designed for.

**Checkpoint states**
- `CHECKPOINT_CLEAN`, `CHECKPOINT_PARTIAL`, `CHECKPOINT_RESTORED`

---

## Patterns this project must earn

| Pattern | Where |
|---|---|
| Taskgraph | The plan view. Simpler than `work`'s, which is why you build it here first. |
| Commit Boundary | Checkpoints — semantic, named, diffable against the previous |
| Latency Waterfall | Run time decomposition; TTFT separate from total |
| Delegation Envelope | What may it touch, what needs asking |
| Non-finding | "Looked at these twelve files, none needed changing" |
| Repair Loop | Steering: redirect without discarding what worked |
| Behaviour Spec | Standing run instructions |
| Confidence Without Numbers | `SPECULATIVE` work marked as provisional |

Eight of seventeen, most of them in their simplest form — which is exactly why this is project #1.
You establish the tokens, the runtime, the streaming plumbing and half the patterns here, on the
easiest user in the program.

---

## Design direction

Developer tools have a strong existing grammar and you should mostly respect it. The monospace, the
diff colours, the collapsible sections — fighting those wastes learned knowledge for no gain.
Restraint is the right posture for most of this screen.

Spend the boldness budget on **the plan view**, and make it good enough to be the thing someone
remembers.

- **Readable cold.** The core constraint. Forty minutes later, no memory of context: where is it,
  is it going well, do I need to act. If that takes reading, you've failed.
- **Plan revisions are events, not silent updates.** When the agent changes its own plan, that's
  the highest-information moment in the run and most tools render it as a diff nobody sees.
- **`SPECULATIVE` work looks provisional.** Not a colour — a genuinely lighter, less committed
  treatment, because this is the work most likely to be discarded.
- **Collapse success aggressively.** Success is not information. Twelve completed steps should be
  one line.
- **Time at real scale** in the waterfall. A compressed axis on a latency chart is a lie about the
  exact thing it measures. TTFT separate from total.
- **No continuous motion.** A running agent will tempt you into perpetual shimmer. Motion marks
  change; in a live run everything is always changing, so shimmer communicates nothing.

---

## The hard moments

1. **Steering without loss.** She says "actually, use the other library" at minute twelve. Eighteen
   files are already edited. What's kept, what's discarded, and how is that decision shown *before*
   she commits to it? This is the project.
2. **`DIVERGED`.** The work no longer matches the plan and nothing has failed. Everything looks
   fine. Surface it.
3. **`CONFLICTS_WITH_MANUAL_EDIT`.** She edited a file mid-run. This will happen constantly and
   almost no tool designs for it.
4. **Naming checkpoints semantically.** "Extracted the auth middleware," not "12:04pm." Getting the
   agent to produce human-meaningful boundary names is half design, half prompt.
5. **The forty-minute return.** Design the moment she comes back. It's the most common entry point
   into this interface and usually the least designed.

---

## What you'll learn building this

- SSE and streaming, the Vercel AI SDK, and how to render a live event stream into a stable
  structure without jitter. The core technical skill of this whole category.
- Real API latency numbers, which you then hardcode into `grammar/agent-runtime.ts` and reuse for
  all five remaining projects. Measure once here, benefit everywhere.
- React Flow at low complexity, before `work` needs it at high complexity.
- Diffing and semantic checkpointing, which recurs in `content` (regenerating one variant) and
  `voice` (editing a spec without regressing clusters). One problem, three costumes.

---

## Measurement targets

- **Time to orient on return.** Stopwatch, from opening a forty-minute-old run to correctly stating
  where it is. Headline number for this project.
- **Steering success rate.** Given a run heading the wrong way, do they redirect it without
  discarding good work? Before and after your steering UI exists.
- **Divergence catch rate.** Seed a run that drifts from its plan. Do they notice?
- **Appropriate distrust.** Seed a confidently wrong `SPECULATIVE` change inside an otherwise good
  run. Does the provisional treatment do its job?
