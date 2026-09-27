'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  PageCheck,
  Project,
  RunEvent,
  Task,
  TaskStatus,
  TaskStep,
  Usage,
} from '@/core/types';
import { cacheHitRate, emptyUsage } from '@/core/types';
import type { ProfileField } from '@/core/business/profile';

import { ArtifactList, type FiledArtifact } from './ArtifactList';
import { Calendar, type QueueItem } from './Calendar';
import { Credit, type CreditState } from './Credit';
import { Interview } from './Interview';
import { MemoryPanel, type StoredFact } from './MemoryPanel';
import { PlanPanel } from './PlanPanel';
import { Preview, type SiteVersion } from './Preview';
import { StatusPill } from './StatusPill';
import { StepCard } from './StepCard';
import styles from './workbench.module.css';

type Entry =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; text: string }
  | { kind: 'step'; id: string; step: TaskStep }
  | { kind: 'question'; id: string; question: string; answered: boolean }
  /** The research questions the planner chose, so the fan-out is visible. */
  | { kind: 'plan'; id: string; questions: string[] };

interface Props {
  projects: Project[];
  initialTasks: Task[];
  providers: {
    llm: string;
    sandbox: string;
    trace: string;
    deploy: string;
    publish: string;
    email: string;
  };
  profile: { usable: boolean; answers: Partial<Record<ProfileField, string>> };
  initialVersions: SiteVersion[];
  initialMemories: { pending: StoredFact[]; confirmed: StoredFact[] };
  initialArtifacts: FiledArtifact[];
  initialQueue: QueueItem[];
  initialCredit: CreditState;
  templateReady: boolean;
}

type View = 'work' | 'preview' | 'queue';

const SUGGESTIONS = [
  'Build me a landing page',
  'Make the headline shorter and more direct',
  'Create a hello-world Python script and run it',
];

export function Workbench({
  projects,
  initialTasks,
  providers,
  profile,
  initialVersions,
  initialMemories,
  initialArtifacts,
  initialQueue,
  initialCredit,
  templateReady,
}: Props) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [view, setView] = useState<View>(initialVersions.length > 0 ? 'preview' : 'work');
  const [versions, setVersions] = useState<SiteVersion[]>(initialVersions);
  const [checks, setChecks] = useState<PageCheck[]>([]);
  // The interview runs until the profile is usable, or until it is skipped.
  const [interviewing, setInterviewing] = useState(!profile.usable);
  const [memories, setMemories] = useState(initialMemories);
  const [artifacts, setArtifacts] = useState<FiledArtifact[]>(initialArtifacts);
  const [queue, setQueue] = useState<QueueItem[]>(initialQueue);
  const [credit, setCredit] = useState<CreditState>(initialCredit);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [status, setStatus] = useState<TaskStatus | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [plan, setPlan] = useState<string | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [usage, setUsage] = useState<Usage>(emptyUsage);
  const [cost, setCost] = useState(0);
  const [draft, setDraft] = useState('');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refreshMemories = useCallback(async () => {
    if (!projectId) return;
    const response = await fetch(`/api/projects/${projectId}/memories`);
    if (response.ok) setMemories(await response.json());
  }, [projectId]);

  const refreshArtifacts = useCallback(async () => {
    if (!projectId) return;
    const response = await fetch(`/api/projects/${projectId}/artifacts`);
    if (response.ok) setArtifacts((await response.json()).artifacts);
  }, [projectId]);

  const refreshCredit = useCallback(async () => {
    const response = await fetch('/api/billing');
    if (response.ok) setCredit(await response.json());
  }, []);

  const refreshQueue = useCallback(async () => {
    if (!projectId) return;
    const response = await fetch(`/api/projects/${projectId}/queue`);
    if (response.ok) setQueue((await response.json()).items);
  }, [projectId]);

  const refreshVersions = useCallback(async () => {
    if (!projectId) return;
    const response = await fetch(`/api/projects/${projectId}/versions`);
    if (!response.ok) return;
    const body = (await response.json()) as { versions: SiteVersion[] };
    setVersions(body.versions);
  }, [projectId]);

  const transcriptRef = useRef<HTMLDivElement>(null);
  const pinnedToBottom = useRef(true);
  // `apply` is memoised without `taskId` so the stream handler is not rebuilt on
  // every render; this ref is how it still knows which row to update.
  const currentTaskId = useRef<string | null>(null);

  /* ------------------------------------------------------------- streaming */

  const apply = useCallback((event: RunEvent) => {
    switch (event.type) {
      case 'task.started':
        setStatus('running');
        break;

      case 'assistant.text':
        // Deltas land on the trailing assistant turn, or open a new one if a
        // step card was appended since the last chunk.
        setEntries((prev) => {
          const last = prev[prev.length - 1];
          if (last?.kind === 'assistant') {
            return [...prev.slice(0, -1), { ...last, text: last.text + event.text }];
          }
          return [...prev, { kind: 'assistant', id: `a${event.seq}`, text: event.text }];
        });
        break;

      case 'step.started':
        // The model's own turns are already visible as streamed text; a second
        // card for the same turn is noise. Tool calls are what the transcript
        // is for.
        if (event.step.kind !== 'tool') break;
        setEntries((prev) => [
          ...prev,
          { kind: 'step', id: event.step.id, step: event.step },
        ]);
        break;

      case 'step.finished':
        setEntries((prev) =>
          prev.map((e) =>
            e.kind === 'step' && e.id === event.step.id ? { ...e, step: event.step } : e,
          ),
        );
        break;

      case 'plan.updated':
        setPlan(event.todo);
        break;

      case 'files.changed':
        setFiles(event.paths);
        break;

      case 'usage':
        setUsage(event.usage);
        setCost(event.cost_usd);
        break;

      case 'question':
        setStatus('awaiting_user');
        setEntries((prev) => [
          ...prev,
          { kind: 'question', id: `q${event.seq}`, question: event.question, answered: false },
        ]);
        break;

      case 'site.version':
        // Refetching rather than appending: the server knows the title and the
        // headline it pulled out of the built HTML, and this does not.
        setView('preview');
        void refreshVersions();
        break;

      case 'site.deployed':
        void refreshVersions();
        break;

      case 'checks.updated':
        setChecks(event.checks);
        break;

      case 'memory.proposed':
        // Refetch rather than append: the server decides what counts as
        // pending, including whether this fact was already known.
        void refreshMemories();
        break;

      case 'artifact.ready':
        void refreshArtifacts();
        break;

      case 'approval.queued':
        // Straight to the queue view: something is now waiting on a decision,
        // and a badge in a panel nobody has open is not telling them.
        setView('queue');
        void refreshQueue();
        break;

      case 'approval.executed':
        void refreshQueue();
        break;

      case 'balance':
        // The hold has been settled, so this is what is actually left.
        setCredit((c) => ({ ...c, balance_usd: event.balance_usd }));
        break;

      case 'research.planned':
        setEntries((prev) => [
          ...prev,
          { kind: 'plan', id: `rp${event.seq}`, questions: event.questions },
        ]);
        break;

      case 'task.finished':
        setStatus(event.status);
        setError(event.error);
        // The rail row was added at 'queued' and would otherwise keep saying so
        // for the rest of the session.
        setTasks((prev) =>
          prev.map((t) => (t.id === currentTaskId.current ? { ...t, status: event.status } : t)),
        );
        break;
    }
  }, [refreshVersions, refreshMemories, refreshArtifacts, refreshQueue]);

  useEffect(() => {
    if (!taskId) return;
    const source = new EventSource(`/api/tasks/${taskId}/events`);

    // One handler per event name, because the stream names its frames and a
    // bare `onmessage` would only see the unnamed ones.
    const names: RunEvent['type'][] = [
      'task.started',
      'assistant.text',
      'step.started',
      'step.finished',
      'plan.updated',
      'files.changed',
      'usage',
      'question',
      'site.version',
      'site.deployed',
      'checks.updated',
      'memory.proposed',
      'artifact.ready',
      'research.planned',
      'approval.queued',
      'approval.executed',
      'balance',
      'task.finished',
    ];
    for (const name of names) {
      source.addEventListener(name, (e) => apply(JSON.parse((e as MessageEvent).data)));
    }
    source.addEventListener('task.finished', () => source.close());

    // The server sends `replay` when the live run is gone — the process was
    // restarted, or the task finished long enough ago that the bus dropped it.
    // It is terminal: close the source, because a closed SSE response is a
    // reconnect signal to the browser and this one would loop forever.
    source.addEventListener('replay', (e) => {
      const { task, steps } = JSON.parse((e as MessageEvent).data) as {
        task: Task | null;
        steps: TaskStep[];
      };
      source.close();
      if (!task) return;
      setStatus(task.status);
      setError(task.error);
      setCost(task.cost_usd);
      setEntries([
        { kind: 'user', id: `u${task.id}`, text: task.prompt },
        ...steps
          .filter((s) => s.kind === 'tool')
          .map((s): Entry => ({ kind: 'step', id: s.id, step: s })),
      ]);
    });

    // A transport-level failure on a closed stream is normal; one on an open
    // stream is not, and silently retrying it hides a broken endpoint.
    source.addEventListener('error', () => {
      if (source.readyState === EventSource.CLOSED) return;
      setError('lost the progress stream — reload to see where the task got to');
      source.close();
    });

    return () => source.close();
  }, [taskId, apply]);

  /* ------------------------------------------------------------ autoscroll */

  useEffect(() => {
    const el = transcriptRef.current;
    if (!el || !pinnedToBottom.current) return;
    // `auto`, not `smooth`. Text arrives many times a second during streaming;
    // a smooth scroll retargeting on every chunk is motion sickness, not polish.
    el.scrollTo({ top: el.scrollHeight, behavior: 'auto' });
  }, [entries]);

  const onTranscriptScroll = useCallback(() => {
    const el = transcriptRef.current;
    if (!el) return;
    // Scrolling up to read something pins the view there until the reader
    // returns to the bottom themselves.
    pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  }, []);

  /* --------------------------------------------------------------- actions */

  const busy = status === 'running' || status === 'awaiting_user' || status === 'queued';

  const submit = useCallback(
    async (prompt: string) => {
      const text = prompt.trim();
      if (!text || busy || !projectId) return;

      setDraft('');
      setError(null);
      setPlan(null);
      setFiles([]);
      setUsage(emptyUsage());
      setCost(0);
      setEntries([{ kind: 'user', id: `u${Date.now()}`, text }]);
      setStatus('queued');

      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, prompt: text }),
      });

      const body = (await response.json()) as {
        task?: Task;
        error?: string;
        balance_usd?: number;
      };
      if (!response.ok || !body.task) {
        setStatus('failed');
        // A 402 is not a failure of the request: it is the quota or the
        // balance, and the message is written for the owner.
        setError(body.error ?? 'could not start the task');
        if (typeof body.balance_usd === 'number') {
          setCredit((c) => ({ ...c, balance_usd: body.balance_usd! }));
        }
        return;
      }
      setTasks((prev) => [body.task!, ...prev]);
      currentTaskId.current = body.task.id;
      setTaskId(body.task.id);
    },
    [busy, projectId],
  );

  const sendAnswer = useCallback(async () => {
    const text = answer.trim();
    if (!text || !taskId) return;
    setAnswer('');
    setEntries((prev) =>
      prev.map((e) => (e.kind === 'question' && !e.answered ? { ...e, answered: true } : e)),
    );
    setStatus('running');
    await fetch(`/api/tasks/${taskId}/answer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ answer: text }),
    });
  }, [answer, taskId]);

  const openTask = useCallback(async (id: string) => {
    const response = await fetch(`/api/tasks/${id}`);
    if (!response.ok) return;
    const { task, steps } = (await response.json()) as { task: Task; steps: TaskStep[] };
    currentTaskId.current = id;
    setTaskId(id);
    setStatus(task.status);
    setError(task.error);
    setCost(task.cost_usd);
    setPlan(null);
    setFiles([]);
    setEntries([
      { kind: 'user', id: `u${task.id}`, text: task.prompt },
      ...steps
        .filter((s) => s.kind === 'tool')
        .map((s): Entry => ({ kind: 'step', id: s.id, step: s })),
    ]);
    setUsage({
      input_tokens: steps.reduce((n, s) => n + s.tokens_in, 0),
      cache_read_input_tokens: steps.reduce((n, s) => n + s.tokens_cached, 0),
      cache_creation_input_tokens: 0,
      output_tokens: steps.reduce((n, s) => n + s.tokens_out, 0),
    });
  }, []);

  const pendingQuestion = entries.find(
    (e): e is Extract<Entry, { kind: 'question' }> => e.kind === 'question' && !e.answered,
  );

  const hitRate = useMemo(() => cacheHitRate(usage), [usage]);
  const waiting = useMemo(() => queue.filter((q) => q.status === 'pending').length, [queue]);
  const simulated = providers.llm === 'scripted';

  /* ---------------------------------------------------------------- render */

  return (
    <div className={styles.shell}>
      <div className={styles.brand}>
        <span className={styles.brandMark} aria-hidden />
        <span className={styles.brandName}>Runner</span>
      </div>

      <header className={styles.header}>
        <span className={styles.taskTitle}>
          {entries[0]?.kind === 'user' ? entries[0].text : 'No task running'}
        </span>

        <div className={styles.headerRight}>
          {memories.pending.length > 0 && view === 'preview' ? (
            <button type="button" className={styles.badgeButton} onClick={() => setView('work')}>
              {memories.pending.length} to check
            </button>
          ) : null}
          {status ? <StatusPill status={status} /> : null}
          {versions.length > 0 || queue.length > 0 ? (
            <div className={styles.segmented} role="group" aria-label="View">
              {(
                [
                  ['work', 'Work', true],
                  ['preview', 'Page', versions.length > 0],
                  ['queue', 'Queue', queue.length > 0],
                ] as Array<[View, string, boolean]>
              )
                .filter(([, , show]) => show)
                .map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={`${styles.segment} ${view === value ? styles.segmentActive : ''}`}
                    onClick={() => setView(value)}
                    aria-pressed={view === value}
                  >
                    {label}
                    {value === 'queue' && waiting > 0 ? (
                      <span className={styles.badge}>{waiting}</span>
                    ) : null}
                  </button>
                ))}
            </div>
          ) : null}
        </div>
      </header>

      <nav className={styles.rail} aria-label="Projects and tasks">
        <p className={styles.railHeading}>Businesses</p>
        {projects.map((project) => (
          <button
            key={project.id}
            type="button"
            className={`${styles.railItem} ${project.id === projectId ? styles.railItemActive : ''}`}
            onClick={() => setProjectId(project.id)}
          >
            <span className={styles.railItemLabel}>{project.name}</span>
          </button>
        ))}

        <p className={styles.railHeading} style={{ marginTop: 'var(--step)' }}>
          Tasks
        </p>
        {tasks.length === 0 ? (
          <p className={styles.railHeading}>None yet</p>
        ) : (
          tasks.map((task) => (
            <button
              key={task.id}
              type="button"
              className={`${styles.railItem} ${task.id === taskId ? styles.railItemActive : ''}`}
              onClick={() => void openTask(task.id)}
            >
              <span className={styles.railItemLabel}>{task.prompt}</span>
              <span className={styles.railItemMeta}>{task.status}</span>
            </button>
          ))
        )}
      </nav>

      <main className={styles.main}>
        {view === 'queue' ? (
          <Calendar projectId={projectId} items={queue} onChange={() => void refreshQueue()} />
        ) : view === 'preview' ? (
          <Preview
            projectId={projectId}
            versions={versions}
            checks={checks}
            onRefresh={() => void refreshVersions()}
          />
        ) : interviewing ? (
          <Interview
            projectId={projectId}
            initial={profile.answers}
            onSkip={() => setInterviewing(false)}
            onDone={() => {
              setInterviewing(false);
              // The whole point of the interview is that the next thing is a
              // page, so do not make them ask for one.
              void submit('Build a landing page for my business.');
            }}
          />
        ) : (
        <>
        <div
          className={styles.transcript}
          ref={transcriptRef}
          onScroll={onTranscriptScroll}
          aria-live="polite"
          aria-busy={busy}
        >
          {entries.length === 0 ? (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>Describe what you need.</p>
              <p>
                Runner plans it, works in a sandbox, and shows you every step. Ask for a
                landing page and it builds one, checks it in a real browser at phone and
                desktop widths, and shows you the result before anything is published.
              </p>
              {!templateReady ? (
                <p className={styles.warn}>
                  The site template is not installed yet, so page building will fail. Run{' '}
                  <code className="mono">pnpm --filter runner seed</code> once.
                </p>
              ) : null}
              <div className={styles.suggestions}>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={styles.suggestion}
                    onClick={() => void submit(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            entries.map((entry) => {
              if (entry.kind === 'user') {
                return (
                  <p key={entry.id} className={styles.userTurn}>
                    {entry.text}
                  </p>
                );
              }
              if (entry.kind === 'assistant') {
                return (
                  <div key={entry.id} className={styles.assistantTurn}>
                    <span className={styles.aiLabel}>AI assistant</span>
                    <div>
                      {entry.text}
                      {busy ? <span className={styles.caret} aria-hidden /> : null}
                    </div>
                  </div>
                );
              }
              if (entry.kind === 'step') {
                return <StepCard key={entry.id} step={entry.step} />;
              }
              if (entry.kind === 'plan') {
                return (
                  <div key={entry.id} className={styles.researchPlan}>
                    <p className={styles.aiLabel}>Researching</p>
                    <ul>
                      {entry.questions.map((q) => (
                        <li key={q}>{q}</li>
                      ))}
                    </ul>
                  </div>
                );
              }
              return (
                <div key={entry.id} className={styles.question}>
                  <p className={styles.questionLabel}>Runner needs an answer</p>
                  <p>{entry.question}</p>
                  {entry.answered ? null : (
                    <div className={styles.questionRow}>
                      <input
                        className={styles.input}
                        value={answer}
                        onChange={(e) => setAnswer(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void sendAnswer();
                        }}
                        aria-label="Your answer"
                      />
                      <button
                        type="button"
                        className={styles.send}
                        onClick={() => void sendAnswer()}
                      >
                        Reply
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {error ? (
            <p className={`${styles.step} ${styles.stepError}`}>{error}</p>
          ) : null}
        </div>

        <form
          className={styles.composer}
          onSubmit={(e) => {
            e.preventDefault();
            void submit(draft);
          }}
        >
          <textarea
            className={styles.input}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends, shift-enter adds a line. No motion on either —
              // keyboard-initiated actions should be instant.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void submit(draft);
              }
            }}
            placeholder={busy ? 'Runner is working…' : 'What do you need done?'}
            rows={1}
            disabled={busy}
            aria-label="Describe the task"
          />
          <button type="submit" className={styles.send} disabled={busy || !draft.trim()}>
            Run
          </button>
        </form>
        </>
        )}
      </main>

      <aside className={styles.aside} aria-label="Plan, files and cost" data-view={view}>
        <section>
          <h2 className={styles.panelHeading}>Plan</h2>
          <PlanPanel todo={plan} />
        </section>

        <ArtifactList artifacts={artifacts} />

        <MemoryPanel
          projectId={projectId}
          pending={memories.pending}
          confirmed={memories.confirmed}
          onChange={setMemories}
        />

        <section>
          <h2 className={styles.panelHeading}>Sandbox</h2>
          {files.length === 0 ? (
            <p className={styles.placeholder}>Nothing written yet.</p>
          ) : (
            <ul className={styles.files}>
              {files.slice(0, 40).map((file) => (
                <li key={file} className={`${styles.file} mono`}>
                  {file}
                </li>
              ))}
            </ul>
          )}
        </section>

        <Credit credit={credit} onChange={() => void refreshCredit()} />

        <section>
          <h2 className={styles.panelHeading}>This task</h2>
          <div className={styles.meters}>
            <div className={styles.meter}>
              <span className={styles.meterValue}>${cost.toFixed(4)}</span>
              <span className={styles.meterLabel}>cost</span>
            </div>
            <div className={styles.meter}>
              <span className={styles.meterValue}>
                {Math.round(hitRate * 100)}%{simulated ? '*' : ''}
              </span>
              <span className={styles.meterLabel}>cache hits</span>
            </div>
            <div className={styles.meter}>
              <span className={styles.meterValue}>
                {(
                  usage.input_tokens +
                  usage.cache_read_input_tokens +
                  usage.cache_creation_input_tokens
                ).toLocaleString()}
              </span>
              <span className={styles.meterLabel}>tokens in</span>
            </div>
            <div className={styles.meter}>
              <span className={styles.meterValue}>{usage.output_tokens.toLocaleString()}</span>
              <span className={styles.meterLabel}>tokens out</span>
            </div>
          </div>
        </section>
      </aside>

      <footer className={styles.foot}>
        <span>
          model <span className={styles.footKey}>{providers.llm}</span>
        </span>
        <span>
          sandbox <span className={styles.footKey}>{providers.sandbox}</span>
        </span>
        <span>
          traces <span className={styles.footKey}>{providers.trace}</span>
        </span>
        <span>
          publish <span className={styles.footKey}>{providers.deploy}</span>
        </span>
        <span>
          social <span className={styles.footKey}>{providers.publish}</span>
        </span>
        <span>
          email <span className={styles.footKey}>{providers.email}</span>
        </span>
        {simulated ? (
          <span className={styles.warn}>
            * scripted provider — the transcript and the cache figure are simulated
          </span>
        ) : null}
        {providers.sandbox === 'local' ? (
          <span className={styles.warn}>local sandbox is not isolation</span>
        ) : null}
        {providers.deploy === 'local' ? (
          <span className={styles.warn}>published sites stay on this machine</span>
        ) : null}
        {providers.publish === 'outbox' || providers.email === 'outbox' ? (
          <span className={styles.warn}>
            approved posts and emails are recorded, not actually sent
          </span>
        ) : null}
      </footer>
    </div>
  );
}
