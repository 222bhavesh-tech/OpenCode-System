/**
 * DecisionEngine — inspects mission state and determines next action.
 *
 * The DecisionEngine is the brain of the autonomous loop.
 * It reads the full project state and outputs a structured decision.
 *
 * Possible decisions:
 *   EXECUTE_TASK    — A task is ready, dispatch it
 *   PARALLELIZE     — Multiple independent tasks ready, run concurrently
 *   WAIT            — No tasks ready, nothing to do
 *   VERIFY          — Task completed, needs verification
 *   RETRY           — Failed task, retry with same strategy
 *   CHANGE_STRATEGY — Failed task, try different approach
 *   REPLAN          — Assumptions invalid, rebuild DAG
 *   RECOVER         — System needs recovery action
 *   CHECKPOINT      — Save state for resilience
 *   ESCALATE        — Cannot proceed, needs human input
 *   STOP            — Mission should stop
 *   COMPLETE        — All tasks done, all evidence passes
 *
 * The engine is DETERMINISTIC at the control-plane level.
 * Every decision produces a structured event.
 *
 * Usage:
 *   import { DecisionEngine } from './decision-engine.mjs';
 *   const engine = new DecisionEngine(plane);
 *   const decision = await engine.decide();
 */

import { EventEmitter } from 'node:events';

export const DECISION_TYPE = Object.freeze({
  EXECUTE_TASK: 'EXECUTE_TASK',
  PARALLELIZE: 'PARALLELIZE',
  WAIT: 'WAIT',
  VERIFY: 'VERIFY',
  RETRY: 'RETRY',
  CHANGE_STRATEGY: 'CHANGE_STRATEGY',
  REPLAN: 'REPLAN',
  RECOVER: 'RECOVER',
  CHECKPOINT: 'CHECKPOINT',
  ESCALATE: 'ESCALATE',
  STOP: 'STOP',
  COMPLETE: 'COMPLETE',
});

export class DecisionEngine extends EventEmitter {
  /**
   * @param {import('./control-plane.mjs').ControlPlane} plane
   * @param {object} [options]
   * @param {number} [options.maxFailuresBeforeReplan=3]
   * @param {number} [options.maxRetriesBeforeStrategyChange=2]
   * @param {number} [options.checkpointInterval=10] — Checkpoint every N iterations
   * @param {number} [options.stallThresholdMs=120000] — Time before declaring stall
   */
  constructor(plane, options = {}) {
    super();
    this.plane = plane;
    this.maxFailuresBeforeReplan = options.maxFailuresBeforeReplan ?? 3;
    this.maxRetriesBeforeStrategyChange = options.maxRetriesBeforeStrategyChange ?? 2;
    this.checkpointInterval = options.checkpointInterval ?? 10;
    this.stallThresholdMs = options.stallThresholdMs ?? 120_000;

    this._iterationCount = 0;
    this._lastDecisionTime = Date.now();
    this._decisions = [];
  }

  /**
   * Analyze current state and produce a decision.
   *
   * @returns {{ type, taskId?, reason, context, budgetRemaining, timestamp }}
   */
  async decide() {
    const state = this.plane.load();
    const status = this.plane.status();
    const ready = this.plane.readyTasks();
    const allTasks = Object.values(state.tasks);

    this._iterationCount++;

    // 1. Check mission terminal states
    if (status.status === 'COMPLETE') {
      return this._emit(DECISION_TYPE.COMPLETE, {
        reason: 'All tasks complete with passing evidence',
        context: { taskCounts: status.taskCounts },
      });
    }

    // 2. Check if blocked
    if (status.status === 'BLOCKED') {
      const blockedTasks = allTasks.filter((t) => t.status === 'FAILED');
      const shouldReplan = this._shouldReplan(state, blockedTasks);

      if (shouldReplan) {
        return this._emit(DECISION_TYPE.REPLAN, {
          reason: `${blockedTasks.length} tasks failed with exhausted retries`,
          context: { blockedTasks: blockedTasks.map((t) => t.id) },
        });
      }

      return this._emit(DECISION_TYPE.ESCALATE, {
        reason: 'Project blocked, requires human intervention',
        context: { blockedTasks: blockedTasks.map((t) => t.id) },
      });
    }

    // 3. Check budget
    if (this._iterationCount >= (state.budgets?.iterations || 100)) {
      return this._emit(DECISION_TYPE.STOP, {
        reason: 'Iteration budget exhausted',
        context: { iterations: this._iterationCount, budget: state.budgets?.iterations },
      });
    }

    // 4. Check for tasks needing verification
    const inProgressTasks = allTasks.filter((t) => t.status === 'IN_PROGRESS');
    if (inProgressTasks.length > 0) {
      // Check if any have been running too long (stall detection)
      const stalled = this._detectStall(state, inProgressTasks);
      if (stalled) {
        return this._emit(DECISION_TYPE.RECOVER, {
          taskId: stalled.id,
          reason: `Task ${stalled.id} appears stalled (no state change for ${this.stallThresholdMs}ms)`,
          context: { taskId: stalled.id, lastUpdate: stalled.updatedAt },
        });
      }

      // Tasks are running, wait
      return this._emit(DECISION_TYPE.WAIT, {
        reason: `${inProgressTasks.length} task(s) in progress`,
        context: { inProgress: inProgressTasks.map((t) => t.id) },
      });
    }

    // 5. Check if ready tasks exist
    if (ready.length === 0) {
      // No ready tasks and no in-progress — check if we're stuck
      const failedTasks = allTasks.filter((t) => t.status === 'FAILED');
      if (failedTasks.length > 0) {
        return this._emit(DECISION_TYPE.RECOVER, {
          reason: 'No ready tasks but failed tasks exist',
          context: { failed: failedTasks.map((t) => t.id) },
        });
      }

      return this._emit(DECISION_TYPE.WAIT, {
        reason: 'No ready tasks and no failures',
        context: { pending: allTasks.filter((t) => t.status === 'PENDING').length },
      });
    }

    // 6. Check for checkpoint opportunity
    if (this._iterationCount > 0 && this._iterationCount % this.checkpointInterval === 0) {
      return this._emit(DECISION_TYPE.CHECKPOINT, {
        reason: `Checkpoint interval reached (every ${this.checkpointInterval} iterations)`,
        context: { iteration: this._iterationCount },
      });
    }

    // 7. Check if tasks can be parallelized
    if (ready.length > 1) {
      const parallelizable = this._checkParallelizable(ready, state);
      if (parallelizable.length > 1) {
        return this._emit(DECISION_TYPE.PARALLELIZE, {
          reason: `${parallelizable.length} independent tasks ready for parallel execution`,
          taskIds: parallelizable.map((t) => t.id),
          context: { total: ready.length, parallelizable: parallelizable.length },
        });
      }
    }

    // 8. Execute the highest-priority ready task
    const task = ready[0];
    const failureHistory = this._analyzeFailures(state, task.id);

    if (failureHistory.totalFailures > 0) {
      if (failureHistory.sameStrategyCount >= this.maxRetriesBeforeStrategyChange) {
        return this._emit(DECISION_TYPE.CHANGE_STRATEGY, {
          taskId: task.id,
          reason: `Task failed ${failureHistory.sameStrategyCount} times with same strategy`,
          context: failureHistory,
        });
      }
    }

    return this._emit(DECISION_TYPE.EXECUTE_TASK, {
      taskId: task.id,
      reason: `Task ${task.id} is ready (priority: ${task.priority}, attempt: ${task.attempts + 1})`,
      context: {
        priority: task.priority,
        attempt: task.attempts + 1,
        dependencies: task.dependencies.length,
      },
    });
  }

  /**
   * Get the full decision history.
   * @returns {Array}
   */
  get history() {
    return [...this._decisions];
  }

  /**
   * Get the last decision.
   * @returns {object|null}
   */
  get lastDecision() {
    return this._decisions[this._decisions.length - 1] || null;
  }

  /**
   * Reset the engine state (for new mission).
   */
  reset() {
    this._iterationCount = 0;
    this._lastDecisionTime = Date.now();
    this._decisions = [];
  }

  // ─── Private ──────────────────────────────────────────────────────

  _emit(type, { taskId, reason, context, taskIds } = {}) {
    const decision = {
      type,
      taskId: taskId || null,
      taskIds: taskIds || (taskId ? [taskId] : []),
      reason: reason || '',
      context: context || {},
      iteration: this._iterationCount,
      budgetRemaining: Math.max(0, 100 - this._iterationCount),
      timestamp: new Date().toISOString(),
    };

    this._decisions.push(decision);
    this._lastDecisionTime = Date.now();
    this.emit('decision:made', decision);

    return decision;
  }

  _shouldReplan(state, blockedTasks) {
    // Replan if:
    // 1. More than maxFailuresBeforeReplan tasks are blocked
    // 2. AND no pending/in-progress tasks remain
    if (blockedTasks.length < this.maxFailuresBeforeReplan) return false;

    const activeTasks = Object.values(state.tasks).filter(
      (t) => t.status === 'PENDING' || t.status === 'IN_PROGRESS'
    );

    return activeTasks.length === 0;
  }

  _detectStall(state, inProgressTasks) {
    const now = Date.now();
    for (const task of inProgressTasks) {
      const lastUpdate = new Date(task.updatedAt).getTime();
      if (now - lastUpdate > this.stallThresholdMs) {
        return task;
      }
    }
    return null;
  }

  _checkParallelizable(readyTasks, state) {
    // Tasks are parallelizable if they don't share file/resource conflicts
    // For now, use a simple heuristic: all ready tasks are parallelizable
    // unless they have overlapping ownership (future enhancement)
    return readyTasks.filter((t) => t.parallelizable !== false);
  }

  _analyzeFailures(state, taskId) {
    const failures = state.failures.filter((f) => f.taskId === taskId);
    const task = state.tasks[taskId];

    const strategyCounts = {};
    for (const f of failures) {
      const key = f.category;
      strategyCounts[key] = (strategyCounts[key] || 0) + 1;
    }

    const maxSameStrategy = Math.max(0, ...Object.values(strategyCounts));
    const mostCommonStrategy = Object.entries(strategyCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'NONE';

    return {
      totalFailures: failures.length,
      categories: strategyCounts,
      sameStrategyCount: maxSameStrategy,
      mostCommonFailure: mostCommonStrategy,
      attemptedFixes: failures.flatMap((f) => f.attemptedFixes),
    };
  }
}
