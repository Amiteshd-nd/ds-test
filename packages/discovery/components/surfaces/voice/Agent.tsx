'use client';

/**
 * The agent definition — added after `docs/sarvam-voice-agents-webinar.md`.
 *
 * The correction it makes: an agent is not a list of rules. It is a **prompt
 * document with sections**, plus **tools**, plus **input and output variables**, plus
 * a **goal** defined against an output variable. Before this, the sweep's outcome
 * categories were invented by the interface rather than derived from anything the
 * author had defined — which made the evidence float free of the thing being
 * evaluated.
 *
 * Two details carry real design weight:
 *
 * - **Sections exist because debugging is finding the paragraph that is wrong.**
 *   Single-state agents, one long prompt; the sections are the handles.
 * - **A tool budget is a latency budget.** Five seconds is the advice, thirty the
 *   hard stop, and anything over the advice is drawn as a warning because the caller
 *   experiences it as the agent going quiet.
 */
import { copy } from './copy';
import {
  RECOMMENDED_TOOL_MS,
  behaviourOf,
  failingBehaviours,
  sectionOf,
  unexercisedBehaviours,
  type VoiceState,
} from '@/lib/surfaces/voice/reducer';
import styles from './voice.module.css';

export function Tools({ state }: { state: VoiceState }) {
  if (!state.tools.length) return null;
  return (
    <div className={styles.specGroup}>
      <span className={styles.specLabel}>{copy.agent.tools}</span>
      {state.tools.map((tool) => {
        const over = tool.budgetMs > RECOMMENDED_TOOL_MS;
        return (
          <div className={styles.tool} data-over={String(over)} key={tool.id}>
            <span className={styles.toolName}>{tool.name}</span>
            <span className={styles.toolWhen}>{copy.agent.toolWhen[tool.when]}</span>
            <span className={styles.toolBudget}>{copy.agent.budget(tool.budgetMs)}</span>
            <span className={styles.toolDescription}>{tool.description}</span>
            {tool.regex && (
              <span className={styles.toolDescription}>{copy.agent.validator(tool.regex)}</span>
            )}
            {over && <span className={styles.toolOver}>{copy.agent.budgetOver}</span>}
          </div>
        );
      })}
      <span className={styles.note}>{copy.agent.budgetNote}</span>
      {state.tools.some((t) => t.regex) && (
        <span className={styles.note}>{copy.agent.validatorNote}</span>
      )}
    </div>
  );
}

export function Variables({ state }: { state: VoiceState }) {
  if (!state.variables.length) return null;
  const inputs = state.variables.filter((v) => v.direction === 'input');
  const outputs = state.variables.filter((v) => v.direction === 'output');
  return (
    <>
      {inputs.length > 0 && (
        <div className={styles.specGroup}>
          <span className={styles.specLabel}>{copy.agent.inputs}</span>
          {inputs.map((v) => (
            <span className={styles.variable} key={v.id}>
              <span className={styles.variableName}>{v.name}</span>
              <span className={styles.note}>{v.defaultValue}</span>
            </span>
          ))}
        </div>
      )}
      {outputs.length > 0 && (
        <div className={styles.specGroup}>
          <span className={styles.specLabel}>{copy.agent.outputs}</span>
          {outputs.map((v) => (
            <span className={styles.variable} key={v.id}>
              <span className={styles.variableName}>{v.name}</span>
              <span className={styles.note}>
                {copy.agent.extraction} “{v.extraction}”
              </span>
              {v.allowed && <span className={styles.variableEnum}>{v.allowed.join(' · ')}</span>}
            </span>
          ))}
        </div>
      )}
      {state.goal && (
        <p className={styles.goal}>
          {copy.agent.goal} <strong>{state.goal.label}</strong> — {state.goal.variable} ={' '}
          {state.goal.equals}
        </p>
      )}
    </>
  );
}

/**
 * Expected behaviours: the real unit of evaluation, and the second way into the
 * evidence. Clusters answer "what went wrong"; this answers "which of the things I
 * said should happen didn't" — which is the question an author actually has.
 */
export function Behaviours({
  state,
  onOpenCluster,
}: {
  state: VoiceState;
  onOpenCluster?: (id: string) => void;
}) {
  if (!state.behaviours.length) return null;
  const failing = failingBehaviours(state);
  const never = unexercisedBehaviours(state);

  return (
    <section className={styles.behaviours} aria-labelledby="beh">
      <div className={styles.head}>
        <h3 className={styles.headTitle} id="beh">
          {copy.behaviours.heading}
        </h3>
      </div>
      <p className={styles.note}>{copy.behaviours.note}</p>

      {state.behaviours.map((behaviour) => {
        const section = sectionOf(state, behaviour.sectionId);
        const broken =
          behaviour.checked !== undefined &&
          behaviour.held !== undefined &&
          behaviour.held < behaviour.checked;
        const cluster = state.clusters.find((c) => c.behaviourId === behaviour.id);
        return (
          <div className={styles.behaviour} data-broken={String(broken)} key={behaviour.id}>
            <span className={styles.behaviourText}>{behaviour.text}</span>
            <span className={styles.behaviourCount}>
              {behaviour.checked === undefined
                ? copy.behaviours.never
                : behaviour.held === behaviour.checked
                  ? copy.behaviours.perfect
                  : copy.behaviours.held(behaviour.held ?? 0, behaviour.checked)}
            </span>
            {section && (
              <span className={styles.behaviourSection}>
                {copy.behaviours.inSection} {section.heading}
              </span>
            )}
            {/* The path back up: from a failed assertion to the calls that broke it. */}
            {broken && cluster && onOpenCluster && (
              <button
                type="button"
                className={styles.button}
                data-kind="quiet"
                onClick={() => onOpenCluster(cluster.id)}
              >
                {copy.behaviours.brokenBy} {cluster.count} calls
              </button>
            )}
          </div>
        );
      })}

      {never.length > 0 && (
        <p className={styles.note}>
          {never.length} of these were never exercised by a call, which is the same kind of silence
          as an untested rule.
        </p>
      )}
      {failing.length > 0 && <span className={styles.srOnly} />}
    </section>
  );
}

export function Settings({ state }: { state: VoiceState }) {
  const s = state.settings;
  if (!s) return null;
  return (
    <section className={styles.specGroup} aria-labelledby="set">
      <span className={styles.specLabel} id="set">
        {copy.settings.heading}
      </span>
      <div className={styles.setting}>
        <span>{copy.settings.eagerness}</span>
        <span className={styles.settingValue}>{s.eagerness.toFixed(2)}</span>
        <span className={styles.note}>{copy.settings.eagernessNote(s.eagerness)}</span>
      </div>
      <div className={styles.setting} data-warn={String(s.interruptionThreshold < 0.3)}>
        <span>{copy.settings.threshold}</span>
        <span className={styles.settingValue}>{s.interruptionThreshold.toFixed(2)}</span>
        <span className={styles.note}>{copy.settings.thresholdNote(s.interruptionThreshold)}</span>
      </div>
      <p className={styles.note}>{copy.settings.nudge(s.nudgeAfterMs, s.nudgesBeforeHangup)}</p>
      {s.voicemailDetection && <p className={styles.note}>{copy.settings.voicemail}</p>}
      {s.backgroundAmbience && (
        <p className={styles.note}>{copy.settings.ambience(s.backgroundAmbience)}</p>
      )}
      <p className={styles.note}>{copy.settings.rate(s.speakingRate)}</p>
    </section>
  );
}

/**
 * Production beside simulation — the minimum that makes `LIVE_DIVERGING` a claim
 * rather than an assertion. Not a Monitor dashboard: the brief says one drift signal
 * is enough, and a dashboard is a sixth project.
 */
export function Production({ state }: { state: VoiceState }) {
  const p = state.production;
  if (!p) return null;
  const row = (label: string, live: string, simulated: string, worse: boolean) => (
    <div className={styles.prodRow} data-worse={String(worse)} key={label}>
      <span>{label}</span>
      <span className={styles.prodValue}>{simulated}</span>
      <span className={styles.prodValue}>{live}</span>
    </div>
  );
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  return (
    <section className={styles.production} aria-labelledby="prod">
      <div className={styles.head}>
        <h3 className={styles.headTitle} id="prod">
          {copy.production.heading}
        </h3>
        <span className={styles.headAside}>{copy.production.calls(p.calls)}</span>
      </div>
      <div className={styles.prodRow}>
        <span />
        <span className={styles.prodHead}>{copy.production.simulated}</span>
        <span className={styles.prodHead}>{copy.production.live}</span>
      </div>
      {row(copy.production.goal, pct(p.goalRate), pct(p.simulated.goalRate), p.goalRate < p.simulated.goalRate)}
      {row(
        copy.production.shortCalls,
        pct(p.shortCallRate),
        pct(p.simulated.shortCallRate),
        p.shortCallRate > p.simulated.shortCallRate,
      )}
      {row(
        copy.production.turn,
        `${(p.medianTurnMs / 1000).toFixed(2)}s`,
        `${(p.simulated.medianTurnMs / 1000).toFixed(2)}s`,
        p.medianTurnMs > p.simulated.medianTurnMs,
      )}
      <p className={styles.note}>{copy.production.gap}</p>
    </section>
  );
}
