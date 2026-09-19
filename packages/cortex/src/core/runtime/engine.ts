// The run engine. Creates runs, executes them, and — the part that matters — resumes
// them. PRD §6.3 and §9.3.
//
// A run is durable from the moment it is created. The process can die between any two
// nodes; on the next start, `recover()` picks up every run that was mid-flight and
// re-enters the graph at the node after the last one that completed. An
// `awaiting_approval` run is the same mechanism with a longer pause.

import crypto from 'node:crypto';
import type { HostAdapters } from '../adapters/index.ts';
import type { Principal, Run, RunEvent, Surface, Trigger } from '../adapters/types.ts';
import type { CortexConfig } from '../config/config.ts';
import type { AgentRegistry, AgentManifest } from '../agents/registry.ts';
import type { SkillRegistry } from '../skills/registry.ts';
import { GroundingPipeline } from '../grounding/pipeline.ts';
import { MemoryService } from '../memory/service.ts';
import { PromptStore } from '../prompts/store.ts';
import { Router } from '../router/router.ts';
import { SkillInvoker } from '../skills/invoker.ts';
import { EmbeddingSelector, ModelSelector } from '../skills/selector.ts';
import { buildChatWorkflow, initialChatState } from '../orchestrator/workflow.ts';
import type { ChatState } from '../orchestrator/workflow.ts';
import { buildInlineWorkflow, initialInlineState } from '../orchestrator/inline.ts';
import type { InlineState } from '../orchestrator/inline.ts';
import { assertDailyBudget } from '../guardrails/limits.ts';
import { describeIssues, validateAgainstSchema } from '../skills/schema.ts';
import { CortexError, asCortexError } from '../errors.ts';
import type { StateGraph } from '../orchestrator/graph.ts';
import { RunStore } from './store.ts';
import type { TraceExporter } from '../telemetry/exporter.ts';

export interface EngineDeps {
  config: CortexConfig;
  adapters: HostAdapters;
  agents: AgentRegistry;
  skills: SkillRegistry;
  store: RunStore;
  router: Router;
  prompts: PromptStore;
  hostName: string;
  /** Addendum C1. Absent in tests that do not care about spans. */
  exporter?: TraceExporter;
}

export interface StartRequest {
  agentId: string;
  principal: Principal;
  surface: Surface;
  threadId: string | null;
  text: string;
  context?: Record<string, unknown>;
  /** Set when this run was delegated by a supervisor. §9.1 Mode B. */
  parentRunId?: string;
}

export class Engine {
  readonly deps: EngineDeps;
  #running = new Map<string, AbortController>();

  constructor(deps: EngineDeps) {
    this.deps = deps;
  }

  newThreadId(principal: Principal): string {
    // `<principalId>:<uuid>` — memory scoping reads the principal back out of it, and a
    // thread that cannot name its owner is a cross-principal leak waiting to happen.
    return `${principal.id}:${crypto.randomUUID()}`;
  }

  /** Creates a durable run and starts it. Returns as soon as the run row exists. */
  async start(req: StartRequest): Promise<Run> {
    const { config, store, agents } = this.deps;
    const agent = agents.get(req.agentId);

    const entitlements = await this.deps.adapters.identity.entitlements(req.principal);
    if (!agent.visibility.entitlements.every((e) => entitlements.has(e))) {
      throw new CortexError('permission_denied', `${agent.name} is not available to you.`);
    }
    if (!agent.surfaces.includes(req.surface)) {
      throw new CortexError('invalid_arguments', `${agent.name} does not run on the ${req.surface} surface.`);
    }
    if (!config.features['surfaces.enabled'].includes(req.surface)) {
      throw new CortexError('invalid_arguments', `The ${req.surface} surface is switched off in cortex.config.yaml.`);
    }
    assertDailyBudget(store, req.principal.id, config.budgets.max_cost_usd_per_principal_per_day);

    // §9.1 — "Max depth 2. A sub-agent may not spawn sub-agents. Enforce in the runtime."
    // The load-time check catches a supervisor that names another supervisor; this
    // catches a chain assembled at runtime, which is the one that would otherwise only
    // show up as a bill.
    if (req.parentRunId) {
      const parent = store.getRun(req.parentRunId);
      if (!parent) throw new CortexError('not_found', `No parent run ${req.parentRunId}.`);
      if (parent.parentRunId) {
        throw new CortexError('invalid_arguments', 'Delegation is capped at one level: a sub-agent may not delegate again.');
      }
    }

    const trigger: Trigger = { surface: req.surface, detail: req.text, context: req.context };
    const now = new Date().toISOString();
    const run: Run = {
      id: `run_${crypto.randomUUID().slice(0, 12)}`,
      agentId: agent.id,
      agentVersion: agent.version,
      principalId: req.principal.id,
      surface: req.surface,
      threadId: req.threadId,
      status: 'queued',
      trigger,
      createdAt: now,
      updatedAt: now,
      costUsd: 0,
      tokensIn: 0,
      tokensOut: 0,
      parentRunId: req.parentRunId ?? null,
    };
    store.createRun(run);

    if (req.threadId) {
      await this.deps.adapters.memory.appendTurn(req.threadId, {
        id: `turn_${crypto.randomUUID().slice(0, 12)}`,
        threadId: req.threadId,
        role: 'user',
        text: req.text,
        at: now,
        runId: run.id,
      });
    }

    void this.#execute(run, agent, req.principal, entitlements, null);
    return run;
  }

  /**
   * §9.1 Mode B — run one sub-agent to completion and hand its answer back.
   *
   * The sub-agent run is a real `Run` with `parent_run_id` set: it has its own trace, its
   * own steps, its own budget from its own manifest, and its own skill allow-list. A
   * supervisor cannot lend it anything — the entitlement check at load guarantees the
   * supervisor was never visible to someone who lacks what the sub-agent needs, and the
   * invoker re-checks per call regardless.
   */
  async runSubAgent(parentRunId: string, agentId: string, principal: Principal, question: string): Promise<{ runId: string; answer: string; costUsd: number; status: string }> {
    const run = await this.start({ agentId, principal, surface: 'background', threadId: null, text: question, parentRunId });

    // Wait for the sub-run to reach a terminal state. It streams its own events under its
    // own run id, so a client watching the supervisor sees progress without the
    // sub-agent's tokens being spliced into the answer.
    for await (const { event } of this.deps.adapters.transport.subscribe(run.id, 0)) {
      if (event.type === 'run_completed' || event.type === 'run_failed') break;
    }

    const final = this.deps.store.getRun(run.id);
    const turns = this.deps.store.traces(run.id).find((t) => t.kind === 'subagent_answer')?.payload as { answer?: string } | undefined;
    return {
      runId: run.id,
      answer: turns?.answer ?? '',
      costUsd: final?.costUsd ?? 0,
      status: final?.status ?? 'failed',
    };
  }

  /** §9.3 — resume every run that was in flight when the process died. */
  async recover(): Promise<number> {
    const stranded = [...this.deps.store.listRuns('running'), ...this.deps.store.listRuns('queued')];
    for (const run of stranded) {
      const principal = await this.#principalFor(run.principalId);
      if (!principal) {
        this.deps.store.setStatus(run.id, 'failed');
        continue;
      }
      const agent = this.deps.agents.get(run.agentId);
      const entitlements = await this.deps.adapters.identity.entitlements(principal);
      const checkpoint = this.deps.store.readCheckpoint(run.id);
      void this.#execute(run, agent, principal, entitlements, checkpoint);
    }
    return stranded.length;
  }

  async cancel(runId: string): Promise<void> {
    this.#running.get(runId)?.abort();
    this.deps.store.setStatus(runId, 'cancelled');
    await this.deps.adapters.transport.emit(runId, { type: 'run_completed', runId, status: 'cancelled' });
  }

  /** §9.2 — three outcomes, and `approve_with_edits` is the one that matters. */
  async decide(
    runId: string,
    stepId: string,
    decision: 'approve' | 'approve_with_edits' | 'reject_with_reason',
    editedArgs?: Record<string, unknown>,
    reason?: string,
  ): Promise<void> {
    const run = this.deps.store.getRun(runId);
    if (!run) throw new CortexError('not_found', `no run ${runId}`);
    if (run.status !== 'awaiting_approval') throw new CortexError('invalid_arguments', `run ${runId} is ${run.status}, not awaiting approval`);

    // `approve_with_edits` is the outcome that matters (§9.2) — a draft the person
    // rewrote before it goes out. Edited arguments are validated here rather than at
    // execution time, so a typo comes back as a 400 the user can fix instead of a run
    // that fails somewhere they cannot see.
    if (decision === 'approve_with_edits') {
      const record = this.deps.store.approvalFor(stepId);
      if (!record) throw new CortexError('not_found', `No approval ${stepId} on this run.`);
      if (!editedArgs) throw new CortexError('invalid_arguments', 'approve_with_edits needs edited arguments.');
      const skill = this.deps.skills.get(record.action);
      const issues = validateAgainstSchema(editedArgs, skill.inputSchema);
      if (issues.length) {
        throw new CortexError('invalid_arguments', `Those edits do not fit ${skill.name}: ${describeIssues(issues)}`);
      }
    }

    this.deps.store.decideApproval(stepId, decision, editedArgs, reason ?? null);
    const principal = await this.#principalFor(run.principalId);
    if (!principal) throw new CortexError('internal', 'the principal for this run no longer resolves');
    const agent = this.deps.agents.get(run.agentId);
    const entitlements = await this.deps.adapters.identity.entitlements(principal);

    if (decision === 'reject_with_reason') {
      // The reason is fed back into the run and into memory (§9.2). A rejection nobody
      // learns from is a rejection the agent will earn again tomorrow.
      // §9.2 — the reason is fed back into the run and into memory. A rejection nobody
      // learns from is a rejection the agent earns again tomorrow.
      const record = this.deps.store.approvalFor(stepId);
      await this.deps.adapters.memory.upsertProfile(
        principal.id,
        { key: 'rejected_action', value: `${record?.action ?? stepId}: ${reason ?? 'no reason given'}`, type: 'fact' },
        `run ${runId}`,
      );
      this.deps.store.markApprovalExecuted(stepId);
      this.deps.store.setStatus(runId, 'cancelled');
      // Update the card the user is looking at. Without this it keeps reading "awaiting
      // approval" for something that will never happen, which is how a UI ends up
      // disagreeing with the system about what was done.
      if (record) {
        await this.deps.adapters.transport.emit(runId, {
          type: 'block',
          runId,
          block: { type: 'skill_call', skill: record.action, args: record.args, state: 'error' },
        });
      }
      await this.deps.adapters.transport.emit(runId, { type: 'run_completed', runId, status: 'cancelled' });
      return;
    }

    const checkpoint = this.deps.store.readCheckpoint(runId);
    void this.#execute(run, agent, principal, entitlements, checkpoint);
  }

  async #principalFor(principalId: string): Promise<Principal | null> {
    // The identity adapter resolves session tokens; a resumed run has no session, so
    // the host is asked to resolve the principal id itself. A host that cannot do this
    // cannot have durable background runs, which is worth discovering at `doctor` time.
    const withResolve = this.deps.adapters.identity as { resolvePrincipal?: (id: string) => Promise<Principal | null> };
    return withResolve.resolvePrincipal ? withResolve.resolvePrincipal(principalId) : null;
  }

  async #execute(
    run: Run,
    agent: AgentManifest,
    principal: Principal,
    entitlements: Set<string>,
    checkpoint: { node: string; state: unknown } | null,
  ): Promise<void> {
    const { store, config, adapters } = this.deps;
    const controller = new AbortController();
    this.#running.set(run.id, controller);

    const emit = async (event: RunEvent): Promise<void> => adapters.transport.emit(run.id, event);

    const startedAt = Date.now();
    this.deps.exporter?.begin(run.id, principal, agent.id, agent.version, run.surface);

    try {
      store.setStatus(run.id, 'running');
      if (!checkpoint) {
        await emit({ type: 'run_started', runId: run.id, agentId: agent.id, at: new Date().toISOString() });
      } else {
        await emit({ type: 'progress', runId: run.id, message: `Resuming at ${checkpoint.node}.` });
      }

      const routeCtx = { principal, runId: run.id, surface: run.surface, retryCount: 0, budgetRemainingUsd: agent.modelPolicy.maxCostUsdPerRun };
      const memoryService = new MemoryService(adapters.memory, adapters.policy);
      const workflowDeps = {
        config,
        agent,
        principal,
        entitlements,
        surface: run.surface,
        hostName: this.deps.hostName,
        grounding: new GroundingPipeline(adapters.retrieval, adapters.policy, config, adapters.graph),
        policy: adapters.policy,
        memory: memoryService,
        router: this.deps.router,
        prompts: this.deps.prompts,
        invoker: new SkillInvoker(adapters.skills, adapters.policy, store),
        selector: this.#selector(agent, routeCtx),
        skills: this.deps.skills.visibleTo(agent.skills, entitlements),
        // §9.1 Mode B, behind its flag. A supervisor with the flag off is just an agent
        // whose sub-agent list is never read.
        delegator: config.features['orchestration.dynamic'] && !run.parentRunId ? this : undefined,
        subAgents: config.features['orchestration.dynamic']
          ? agent.subAgents
              .map((id) => this.deps.agents.agents.get(id))
              .filter((sub): sub is AgentManifest => Boolean(sub))
              .map((sub) => ({ id: sub.id, name: sub.name, description: sub.description }))
          : [],
        store,
        emit,
        budgetRemainingUsd: () => Math.max(0, Math.min(agent.modelPolicy.maxCostUsdPerRun, config.budgets.max_cost_usd_per_run) - (store.getRun(run.id)?.costUsd ?? 0)),
      };

      const proposed = run.trigger.context?.proposeSkill
        ? {
            skillId: String(run.trigger.context.proposeSkill),
            args: (run.trigger.context.args ?? {}) as Record<string, unknown>,
          }
        : null;

      // §12 — "Surface differences are handled by the runtime, not by the agent author."
      // This is that sentence: one manifest, and the runtime picks the shape of the work
      // from the surface it was invoked on.
      const inline = run.surface === 'inline';
      const workflow = inline
        ? (buildInlineWorkflow(workflowDeps) as unknown as StateGraph<ChatState & InlineState>)
        : (buildChatWorkflow(workflowDeps) as unknown as StateGraph<ChatState & InlineState>);

      const state = checkpoint?.state
        ? (checkpoint.state as ChatState & InlineState)
        : inline
          ? (initialInlineState(run.trigger.detail, run.trigger.context ?? {}) as unknown as ChatState & InlineState)
          : (initialChatState(run.trigger.detail, await this.#history(run), proposed) as unknown as ChatState & InlineState);
      const startAt = checkpoint && checkpoint.node !== '__done' ? checkpoint.node : undefined;
      const outcome = await workflow.run(state, { runId: run.id, store, signal: controller.signal }, startAt);

      if (outcome.halted) {
        const pending = store.pendingApproval(run.id);
        store.setStatus(run.id, pending ? 'awaiting_approval' : 'cancelled');
        this.#closeTrace(run.id, pending ? 'awaiting_approval' : 'cancelled', startedAt);

        // §12 — a run on an async surface that stops at a gate is waiting on a person
        // who is not watching. Without this it waits until it expires.
        if (pending && this.#isAsync(run.surface)) {
          const payload = pending.payload as { human?: string; action?: string };
          await adapters.transport.notify(principal.id, {
            title: `${agent.name} needs your approval`,
            body: payload.human ?? `${payload.action ?? 'An action'} is waiting for you.`,
            runId: run.id,
            kind: 'approval_needed',
          });
        }
        // No terminal event: an awaiting run is not over, and a client that reconnects
        // must find it still open.
        return;
      }

      if (run.threadId && !inline && outcome.state.answer) {
        await adapters.memory.appendTurn(run.threadId, {
          id: `turn_${crypto.randomUUID().slice(0, 12)}`,
          threadId: run.threadId,
          role: 'assistant',
          text: outcome.state.answer ?? '',
          at: new Date().toISOString(),
          runId: run.id,
        });
      }

      // A sub-agent's answer is not streamed into anyone's chat; the supervisor reads it
      // from here. Recorded before the terminal event so the waiting supervisor cannot
      // observe completion before the answer exists.
      if (run.parentRunId) {
        store.trace(run.id, null, 'subagent_answer', { answer: outcome.state.answer ?? '', agentId: agent.id });
      }

      store.setStatus(run.id, 'succeeded');
      this.#closeTrace(run.id, 'succeeded', startedAt);
      await emit({ type: 'run_completed', runId: run.id, status: 'succeeded' });

      // A sub-agent run is a background run, but nobody asked it a question directly —
      // notifying about it would be telling someone their own supervisor made a call.
      if (this.#isAsync(run.surface) && !run.parentRunId) {
        // §12 — async surfaces notify rather than stream.
        await adapters.transport.notify(principal.id, {
          title: `${agent.name} finished`,
          body: (outcome.state.answer ?? '').slice(0, 160) || 'Nothing to report.',
          runId: run.id,
          kind: 'info',
        });
      }
    } catch (err) {
      const e = asCortexError(err);
      store.setStatus(run.id, 'failed');
      this.#closeTrace(run.id, 'failed', startedAt);
      store.trace(run.id, null, 'run_failed', { kind: e.kind, message: e.message });
      await emit({ type: 'run_failed', runId: run.id, error: { kind: e.kind, message: e.message } });
      if (this.#isAsync(run.surface) && !run.parentRunId) {
        // A background failure with no notification is a background failure nobody hears.
        await adapters.transport.notify(principal.id, {
          title: `${agent.name} could not finish`,
          body: e.message,
          runId: run.id,
          kind: 'failed',
        });
      }
    } finally {
      this.#running.delete(run.id);
    }
  }

  #selector(agent: AgentManifest, routeCtx: { principal: Principal; runId: string; surface: Surface; retryCount: number; budgetRemainingUsd: number }) {
    const planClass = agent.modelPolicy.steps?.plan ?? 'fast.cheap';
    // Only use a model to pick tools when a real one is reachable. The rehearsal
    // provider cannot produce a tool call, and asking it to would fail twice before
    // falling back — slower, and noisier in the trace, for the same answer.
    const candidates = this.deps.router.plan(planClass, routeCtx);
    const hasRealModel = candidates.some((c) => c.provider !== 'rehearsal' && c.provider !== 'local');
    return hasRealModel ? new ModelSelector(this.deps.router, routeCtx, planClass) : new EmbeddingSelector();
  }

  /** The surfaces with nobody watching the socket. */
  #isAsync(surface: Surface): boolean {
    return surface === 'background' || surface === 'rule';
  }

  #closeTrace(runId: string, status: string, startedAt: number): void {
    const final = this.deps.store.getRun(runId);
    this.deps.exporter?.end(runId, status, Date.now() - startedAt, final?.costUsd ?? 0, final?.tokensIn ?? 0, final?.tokensOut ?? 0);
  }

  async #history(run: Run): Promise<string[]> {
    if (!run.threadId) return [];
    const turns = await this.deps.adapters.memory.recent(run.threadId, 6);
    return turns.filter((t) => t.role === 'user').map((t) => t.text);
  }
}
