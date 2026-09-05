import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { ControlPlane } from './control-plane.mjs';

const MISSION_STATUS = Object.freeze({
  CREATED: 'CREATED',
  DISCOVERING: 'DISCOVERING',
  SPECIFYING: 'SPECIFYING',
  PLANNING: 'PLANNING',
  READY: 'READY',
  EXECUTING: 'EXECUTING',
  VERIFYING: 'VERIFYING',
  REVIEWING: 'REVIEWING',
  COMPLETING: 'COMPLETING',
  COMPLETED: 'COMPLETED',
  PAUSED: 'PAUSED',
  BLOCKED: 'BLOCKED',
  RECOVERING: 'RECOVERING',
  REPLANNING: 'REPLANNING',
  ESCALATED: 'ESCALATED',
  STOPPED: 'STOPPED',
  FAILED: 'FAILED',
});

const MISSION_LIFECYCLE_ORDER = [
  'CREATED', 'DISCOVERING', 'SPECIFYING', 'PLANNING', 'READY',
  'EXECUTING', 'VERIFYING', 'REVIEWING', 'COMPLETING', 'COMPLETED',
];

const TERMINAL_MISSION = new Set(['COMPLETED', 'STOPPED', 'FAILED']);
const ACTIVE_MISSION = new Set(MISSION_LIFECYCLE_ORDER);

const now = () => new Date().toISOString();
const mid = () => 'mission-' + crypto.randomUUID().slice(0, 12);
const uid = (p) => p + '-' + crypto.randomUUID().slice(0, 8);

class MissionEngine extends EventEmitter {
  constructor(projectRoot, options) {
    super();
    options = options || {};
    this.projectRoot = path.resolve(projectRoot);
    this.dir = path.join(this.projectRoot, '.opencode-system');
    this.missionFile = path.join(this.dir, 'mission.json');
    this.plane = new ControlPlane(projectRoot, options);
    this.defaultBudgets = {
      maxTimeMs: options.maxTimeMs || 3600000,
      maxTokens: options.maxTokens || 100000,
      maxToolCalls: options.maxToolCalls || 500,
      maxIterations: options.maxIterations || 100,
      maxWorkers: options.maxWorkers || 5,
      maxRetriesPerTask: options.maxRetriesPerTask || 3,
      maxContextSize: options.maxContextSize || 50000,
      maxMemoryEntries: options.maxMemoryEntries || 5000,
    };
  }

  createMission({ objective, requirements, acceptanceCriteria, mode, budgets }) {
    const missionId = mid();
    const mission = {
      missionId: missionId,
      objective: objective,
      requirements: requirements || [],
      acceptanceCriteria: acceptanceCriteria || [],
      mode: mode || 'ASSISTED',
      status: MISSION_STATUS.CREATED,
      createdAt: now(),
      startedAt: null,
      updatedAt: now(),
      completedAt: null,
      budget: Object.assign({}, this.defaultBudgets, budgets || {}),
      spent: { timeMs: 0, tokens: 0, toolCalls: 0, iterations: 0, workers: 0, retries: 0 },
      tasks: {},
      milestones: [],
      activeWorkers: [],
      blockers: [],
      evidence: [],
      failures: [],
      decisions: [],
      checkpoints: [],
      history: [],
      phase: null,
      currentTask: null,
    };
    this._save(mission);
    this._event(mission, 'mission.created', { objective: objective });
    return mission;
  }

  loadMission() {
    if (!fs.existsSync(this.missionFile)) return null;
    return JSON.parse(fs.readFileSync(this.missionFile, 'utf8'));
  }

  loadOrCreate({ objective, requirements, acceptanceCriteria, mode, budgets }) {
    let mission = this.loadMission();
    if (!mission) {
      mission = this.createMission({ objective: objective, requirements: requirements, acceptanceCriteria: acceptanceCriteria, mode: mode, budgets: budgets });
    }
    return mission;
  }

  transition(mission, newStatus) {
    const old = mission.status;
    mission.status = newStatus;
    mission.updatedAt = now();
    if (newStatus === MISSION_STATUS.EXECUTING && !mission.startedAt) mission.startedAt = now();
    if (TERMINAL_MISSION.has(newStatus)) mission.completedAt = now();
    mission.history.push({ from: old, to: newStatus, at: now() });
    this._event(mission, 'mission.transition', { from: old, to: newStatus });
    this._save(mission);
    return mission;
  }

  addTask(mission, taskInput) {
    const task = this.plane.addTask(taskInput);
    mission.tasks[task.id] = { taskId: task.id, addedAt: now() };
    this._event(mission, 'mission.task-added', { taskId: task.id });
    this._save(mission);
    return task;
  }

  addMilestone(mission, milestone) {
    const m = { id: uid('ms'), title: milestone.title, criteria: milestone.criteria || [], completed: false, completedAt: null };
    mission.milestones.push(m);
    this._save(mission);
    return m;
  }

  completeMilestone(mission, milestoneId) {
    const ms = mission.milestones.find(function(m) { return m.id === milestoneId; });
    if (ms) { ms.completed = true; ms.completedAt = now(); }
    this._save(mission);
    return ms;
  }

  checkBudget(mission) {
    const b = mission.budget;
    const s = mission.spent;
    const violations = [];
    if (s.timeMs >= b.maxTimeMs) violations.push('TIME');
    if (s.tokens >= b.maxTokens) violations.push('TOKENS');
    if (s.toolCalls >= b.maxToolCalls) violations.push('TOOL_CALLS');
    if (s.iterations >= b.maxIterations) violations.push('ITERATIONS');
    if (Object.keys(mission.tasks).length > 0 && s.retries >= (b.maxRetriesPerTask * Object.keys(mission.tasks).length)) violations.push('RETRIES');
    return { withinBudget: violations.length === 0, violations: violations, spent: Object.assign({}, s), budget: Object.assign({}, b) };
  }

  recordFailure(mission, failure) {
    const f = { id: uid('fail'), taskId: failure.taskId, category: failure.category || 'UNKNOWN', rootCause: failure.rootCause || '', strategy: failure.strategy || '', attempt: failure.attempt || 1, affectedFiles: failure.affectedFiles || [], evidence: failure.evidence || '', resolution: failure.resolution || '', prevention: failure.prevention || '', timestamp: now() };
    mission.failures.push(f);
    mission.spent.retries++;
    this._event(mission, 'mission.failure', { failureId: f.id, taskId: failure.taskId, category: f.category });
    this._save(mission);
    return f;
  }

  recordDecision(mission, decision) {
    const d = { id: uid('dec'), type: decision.type, reason: decision.reason || '', taskId: decision.taskId || null, agent: decision.agent || null, timestamp: now() };
    mission.decisions.push(d);
    this._save(mission);
    return d;
  }

  addBlocker(mission, blocker) {
    const b = { id: uid('blk'), description: blocker.description, taskId: blocker.taskId || null, severity: blocker.severity || 'HIGH', createdAt: now(), resolvedAt: null };
    mission.blockers.push(b);
    this._event(mission, 'mission.blocker', { blockerId: b.id, severity: b.severity });
    this._save(mission);
    return b;
  }

  resolveBlocker(mission, blockerId) {
    const b = mission.blockers.find(function(blk) { return blk.id === blockerId; });
    if (b) { b.resolvedAt = now(); }
    this._save(mission);
    return b;
  }

  recordEvidence(mission, evidence) {
    const e = { id: uid('ev'), taskId: evidence.taskId, type: evidence.type, verdict: evidence.verdict, summary: evidence.summary || '', artifacts: evidence.artifacts || [], timestamp: now() };
    mission.evidence.push(e);
    this._event(mission, 'mission.evidence', { evidenceId: e.id, verdict: e.verdict });
    this._save(mission);
    return e;
  }

  saveCheckpoint(mission) {
    const cp = { id: uid('cp'), snapshot: JSON.parse(JSON.stringify(mission)), timestamp: now() };
    mission.checkpoints.push(cp);
    this._save(mission);
    return cp;
  }

  getStats(mission) {
    const tasks = Object.values(mission.tasks);
    const cp = this.plane;
    const state = cp.load();
    const taskStats = { total: tasks.length, completed: 0, running: 0, ready: 0, blocked: 0, failed: 0 };
    for (const tk of Object.values(state.tasks)) {
      if (tk.status === 'COMPLETE') taskStats.completed++;
      else if (tk.status === 'IN_PROGRESS') taskStats.running++;
      else if (tk.status === 'BLOCKED') taskStats.blocked++;
      else if (tk.status === 'FAILED') taskStats.failed++;
    }
    const ready = cp.readyTasks();
    taskStats.ready = ready.length;
    const budget = this.checkBudget(mission);
    const msCompleted = mission.milestones.filter(function(m) { return m.completed; }).length;
    return {
      missionId: mission.missionId,
      status: mission.status,
      objective: mission.objective,
      progress: taskStats.total > 0 ? Math.round((taskStats.completed / taskStats.total) * 100) : 0,
      tasks: taskStats,
      milestones: { total: mission.milestones.length, completed: msCompleted },
      budget: budget,
      failures: mission.failures.length,
      evidence: mission.evidence.length,
      blockers: mission.blockers.filter(function(b) { return !b.resolvedAt; }).length,
      workers: mission.activeWorkers.length,
      decisions: mission.decisions.length,
      uptime: mission.startedAt ? Date.now() - new Date(mission.startedAt).getTime() : 0,
    };
  }

  isComplete(mission) {
    return TERMINAL_MISSION.has(mission.status);
  }

  canContinue(mission) {
    if (TERMINAL_MISSION.has(mission.status)) return false;
    var budget = this.checkBudget(mission);
    if (!budget.withinBudget) return false;
    var unresolvedBlockers = mission.blockers.filter(function(b) { return !b.resolvedAt; });
    if (unresolvedBlockers.length > 0) return false;
    return true;
  }

  _event(mission, type, data) {
    var evt = { type: type, timestamp: now(), data: data || {} };
    mission.history.push(evt);
    this.emit(type, evt);
  }

  _save(mission) {
    mission.updatedAt = now();
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(this.missionFile, JSON.stringify(mission, null, 2));
  }
}

export { MISSION_STATUS, MISSION_LIFECYCLE_ORDER, TERMINAL_MISSION, MissionEngine };