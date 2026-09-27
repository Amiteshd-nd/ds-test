/**
 * The store. SQLite now, Supabase later.
 *
 * PRD section 7 names Supabase, and that is still where this goes — but Phase 0
 * needs project CRUD and a checkpointed step log, not hosted Postgres, and a
 * local file removes an account from the path of every test run. The schema is
 * written to port (see `schema.sql`); what does not port is row-level security,
 * which SQLite has no equivalent for and which section 10 requires on every
 * table. That is a Supabase-migration task, not a thing to approximate here.
 */

import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { SqliteMemoryStore } from '../business/memory.ts';
import { Ledger } from '../billing/ledger.ts';
import type { QueuedAction } from '../growth/gate.ts';
import type {
  Approval,
  Artifact,
  BusinessProfile,
  Project,
  Task,
  TaskStatus,
  TaskStep,
  User,
} from '../types.ts';

const now = () => new Date().toISOString();

/**
 * `schema.sql` is the source of truth and stays a .sql file so it can be read,
 * diffed and ported to Postgres without being unpicked from a template literal.
 * That means it has to be found at runtime: relative to this module first, and
 * to the working directory second, because a Next server bundle and a plain
 * `node scripts/*.ts` run disagree about which one is meaningful.
 */
function loadSchema(): string {
  const candidates = [
    path.join(import.meta.dirname ?? '', 'schema.sql'),
    path.join(process.cwd(), 'src', 'core', 'db', 'schema.sql'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf8');
    } catch {
      /* try the next one */
    }
  }
  throw new Error(
    `could not find schema.sql (looked in ${candidates.join(', ')}). ` +
      'Run package scripts from packages/runner.',
  );
}

export class Store {
  private readonly db: Database.Database;

  constructor(file = path.join(process.cwd(), '.runner', 'runner.db')) {
    mkdirSync(path.dirname(file), { recursive: true });
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(loadSchema());
  }

  /* ------------------------------------------------------------------ users */

  /* --------------------------------------------------------------- credits */

  private ledgerStore: Ledger | undefined;

  get ledger(): Ledger {
    return (this.ledgerStore ??= new Ledger(this.db));
  }

  getUser(id: string): User | undefined {
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
  }

  setPlan(userId: string, plan: string): void {
    this.db.prepare('UPDATE users SET plan = ? WHERE id = ?').run(plan, userId);
  }

  /** Tasks in a given state, across all of a user's projects. */
  countTasks(userId: string, status: TaskStatus): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM tasks t
           JOIN projects p ON p.id = t.project_id
          WHERE p.user_id = ? AND t.status = ?`,
      )
      .get(userId, status) as { n: number };
    return row.n;
  }

  /** Tasks started since a timestamp. The rolling daily limit reads this. */
  countTasksSince(userId: string, since: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM tasks t
           JOIN projects p ON p.id = t.project_id
          WHERE p.user_id = ? AND COALESCE(t.started_at, '') >= ?`,
      )
      .get(userId, since) as { n: number };
    return row.n;
  }

  /** Which user a task belongs to, for settling its hold. */
  userForTask(taskId: string): string | undefined {
    const row = this.db
      .prepare(
        `SELECT p.user_id FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = ?`,
      )
      .get(taskId) as { user_id: string } | undefined;
    return row?.user_id;
  }

  upsertUser(email: string): User {
    const existing = this.db
      .prepare('SELECT * FROM users WHERE email = ?')
      .get(email) as User | undefined;
    if (existing) return existing;

    const user: User = { id: randomUUID(), email, plan: 'free', created_at: now() };
    this.db
      .prepare('INSERT INTO users (id, email, plan, created_at) VALUES (?, ?, ?, ?)')
      .run(user.id, user.email, user.plan, user.created_at);
    return user;
  }

  /* --------------------------------------------------------------- projects */

  createProject(userId: string, name: string): Project {
    const project: Project = { id: randomUUID(), user_id: userId, name, created_at: now() };
    const insertProject = this.db.prepare(
      'INSERT INTO projects (id, user_id, name, created_at) VALUES (?, ?, ?, ?)',
    );
    const insertProfile = this.db.prepare(
      'INSERT INTO business_profiles (project_id, updated_at) VALUES (?, ?)',
    );
    // One transaction: a project without its profile row would make every later
    // "read the business context" path need a null check it should not need.
    this.db.transaction(() => {
      insertProject.run(project.id, project.user_id, project.name, project.created_at);
      insertProfile.run(project.id, project.created_at);
    })();
    return project;
  }

  listProjects(userId: string): Project[] {
    return this.db
      .prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId) as Project[];
  }

  getProject(id: string): Project | undefined {
    return this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as
      | Project
      | undefined;
  }

  deleteProject(id: string): void {
    // Cascades to tasks, steps, artifacts, memories and approvals. PRD section
    // 10 also requires the sandbox files and any deployment to go; that is the
    // caller's job and is not done here.
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  }

  getProfile(projectId: string): BusinessProfile | undefined {
    return this.db
      .prepare('SELECT * FROM business_profiles WHERE project_id = ?')
      .get(projectId) as BusinessProfile | undefined;
  }

  updateProfile(projectId: string, patch: Partial<Omit<BusinessProfile, 'project_id'>>): void {
    const fields = ['name', 'offer', 'audience', 'tone', 'brand_json', 'links_json'] as const;
    const present = fields.filter((f) => patch[f] !== undefined);
    if (present.length === 0) return;
    const set = present.map((f) => `${f} = ?`).join(', ');
    this.db
      .prepare(`UPDATE business_profiles SET ${set}, updated_at = ? WHERE project_id = ?`)
      .run(...present.map((f) => patch[f]), now(), projectId);
  }

  /* ------------------------------------------------------------------ tasks */

  createTask(projectId: string, type: string, prompt: string): Task {
    const task: Task = {
      id: randomUUID(),
      project_id: projectId,
      type,
      prompt,
      status: 'queued',
      cost_usd: 0,
      started_at: null,
      finished_at: null,
      error: null,
    };
    this.db
      .prepare(
        'INSERT INTO tasks (id, project_id, type, prompt, status, cost_usd) VALUES (?, ?, ?, ?, ?, 0)',
      )
      .run(task.id, task.project_id, task.type, task.prompt, task.status);
    return task;
  }

  getTask(id: string): Task | undefined {
    return this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined;
  }

  listTasks(projectId: string): Task[] {
    return this.db
      .prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY rowid DESC')
      .all(projectId) as Task[];
  }

  startTask(id: string): void {
    this.db
      .prepare("UPDATE tasks SET status = 'running', started_at = ? WHERE id = ?")
      .run(now(), id);
  }

  finishTask(id: string, status: TaskStatus, error: string | null): void {
    this.db
      .prepare('UPDATE tasks SET status = ?, finished_at = ?, error = ? WHERE id = ?')
      .run(status, now(), error, id);
  }

  setTaskStatus(id: string, status: TaskStatus): void {
    this.db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(status, id);
  }

  addTaskCost(id: string, delta: number): void {
    this.db.prepare('UPDATE tasks SET cost_usd = cost_usd + ? WHERE id = ?').run(delta, id);
  }

  /* ------------------------------------------------------------------ steps */

  /** Written the moment a step begins, so a crash leaves it visible as running. */
  beginStep(
    taskId: string,
    seq: number,
    kind: TaskStep['kind'],
    name: string,
    inputRef: string | null,
  ): TaskStep {
    const step: TaskStep = {
      id: randomUUID(),
      task_id: taskId,
      seq,
      kind,
      name,
      input_ref: inputRef,
      output_ref: null,
      status: 'running',
      tokens_in: 0,
      tokens_cached: 0,
      tokens_out: 0,
      cost_usd: 0,
      error: null,
      started_at: now(),
      finished_at: null,
    };
    this.db
      .prepare(
        `INSERT INTO task_steps (id, task_id, seq, kind, name, input_ref, status, started_at)
         VALUES (?, ?, ?, ?, ?, ?, 'running', ?)`,
      )
      .run(step.id, taskId, seq, kind, name, inputRef, step.started_at);
    return step;
  }

  endStep(
    id: string,
    patch: {
      status: TaskStep['status'];
      output_ref?: string | null;
      tokens_in?: number;
      tokens_cached?: number;
      tokens_out?: number;
      cost_usd?: number;
      error?: string | null;
    },
  ): TaskStep {
    this.db
      .prepare(
        `UPDATE task_steps
            SET status = ?, output_ref = ?, tokens_in = ?, tokens_cached = ?,
                tokens_out = ?, cost_usd = ?, error = ?, finished_at = ?
          WHERE id = ?`,
      )
      .run(
        patch.status,
        patch.output_ref ?? null,
        patch.tokens_in ?? 0,
        patch.tokens_cached ?? 0,
        patch.tokens_out ?? 0,
        patch.cost_usd ?? 0,
        patch.error ?? null,
        now(),
        id,
      );
    return this.db.prepare('SELECT * FROM task_steps WHERE id = ?').get(id) as TaskStep;
  }

  listSteps(taskId: string): TaskStep[] {
    return this.db
      .prepare('SELECT * FROM task_steps WHERE task_id = ? ORDER BY seq')
      .all(taskId) as TaskStep[];
  }

  /* -------------------------------------------------------------- artifacts */

  addArtifact(
    taskId: string,
    kind: Artifact['kind'],
    storageUrl: string,
    publicUrl: string | null = null,
  ): Artifact {
    const artifact: Artifact = {
      id: randomUUID(),
      task_id: taskId,
      kind,
      storage_url: storageUrl,
      public_url: publicUrl,
      version: 1,
      created_at: now(),
    };
    this.db
      .prepare(
        `INSERT INTO artifacts (id, task_id, kind, storage_url, public_url, version, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        artifact.id,
        taskId,
        kind,
        storageUrl,
        publicUrl,
        artifact.version,
        artifact.created_at,
      );
    return artifact;
  }

  listArtifacts(taskId: string): Artifact[] {
    return this.db
      .prepare('SELECT * FROM artifacts WHERE task_id = ? ORDER BY created_at')
      .all(taskId) as Artifact[];
  }

  /* --------------------------------------------------------------- memories */

  /**
   * One per store, because it is a view over the same connection rather than a
   * separate resource. Lazy so that a store opened purely to read tasks does
   * not pay for it.
   */
  private memoryStore: SqliteMemoryStore | undefined;

  get memories(): SqliteMemoryStore {
    return (this.memoryStore ??= new SqliteMemoryStore(this.db));
  }

  /* -------------------------------------------------------------- approvals */

  createApproval(
    taskId: string,
    actionType: string,
    payload: unknown,
    options: { projectId?: string | null; scheduledFor?: string | null } = {},
  ): Approval {
    const approval: Approval = {
      id: randomUUID(),
      task_id: taskId,
      action_type: actionType,
      payload_json: JSON.stringify(payload),
      status: 'pending',
      decided_at: null,
    };
    this.db
      .prepare(
        `INSERT INTO approvals
           (id, task_id, project_id, action_type, payload_json, status, scheduled_for, created_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
      )
      .run(
        approval.id,
        taskId,
        options.projectId ?? null,
        actionType,
        approval.payload_json,
        options.scheduledFor ?? null,
        now(),
      );
    return approval;
  }

  decideApproval(id: string, status: 'approved' | 'rejected'): void {
    // Only an undecided row. Re-approving something already rejected, or
    // deciding one that has already gone out, is a bug somewhere upstream and
    // should not silently succeed.
    this.db
      .prepare(
        `UPDATE approvals SET status = ?, decided_at = ?
          WHERE id = ? AND executed_at IS NULL`,
      )
      .run(status, now(), id);
  }

  /** Reschedule a queued action. Only before it has gone out. */
  rescheduleApproval(id: string, scheduledFor: string | null): void {
    this.db
      .prepare('UPDATE approvals SET scheduled_for = ? WHERE id = ? AND executed_at IS NULL')
      .run(scheduledFor, id);
  }

  /** Everything queued for a project, newest first. This is the calendar. */
  listApprovals(projectId: string): QueuedAction[] {
    return this.db
      .prepare(
        `SELECT * FROM approvals
          WHERE project_id = ?
          ORDER BY COALESCE(scheduled_for, created_at) DESC`,
      )
      .all(projectId) as QueuedAction[];
  }

  getApproval(id: string): QueuedAction | undefined {
    return this.db.prepare('SELECT * FROM approvals WHERE id = ?').get(id) as
      | QueuedAction
      | undefined;
  }

  /**
   * Approved, due, and not yet done.
   *
   * A NULL `scheduled_for` means "as soon as it is approved", so it is due the
   * moment it is approved. This is exactly what the scheduler reads, and the
   * reason `approvals_due` exists as an index.
   */
  dueApprovals(nowIso = now()): QueuedAction[] {
    return this.db
      .prepare(
        `SELECT * FROM approvals
          WHERE status = 'approved'
            AND executed_at IS NULL
            AND (scheduled_for IS NULL OR scheduled_for <= ?)
          ORDER BY COALESCE(scheduled_for, created_at)`,
      )
      .all(nowIso) as QueuedAction[];
  }

  /** The gate needs the connection itself, to claim a row in one statement. */
  get connection(): Database.Database {
    return this.db;
  }

  close(): void {
    this.db.close();
  }
}

/**
 * One store per process. Next route handlers are reloaded freely in dev, and a
 * second `better-sqlite3` handle on the same WAL file is a needless source of
 * lock contention.
 */
const globalStore = globalThis as typeof globalThis & { __runnerStore?: Store };

export function getStore(): Store {
  // On the global scope for the same reason as the run bus: Next reloads route
  // bundles independently in dev, and a module-level singleton becomes one
  // handle per bundle on the same WAL file.
  return (globalStore.__runnerStore ??= new Store(process.env.RUNNER_DB));
}
