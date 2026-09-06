import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const TASK_STATUS = Object.freeze({
  PENDING: 'PENDING', IN_PROGRESS: 'IN_PROGRESS', BLOCKED: 'BLOCKED',
  COMPLETE: 'COMPLETE', FAILED: 'FAILED', CANCELLED: 'CANCELLED'
});
const TERMINAL = new Set([TASK_STATUS.COMPLETE, TASK_STATUS.CANCELLED]);
const ACTIVE = new Set([TASK_STATUS.PENDING, TASK_STATUS.IN_PROGRESS, TASK_STATUS.BLOCKED, TASK_STATUS.FAILED]);
const now = () => new Date().toISOString();
const id = (prefix) => `${prefix}-${crypto.randomUUID()}`;

export class ControlPlaneError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export class ControlPlane {
  constructor(projectRoot, options = {}) {
    this.projectRoot = path.resolve(projectRoot);
    this.dir = path.join(this.projectRoot, '.opencode-system');
    this.stateFile = path.join(this.dir, 'state.json');
    this.maxRetries = options.maxRetries ?? 3;
    this._cache = null;
    this._cacheTime = 0;
  }

  initialize({ goal, mode = 'ASSISTED', budgets = {} }) {
    if (fs.existsSync(this.stateFile)) throw new ControlPlaneError('ALREADY_INITIALIZED', `State already exists at ${this.stateFile}`);
    fs.mkdirSync(this.dir, { recursive: true });
    const state = {
      version: 1, projectId: id('project'), goal, mode,
      createdAt: now(), updatedAt: now(), status: 'PLANNING',
      budgets: { iterations: 100, retriesPerTask: this.maxRetries, parallelAgents: 1, ...budgets },
      tasks: {}, events: [], failures: [], evidence: [], checkpoints: [], decisions: []
    };
    this._event(state, 'project.initialized', { goal, mode });
    this._write(state);
    return state;
  }

  load() {
    if (this._cache) return this._cache;
    if (!fs.existsSync(this.stateFile)) throw new ControlPlaneError('NOT_INITIALIZED', `No project state at ${this.stateFile}; run init first.`);
    const state = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
    this._validate(state);
    this._cache = state;
    return state;
  }

  addTask(input) {
    const state = this.load();
    // Preserve custom fields (kind, command, path, content, timeout, etc.)
    const { id: _id, title: _title, description: _desc, priority: _pri, dependencies: _deps,
      parallelizable: _par, specialist: _spec, acceptanceCriteria: _ac, requiredEvidence: _re,
      ...customFields } = input;
    const task = {
      ...customFields,
      id: input.id || id('task'), title: input.title, description: input.description || '',
      priority: input.priority || 'MEDIUM', dependencies: [...new Set(input.dependencies || [])],
      parallelizable: input.parallelizable ?? true, specialist: input.specialist || 'builder',
      acceptanceCriteria: input.acceptanceCriteria || [], requiredEvidence: input.requiredEvidence || ['test'],
      status: TASK_STATUS.PENDING, attempts: 0, assignedTo: null, createdAt: now(), updatedAt: now(),
      result: null
    };
    if (!task.title) throw new ControlPlaneError('INVALID_TASK', 'Task title is required.');
    if (state.tasks[task.id]) throw new ControlPlaneError('DUPLICATE_TASK', `Task ${task.id} already exists.`);
    for (const dependency of task.dependencies) if (!state.tasks[dependency]) throw new ControlPlaneError('UNKNOWN_DEPENDENCY', `Task ${task.id} depends on unknown task ${dependency}.`);
    state.tasks[task.id] = task;
    this._ensureAcyclic(state);
    this._event(state, 'task.created', { taskId: task.id, title: task.title });
    this._save(state);
    return task;
  }

  readyTasks() {
    const state = this.load();
    return Object.values(state.tasks)
      .filter((task) => task.status === TASK_STATUS.PENDING && task.dependencies.every((dep) => state.tasks[dep].status === TASK_STATUS.COMPLETE))
      .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || a.createdAt.localeCompare(b.createdAt));
  }

  startTask(taskId, agent = 'commander') {
    const state = this.load(); const task = this._task(state, taskId);
    if (task.status !== TASK_STATUS.PENDING) throw new ControlPlaneError('INVALID_TRANSITION', `Cannot start ${taskId} from ${task.status}.`);
    if (!task.dependencies.every((dep) => state.tasks[dep].status === TASK_STATUS.COMPLETE)) throw new ControlPlaneError('DEPENDENCIES_INCOMPLETE', `Dependencies are incomplete for ${taskId}.`);
    task.status = TASK_STATUS.IN_PROGRESS; task.assignedTo = agent; task.attempts += 1; task.updatedAt = now();
    state.status = 'EXECUTING'; this._event(state, 'task.started', { taskId, agent, attempt: task.attempts }); this._save(state);
    return task;
  }

  recordEvidence(taskId, evidence) {
    const state = this.load(); this._task(state, taskId);
    const item = { id: id('evidence'), taskId, type: evidence.type, verdict: evidence.verdict || 'PASS', summary: evidence.summary || '', location: evidence.location || '', createdAt: now() };
    if (!item.type) throw new ControlPlaneError('INVALID_EVIDENCE', 'Evidence type is required.');
    state.evidence.push(item); this._event(state, 'evidence.recorded', { taskId, evidenceId: item.id, type: item.type, verdict: item.verdict }); this._save(state);
    return item;
  }

  completeTask(taskId, result = {}) {
    const state = this.load(); const task = this._task(state, taskId);
    if (task.status !== TASK_STATUS.IN_PROGRESS) throw new ControlPlaneError('INVALID_TRANSITION', `Cannot complete ${taskId} from ${task.status}.`);
    const evidence = state.evidence.filter((item) => item.taskId === taskId && item.verdict === 'PASS');
    const missing = task.requiredEvidence.filter((type) => !evidence.some((item) => item.type === type));
    if (missing.length) throw new ControlPlaneError('EVIDENCE_REQUIRED', `Cannot complete ${taskId}; missing passing evidence: ${missing.join(', ')}.`);
    task.status = TASK_STATUS.COMPLETE; task.result = result; task.updatedAt = now();
    this._event(state, 'task.completed', { taskId, evidenceCount: evidence.length }); this._updateProjectStatus(state); this._save(state);
    return task;
  }

  failTask(taskId, failure) {
    const state = this.load(); const task = this._task(state, taskId);
    if (!ACTIVE.has(task.status) || TERMINAL.has(task.status)) throw new ControlPlaneError('INVALID_TRANSITION', `Cannot fail ${taskId} from ${task.status}.`);
    const record = { id: id('failure'), taskId, category: failure.category || 'UNKNOWN', cause: failure.cause || '', attemptedFixes: failure.attemptedFixes || [], prevention: failure.prevention || '', createdAt: now() };
    state.failures.push(record); task.updatedAt = now();
    const retries = state.budgets.retriesPerTask ?? this.maxRetries;
    task.status = task.attempts < retries ? TASK_STATUS.PENDING : TASK_STATUS.FAILED;
    this._event(state, 'task.failed', { taskId, failureId: record.id, category: record.category, retryScheduled: task.status === TASK_STATUS.PENDING }); this._updateProjectStatus(state); this._save(state);
    return { task, failure: record };
  }

  checkpoint(summary = '') {
    const state = this.load(); const point = { id: id('checkpoint'), summary, at: now(), stateHash: hash(JSON.stringify({ tasks: state.tasks, evidence: state.evidence, failures: state.failures })) };
    state.checkpoints.push(point); this._event(state, 'checkpoint.saved', { checkpointId: point.id }); this._save(state); return point;
  }

  status() {
    const state = this.load(); const tasks = Object.values(state.tasks); const counts = Object.fromEntries(Object.values(TASK_STATUS).map((status) => [status, tasks.filter((task) => task.status === status).length]));
    return { projectId: state.projectId, goal: state.goal, status: state.status, taskCounts: counts, ready: this.readyTasks().map((task) => task.id), criticalPath: this.criticalPath(state), lastEvent: state.events.at(-1) || null, checkpoints: state.checkpoints.length };
  }

  criticalPath(state = this.load()) {
    const memo = new Map();
    const length = (taskId) => { if (memo.has(taskId)) return memo.get(taskId); const task = state.tasks[taskId]; const value = 1 + Math.max(0, ...task.dependencies.map(length)); memo.set(taskId, value); return value; };
    return Object.keys(state.tasks).sort((a, b) => length(b) - length(a)).map((id) => ({ taskId: id, depth: length(id) }));
  }

  _task(state, taskId) { const task = state.tasks[taskId]; if (!task) throw new ControlPlaneError('UNKNOWN_TASK', `Unknown task ${taskId}.`); return task; }
  _event(state, type, data) { state.events.push({ id: id('event'), at: now(), type, data }); }
  _save(state) { state.updatedAt = now(); this._cache = state; this._write(state); }
  _write(state) { const temp = `${this.stateFile}.tmp`; fs.writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`); fs.renameSync(temp, this.stateFile); }
  _ensureAcyclic(state) { const visiting = new Set(); const visited = new Set(); const visit = (taskId) => { if (visiting.has(taskId)) throw new ControlPlaneError('TASK_CYCLE', `Task graph contains a cycle at ${taskId}.`); if (visited.has(taskId)) return; visiting.add(taskId); for (const dep of state.tasks[taskId].dependencies) visit(dep); visiting.delete(taskId); visited.add(taskId); }; Object.keys(state.tasks).forEach(visit); }
  _validate(state) { if (state.version !== 1 || !state.tasks || !Array.isArray(state.events)) throw new ControlPlaneError('INVALID_STATE', 'Unsupported or corrupt control-plane state.'); this._ensureAcyclic(state); }
  _updateProjectStatus(state) { const tasks = Object.values(state.tasks); if (tasks.some((task) => task.status === TASK_STATUS.FAILED)) state.status = 'BLOCKED'; else if (tasks.length && tasks.every((task) => task.status === TASK_STATUS.COMPLETE)) state.status = 'COMPLETE'; else state.status = 'EXECUTING'; }
}

const priorityRank = (value) => ({ CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }[value] ?? 2);
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
