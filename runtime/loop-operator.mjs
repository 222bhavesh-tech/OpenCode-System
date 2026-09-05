/**
 * LoopOperator — autonomous scheduler wrapper with monitoring and recovery.
 *
 * Extends the Scheduler with:
 *   - Stall detection
 *   - Failure pattern recognition
 *   - Adaptive recovery (retry → escalate → skip → replan)
 *   - Budget enforcement
 *   - Structured event reporting
 *
 * Usage:
 *   import { LoopOperator } from './loop-operator.mjs';
 *   const loop = new LoopOperator(plane, { maxIterations: 50 });
 *   const result = await loop.run();
 */

import { EventEmitter } from 'node:events';
import { Scheduler } from './scheduler.mjs';

export class LoopOperator extends EventEmitter {
  /**
   * @param {import('./control-plane.mjs').ControlPlane} plane
   * @param {object} [options]
   * @param {number} [options.maxIterations=100]
   * @param {number} [options.taskTimeoutMs=300000]
   * @param {number} [options.stallThresholdMs=60000] — Time before declaring a stall
   * @param {number} [options.maxRetriesPerTask=3]
   * @param {number} [options.maxFailures=10] — Total failures before abort
   * @param {boolean} [options.stopOnFail=false] — Let recovery handle failures
   */
  constructor(plane, options = {}) {
    super();
    this.plane = plane;
    this.options = {
      maxIterations: options.maxIterations ?? 100,
      taskTimeoutMs: options.taskTimeoutMs ?? 300_000,
      stallThresholdMs: options.stallThresholdMs ?? 60_000,
      maxRetriesPerTask: options.maxRetriesPerTask ?? 3,
      maxFailures: options.maxFailures ?? 10,
      stopOnFail: options.stopOnFail ?? false,
    };

    this.scheduler = new Scheduler(plane, {
      maxIterations: this.options.maxIterations,
      taskTimeoutMs: this.options.taskTimeoutMs,
      stopOnFail: false, // We handle failures ourselves
      pollIntervalMs: 500,
    });

    this._running = false;
    this._failureCounts = new Map(); // taskId → count
    this._taskStartTimes = new Map(); // taskId → startTime
    this._totalFailures = 0;
    this._recoveryActions = [];
  }

  /**
   * Run the autonomous loop.
   *
   * @returns {{ iterations, succeeded, failed, recovered, aborted, recoveryActions, elapsed }}
   */
  async run() {
    if (this._running) throw new Error('LoopOperator is already running');
    this._running = true;
    const startTime = Date.now();

    this.emit('loop:start', { maxIterations: this.options.maxIterations });

    // Wire up scheduler events
    this.scheduler.on('scheduler:dispatch', (e) => this._onDispatch(e));
    this.scheduler.on('scheduler:result', (e) => this._onResult(e));
    this.scheduler.on('scheduler:idle', (e) => this._onIdle(e));
    this.scheduler.on('scheduler:stop', (e) => this._onStop(e));

    try {
      const summary = await this.scheduler.run();
      const elapsed = Date.now() - startTime;

      const result = {
        iterations: summary.iterations,
        succeeded: summary.succeeded,
        failed: summary.failed,
        recovered: this._recoveryActions.filter((a) => a.type === 'recovery').length,
        aborted: this._totalFailures >= this.options.maxFailures,
        recoveryActions: this._recoveryActions,
        elapsed,
        projectStatus: summary.projectStatus,
      };

      this.emit('loop:complete', result);
      return result;
    } catch (error) {
      this.emit('loop:abort', { reason: error.message });
      throw error;
    } finally {
      this._running = false;
    }
  }

  /**
   * Run a single step (for manual control).
   */
  async step() {
    const result = await this.scheduler.step();
    if (result.executed && !result.executed.success) {
      await this._handleFailure(result.executed);
    }
    return result;
  }

  /**
   * Stop the loop gracefully.
   */
  stop(reason = 'manual') {
    this._running = false;
    this.scheduler.stop(reason);
    this.emit('loop:stop', { reason });
  }

  get isRunning() {
    return this._running;
  }

  // ─── Event Handlers ──────────────────────────────────────────────

  _onDispatch(e) {
    this._taskStartTimes.set(e.taskId, Date.now());
    this.emit('loop:iteration', e);
  }

  _onResult(e) {
    const startTime = this._taskStartTimes.get(e.taskId);
    const duration = startTime ? Date.now() - startTime : 0;
    this._taskStartTimes.delete(e.taskId);

    if (e.success) {
      this._failureCounts.delete(e.taskId);
      this.emit('loop:task-done', { ...e, duration });
    } else {
      this._failureCounts.set(e.taskId, (this._failureCounts.get(e.taskId) || 0) + 1);
      this._totalFailures++;
      this.emit('loop:task-fail', { ...e, duration, failureCount: this._failureCounts.get(e.taskId) });
    }
  }

  _onIdle(e) {
    this.emit('loop:stall', e);
  }

  _onStop(e) {
    if (e.reason === 'task_failed') {
      this._handleFailureSync(e);
    }
  }

  // ─── Recovery ────────────────────────────────────────────────────

  async _handleFailure(executionResult) {
    const { taskId, error, category, attempts } = executionResult;
    const failureCount = this._failureCounts.get(taskId) || 0;

    // Check abort condition
    if (this._totalFailures >= this.options.maxFailures) {
      const action = { type: 'abort', taskId, reason: `Max failures (${this.options.maxFailures}) reached` };
      this._recoveryActions.push(action);
      this.emit('loop:abort', action);
      this.stop('max_failures');
      return;
    }

    // Recovery hierarchy
    if (failureCount < this.options.maxRetriesPerTask) {
      // RETRY
      const action = { type: 'recovery', taskId, strategy: 'retry', attempt: failureCount + 1, category };
      this._recoveryActions.push(action);
      this.emit('loop:recovery', action);
      // Task is already retried by control plane (retries > 0)
    } else if (failureCount === this.options.maxRetriesPerTask) {
      // ESCALATE — mark as needing different approach
      const action = { type: 'recovery', taskId, strategy: 'escalate', category };
      this._recoveryActions.push(action);
      this.emit('loop:recovery', action);
    } else {
      // SKIP — too many failures
      const action = { type: 'recovery', taskId, strategy: 'skip', reason: `${failureCount} failures` };
      this._recoveryActions.push(action);
      this.emit('loop:recovery', action);
    }
  }

  _handleFailureSync(e) {
    this._recoveryActions.push({
      type: 'recovery',
      taskId: e.taskId,
      strategy: 'scheduler-stop',
      reason: e.reason,
    });
  }
}
