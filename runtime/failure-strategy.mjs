/**
 * FailureStrategy — failure-aware strategy selection.
 *
 * Selects the best strategy based on:
 *   - Failure category (CODE, DEPENDENCY, NETWORK, etc.)
 *   - Failure history (has this been retried?)
 *   - Agent capabilities (which agent can handle this?)
 *   - Budget remaining (time, iterations, cost)
 *
 * Strategy hierarchy:
 *   1. RETRY          — Same agent, same approach (if transient)
 *   2. SWITCH_AGENT   — Different agent, same approach
 *   3. CHANGE_APPROACH — Same agent, different approach
 *   4. SPLIT_TASK     — Break into smaller pieces
 *   5. ESCALATE       — Needs human intervention
 *   6. ABORT          — Mission-level failure
 *
 * Usage:
 *   import { FailureStrategy } from './failure-strategy.mjs';
 *   const strategy = new FailureStrategy(plane);
 *   const decision = strategy.select('task-001', failureRecord);
 */

export const STRATEGY_TYPE = Object.freeze({
  RETRY: 'RETRY',
  SWITCH_AGENT: 'SWITCH_AGENT',
  CHANGE_APPROACH: 'CHANGE_APPROACH',
  SPLIT_TASK: 'SPLIT_TASK',
  ESCALATE: 'ESCALATE',
  ABORT: 'ABORT',
});

// Strategy selection matrix: category → recommended strategies (in priority order)
const STRATEGY_MATRIX = {
  CODE: [
    STRATEGY_TYPE.RETRY,
    STRATEGY_TYPE.CHANGE_APPROACH,
    STRATEGY_TYPE.SWITCH_AGENT,
    STRATEGY_TYPE.SPLIT_TASK,
    STRATEGY_TYPE.ESCALATE,
  ],
  TEST: [
    STRATEGY_TYPE.RETRY,
    STRATEGY_TYPE.CHANGE_APPROACH,
    STRATEGY_TYPE.SWITCH_AGENT,
    STRATEGY_TYPE.ESCALATE,
  ],
  DEPENDENCY: [
    STRATEGY_TYPE.CHANGE_APPROACH,
    STRATEGY_TYPE.RETRY,
    STRATEGY_TYPE.ESCALATE,
  ],
  NETWORK: [
    STRATEGY_TYPE.RETRY,
    STRATEGY_TYPE.RETRY,
    STRATEGY_TYPE.ESCALATE,
  ],
  TIMEOUT: [
    STRATEGY_TYPE.RETRY,
    STRATEGY_TYPE.CHANGE_APPROACH,
    STRATEGY_TYPE.SWITCH_AGENT,
    STRATEGY_TYPE.ESCALATE,
  ],
  SECURITY: [
    STRATEGY_TYPE.ESCALATE,
    STRATEGY_TYPE.ABORT,
  ],
  UNKNOWN: [
    STRATEGY_TYPE.RETRY,
    STRATEGY_TYPE.CHANGE_APPROACH,
    STRATEGY_TYPE.ESCALATE,
  ],
};

// Agent rotation for SWITCH_AGENT strategy
const AGENT_ROTATION = {
  builder: ['coder', 'integrator', 'builder'],
  coder: ['builder', 'integrator', 'coder'],
  integrator: ['builder', 'coder', 'integrator'],
  tester: ['qa', 'reviewer', 'tester'],
  qa: ['tester', 'reviewer', 'qa'],
  reviewer: ['qa', 'tester', 'reviewer'],
};

export class FailureStrategy {
  /**
   * @param {import('./control-plane.mjs').ControlPlane} plane
   * @param {object} [options]
   * @param {number} [options.maxRetriesBeforeEscalate=3]
   * @param {number} [options.maxRetriesBeforeAbort=5]
   * @param {number} [options.budgetWarningThreshold=0.2]
   */
  constructor(plane, options = {}) {
    this.plane = plane;
    this.maxRetriesBeforeEscalate = options.maxRetriesBeforeEscalate ?? 3;
    this.maxRetriesBeforeAbort = options.maxRetriesBeforeAbort ?? 5;
    this.budgetWarningThreshold = options.budgetWarningThreshold ?? 0.2;
  }

  /**
   * Select the best strategy for a failed task.
   *
   * @param {string} taskId
   * @param {object} failure — { category, cause, attemptedFixes }
   * @returns {{ strategy, reason, params, confidence }}
   */
  select(taskId, failure) {
    const state = this.plane.load();
    const task = state.tasks[taskId];
    if (!task) throw new Error(`Unknown task: ${taskId}`);

    const category = failure.category || 'UNKNOWN';
    const history = this._getFailureHistory(taskId, state);
    const budget = this._getBudgetStatus(state);

    // Get strategy options for this category
    const strategies = STRATEGY_MATRIX[category] || STRATEGY_MATRIX.UNKNOWN;

    // Try each strategy in priority order
    for (const strategy of strategies) {
      const result = this._evaluateStrategy(strategy, task, history, budget, failure);
      if (result.viable) {
        return {
          strategy,
          reason: result.reason,
          params: result.params,
          confidence: result.confidence,
          history,
          budget,
        };
      }
    }

    // All strategies exhausted — escalate
    return {
      strategy: STRATEGY_TYPE.ESCALATE,
      reason: 'All recovery strategies exhausted',
      params: {},
      confidence: 0.1,
      history,
      budget,
    };
  }

  /**
   * Get failure statistics for a task.
   *
   * @param {string} taskId
   * @returns {object}
   */
  getStats(taskId) {
    const state = this.plane.load();
    const failures = state.failures.filter((f) => f.taskId === taskId);

    const categories = {};
    for (const f of failures) {
      categories[f.category] = (categories[f.category] || 0) + 1;
    }

    return {
      totalFailures: failures.length,
      categories,
      mostCommon: Object.entries(categories).sort((a, b) => b[1] - a[1])[0]?.[0] || 'NONE',
      lastFailure: failures[failures.length - 1] || null,
    };
  }

  // ─── Private ──────────────────────────────────────────────────────

  _evaluateStrategy(strategy, task, history, budget, failure) {
    switch (strategy) {
      case STRATEGY_TYPE.RETRY:
        return this._evalRetry(task, history, budget);

      case STRATEGY_TYPE.SWITCH_AGENT:
        return this._evalSwitchAgent(task, history, budget);

      case STRATEGY_TYPE.CHANGE_APPROACH:
        return this._evalChangeApproach(task, history, budget);

      case STRATEGY_TYPE.SPLIT_TASK:
        return this._evalSplitTask(task, history, budget);

      case STRATEGY_TYPE.ESCALATE:
        return this._evalEscalate(task, history, budget);

      case STRATEGY_TYPE.ABORT:
        return this._evalAbort(task, history, budget);

      default:
        return { viable: false, reason: 'Unknown strategy' };
    }
  }

  _evalRetry(task, history, budget) {
    if (task.status === 'FAILED') {
      return { viable: false, reason: 'Task already FAILED (retries exhausted by ControlPlane)' };
    }
    if (history.totalFailures >= this.maxRetriesBeforeAbort) {
      return { viable: false, reason: 'Max retries exceeded' };
    }
    if (budget.remaining < this.budgetWarningThreshold) {
      return { viable: false, reason: 'Budget too low for retry' };
    }
    return {
      viable: true,
      reason: `Retry attempt ${history.totalFailures + 1} (transient failure assumed)`,
      params: { sameAgent: true, sameApproach: true },
      confidence: Math.max(0.2, 0.8 - history.totalFailures * 0.15),
    };
  }

  _evalSwitchAgent(task, history, budget) {
    const currentAgent = task.specialist || 'builder';
    const rotation = AGENT_ROTATION[currentAgent] || ['builder'];
    const nextAgent = rotation.find((a) => a !== currentAgent) || rotation[0];

    if (history.totalFailures >= this.maxRetriesBeforeEscalate) {
      return { viable: false, reason: 'Too many failures for agent switch' };
    }

    return {
      viable: true,
      reason: `Switch from ${currentAgent} to ${nextAgent} (different perspective)`,
      params: { newAgent: nextAgent, sameApproach: true },
      confidence: 0.5,
    };
  }

  _evalChangeApproach(task, history, budget) {
    if (history.totalFailures >= this.maxRetriesBeforeEscalate) {
      return { viable: false, reason: 'Too many failures for approach change' };
    }
    return {
      viable: true,
      reason: `Change approach (previous: ${history.mostCommonFailure})`,
      params: { sameAgent: true, newApproach: true },
      confidence: 0.4,
    };
  }

  _evalSplitTask(task, history, budget) {
    if (task.dependencies?.length > 0) {
      return { viable: false, reason: 'Cannot split task with dependencies' };
    }
    if (history.totalFailures < 2) {
      return { viable: false, reason: 'Too few failures to justify splitting' };
    }
    return {
      viable: true,
      reason: `Split task into smaller pieces (failed ${history.totalFailures} times)`,
      params: { splitCount: 2 },
      confidence: 0.35,
    };
  }

  _evalEscalate(task, history, budget) {
    return {
      viable: true,
      reason: `Escalate to human (failures: ${history.totalFailures}, budget: ${(budget.remaining * 100).toFixed(0)}%)`,
      params: { escalateTo: 'commander' },
      confidence: 0.9,
    };
  }

  _evalAbort(task, history, budget) {
    if (task.priority !== 'CRITICAL') {
      return { viable: false, reason: 'Non-critical task should not abort mission' };
    }
    return {
      viable: true,
      reason: `Abort mission (critical task ${task.id} failed ${history.totalFailures} times)`,
      params: { abortReason: 'critical_task_failure' },
      confidence: 0.1,
    };
  }

  _getFailureHistory(taskId, state) {
    const failures = state.failures.filter((f) => f.taskId === taskId);
    const categories = {};
    for (const f of failures) {
      categories[f.category] = (categories[f.category] || 0) + 1;
    }

    return {
      totalFailures: failures.length,
      categories,
      mostCommonFailure: Object.entries(categories).sort((a, b) => b[1] - a[1])[0]?.[0] || 'NONE',
      lastFailureAt: failures.length > 0 ? failures[failures.length - 1].createdAt : null,
    };
  }

  _getBudgetStatus(state) {
    const iterations = state.budgets?.iterations || 100;
    const events = state.events?.length || 0;
    return {
      iterations,
      events,
      remaining: Math.max(0, 1 - events / iterations),
    };
  }
}
