/**
 * ResourceGovernor — budget enforcement, resource tracking, cost control.
 *
 * Enforces limits on:
 *   - Total mission budget (iterations, time, cost)
 *   - Per-task budgets (timeout, retries, tokens)
 *   - Per-worker budgets (concurrent tasks, memory)
 *   - Global resource pools (parallel agents, network connections)
 *
 * Integrates with MissionEconomics for cost tracking and AutonomyGovernor
 * for policy enforcement.
 */

import { EventEmitter } from 'node:events';

const BUDGET_TYPES = Object.freeze({
  ITERATIONS: 'iterations',
  TIME: 'time',
  COST: 'cost',
  RETRIES: 'retries',
  CONCURRENT: 'concurrent',
  TOKENS: 'tokens',
});

export class ResourceGovernor extends EventEmitter {
  /**
   * @param {object} [options]
   * @param {object} [options.mission]         Mission-level budgets
   * @param {number} [options.mission.iterations=100]
   * @param {number} [options.mission.timeMs=3600000]    1 hour default
   * @param {number} [options.mission.costCents=500]     $5 default
   * @param {number} [options.mission.retriesPerTask=3]
   * @param {number} [options.mission.maxConcurrent=1]
   * @param {object} [options.task]            Per-task defaults
   * @param {number} [options.task.timeoutMs=300000]     5 minutes
   * @param {number} [options.task.retries=3]
   * @param {number} [options.task.tokens=50000]
   */
  constructor(options = {}) {
    super();

    this.mission = {
      iterations: { max: options.mission?.iterations ?? 100, used: 0 },
      time: { max: options.mission?.timeMs ?? 3_600_000, startedAt: null },
      cost: { max: options.mission?.costCents ?? 500, used: 0 },
      retries: { maxPerTask: options.mission?.retriesPerTask ?? 3 },
      concurrent: { max: options.mission?.maxConcurrent ?? 1, active: 0 },
    };

    this.task = {
      timeoutMs: options.task?.timeoutMs ?? 300_000,
      retries: options.task?.retries ?? 3,
      tokens: options.task?.tokens ?? 50_000,
    };

    this._startTime = null;
    this._taskBudgets = new Map(); // taskId → { iterations, time, cost, tokens }
    this._violations = [];
  }

  // ─── Mission-Level Checks ───────────────────────────────────────

  /**
   * Start tracking mission time.
   */
  startMission() {
    this._startTime = Date.now();
    this.mission.time.startedAt = this._startTime;
    this.emit('mission:started', { at: this._startTime });
  }

  /**
   * Check if a new iteration is allowed.
   */
  canIterate() {
    const allowed = this.mission.iterations.used < this.mission.iterations.max;
    if (!allowed) {
      this._recordViolation(BUDGET_TYPES.ITERATIONS, 'Mission iteration limit reached');
    }
    return allowed;
  }

  /**
   * Record an iteration.
   */
  recordIteration() {
    this.mission.iterations.used++;
    this.emit('iteration:recorded', { used: this.mission.iterations.used, max: this.mission.iterations.max });

    if (this.mission.iterations.used >= this.mission.iterations.max * 0.9) {
      this.emit('budget:warning', { type: BUDGET_TYPES.ITERATIONS, pct: (this.mission.iterations.used / this.mission.iterations.max) * 100 });
    }
  }

  /**
   * Check if mission time limit allows continuation.
   */
  hasTimeRemaining() {
    if (!this._startTime) return true;
    const elapsed = Date.now() - this._startTime;
    const allowed = elapsed < this.mission.time.max;
    if (!allowed) {
      this._recordViolation(BUDGET_TYPES.TIME, 'Mission time limit reached');
    }
    return allowed;
  }

  /**
   * Check if mission cost budget allows continuation.
   */
  canSpend(cents) {
    const allowed = (this.mission.cost.used + cents) <= this.mission.cost.max;
    if (!allowed) {
      this._recordViolation(BUDGET_TYPES.COST, `Spending $${(cents / 100).toFixed(2)} would exceed budget`);
    }
    return allowed;
  }

  /**
   * Record cost.
   */
  recordCost(cents) {
    this.mission.cost.used += cents;
    this.emit('cost:recorded', { cents, total: this.mission.cost.used, max: this.mission.cost.max });

    if (this.mission.cost.used >= this.mission.cost.max * 0.9) {
      this.emit('budget:warning', { type: BUDGET_TYPES.COST, pct: (this.mission.cost.used / this.mission.cost.max) * 100 });
    }
  }

  /**
   * Check if we can start a new concurrent task.
   */
  canStartConcurrent() {
    const allowed = this.mission.concurrent.active < this.mission.concurrent.max;
    if (!allowed) {
      this._recordViolation(BUDGET_TYPES.CONCURRENT, 'Max concurrent tasks reached');
    }
    return allowed;
  }

  /**
   * Register a concurrent task start.
   */
  registerConcurrentStart() {
    this.mission.concurrent.active++;
    this.emit('concurrent:started', { active: this.mission.concurrent.active, max: this.mission.concurrent.max });
  }

  /**
   * Register a concurrent task end.
   */
  registerConcurrentEnd() {
    this.mission.concurrent.active = Math.max(0, this.mission.concurrent.active - 1);
    this.emit('concurrent:ended', { active: this.mission.concurrent.active });
  }

  // ─── Per-Task Budgets ───────────────────────────────────────────

  /**
   * Register a task and apply per-task budgets.
   */
  registerTask(taskId, options = {}) {
    this._taskBudgets.set(taskId, {
      retries: { max: options.retries ?? this.task.retries, used: 0 },
      time: { max: options.timeoutMs ?? this.task.timeoutMs, startedAt: null },
      tokens: { max: options.tokens ?? this.task.tokens, used: 0 },
    });
    return this._taskBudgets.get(taskId);
  }

  /**
   * Check if a task can be retried.
   */
  canRetry(taskId) {
    const budget = this._taskBudgets.get(taskId);
    if (!budget) return true; // No budget = unlimited
    const allowed = budget.retries.used < budget.retries.max;
    if (!allowed) {
      this._recordViolation(BUDGET_TYPES.RETRIES, `Task ${taskId} retry limit reached`);
    }
    return allowed;
  }

  /**
   * Record a retry for a task.
   */
  recordRetry(taskId) {
    const budget = this._taskBudgets.get(taskId);
    if (budget) {
      budget.retries.used++;
      this.emit('retry:recorded', { taskId, used: budget.retries.used, max: budget.retries.max });
    }
  }

  /**
   * Check if a task has time remaining.
   */
  taskHasTime(taskId) {
    const budget = this._taskBudgets.get(taskId);
    if (!budget || !budget.time.startedAt) return true;
    const elapsed = Date.now() - budget.time.startedAt;
    return elapsed < budget.time.max;
  }

  /**
   * Record task start time.
   */
  recordTaskStart(taskId) {
    const budget = this._taskBudgets.get(taskId);
    if (budget) {
      budget.time.startedAt = Date.now();
    }
  }

  /**
   * Record token usage for a task.
   */
  recordTokens(taskId, count) {
    const budget = this._taskBudgets.get(taskId);
    if (budget) {
      budget.tokens.used += count;
      if (budget.tokens.used >= budget.tokens.max * 0.9) {
        this.emit('budget:warning', { type: BUDGET_TYPES.TOKENS, taskId, pct: (budget.tokens.used / budget.tokens.max) * 100 });
      }
    }
  }

  // ─── Overall Status ──────────────────────────────────────────────

  /**
   * Get current budget status.
   */
  status() {
    const elapsed = this._startTime ? Date.now() - this._startTime : 0;
    return {
      mission: {
        iterations: { used: this.mission.iterations.used, max: this.mission.iterations.max },
        time: { elapsed, max: this.mission.time.max, remaining: Math.max(0, this.mission.time.max - elapsed) },
        cost: { used: this.mission.cost.used, max: this.mission.cost.max },
        concurrent: { active: this.mission.concurrent.active, max: this.mission.concurrent.max },
      },
      tasks: Array.from(this._taskBudgets.entries()).map(([taskId, b]) => ({
        taskId,
        retries: { used: b.retries.used, max: b.retries.max },
        time: { startedAt: b.time.startedAt, max: b.time.max },
        tokens: { used: b.tokens.used, max: b.tokens.max },
      })),
      violations: this._violations.length,
      violationsRecent: this._violations.slice(-10),
    };
  }

  /**
   * Get a summary of all violations.
   */
  violations() {
    return [...this._violations];
  }

  // ─── Internal ────────────────────────────────────────────────────

  _recordViolation(type, message) {
    const violation = { type, message, at: Date.now() };
    this._violations.push(violation);
    this.emit('budget:violation', violation);
  }
}
