/**
 * ParallelScheduler — executes multiple independent tasks concurrently.
 *
 * Uses AgentRuntime + ContextResolver + ConflictDetector:
 *   1. Get ready tasks
 *   2. Check for file conflicts
 *   3. Spawn workers for non-conflicting tasks
 *   4. Execute in parallel up to maxConcurrent
 *   5. Collect results
 *   6. Update ControlPlane with evidence
 *
 * Usage:
 *   import { ParallelScheduler } from './parallel-scheduler.mjs';
 *   const scheduler = new ParallelScheduler(plane);
 *   const results = await scheduler.runParallel();
 */

import { EventEmitter } from 'node:events';
import { AgentRuntime, WORKER_STATUS } from './agent-runtime.mjs';
import { ContextResolver } from './context-resolver.mjs';

export class ParallelScheduler extends EventEmitter {
  /**
   * @param {import('./control-plane.mjs').ControlPlane} plane
   * @param {object} [options]
   * @param {number} [options.maxConcurrent=3]
   * @param {number} [options.defaultTimeout=300000]
   * @param {boolean} [options.failFast=false] — Stop on first failure
   */
  constructor(plane, options = {}) {
    super();
    this.plane = plane;
    this.runtime = new AgentRuntime(plane, {
      maxConcurrent: options.maxConcurrent ?? 3,
      defaultTimeout: options.defaultTimeout ?? 300_000,
    });
    this.contextResolver = new ContextResolver(plane);
    this.failFast = options.failFast ?? false;

    this._results = [];
    this._iteration = 0;
  }

  /**
   * Run one parallel batch of ready tasks.
   *
   * @returns {{ executed, results, skipped, conflicts }}
   */
  async runParallel() {
    this._iteration++;
    const state = this.plane.load();
    const ready = this.plane.readyTasks();

    if (ready.length === 0) {
      return { executed: 0, results: [], skipped: [], conflicts: [] };
    }

    // Detect conflicts
    const { conflicts, safe } = this.contextResolver.detectConflicts(ready.map((t) => t.id));

    // Also exclude tasks that are already running
    const running = [...this.runtime._workers.values()]
      .filter((w) => w.status === WORKER_STATUS.RUNNING)
      .map((w) => w.taskId);

    const toExecute = ready
      .filter((t) => safe.includes(t.id) && !running.includes(t.id))
      .slice(0, this.runtime.maxConcurrent);

    const skipped = ready
      .filter((t) => !safe.includes(t.id) || running.includes(t.id))
      .map((t) => t.id);

    this.emit('scheduler:batch', {
      iteration: this._iteration,
      ready: ready.length,
      executing: toExecute.length,
      skipped: skipped.length,
      conflicts: conflicts.length,
    });

    // Spawn and execute workers
    const results = [];
    const promises = [];

    for (const task of toExecute) {
      const { workerId } = this.runtime.spawn(task.id, task.specialist || 'builder', {
        timeout: this._getTimeout(task),
      });

      const promise = this.runtime.execute(workerId).then((result) => {
        results.push(result);

        // Record evidence in ControlPlane
        if (result.success && result.receipt?.evidence) {
          for (const ev of result.receipt.evidence) {
            this.plane.recordEvidence(task.id, ev);
          }
        }

        // Record failure
        if (!result.success) {
          this.plane.recordFailure(task.id, {
            category: result.receipt?.category || 'UNKNOWN',
            cause: result.error || 'Execution failed',
            attemptedFixes: [],
            prevention: '',
          });
        }

        return result;
      });

      promises.push(promise);
    }

    // Wait for all to complete (or fail fast)
    if (this.failFast) {
      try {
        await Promise.all(promises);
      } catch {
        // Cancel remaining on failure
        for (const task of toExecute) {
          const worker = this.runtime.getWorkerByTask(task.id);
          if (worker && worker.status === WORKER_STATUS.RUNNING) {
            this.runtime.cancel(worker.workerId, 'failFast');
          }
        }
      }
    } else {
      await Promise.allSettled(promises);
    }

    this._results.push(...results);

    return {
      executed: toExecute.length,
      results,
      skipped,
      conflicts: conflicts.map((c) => c.file),
    };
  }

  /**
   * Run until no more tasks can be executed.
   *
   * @param {object} [options]
   * @param {number} [options.maxIterations=50]
   * @returns {{ totalResults, iterations }}
   */
  async runUntilComplete(options = {}) {
    const maxIterations = options.maxIterations ?? 50;
    let iterations = 0;

    while (iterations < maxIterations) {
      const { executed, results } = await this.runParallel();

      if (executed === 0) {
        break; // No more tasks to run
      }

      iterations++;

      // Check if mission is complete
      const status = this.plane.status();
      if (status.status === 'COMPLETE' || status.status === 'BLOCKED') {
        break;
      }
    }

    return {
      totalResults: this._results.length,
      iterations,
    };
  }

  /**
   * Get execution statistics.
   *
   * @returns {{ iterations, totalExecuted, successes, failures, avgDuration }}
   */
  stats() {
    const successes = this._results.filter((r) => r.success).length;
    const failures = this._results.filter((r) => !r.success).length;
    const durations = this._results
      .filter((r) => r.receipt?.duration)
      .map((r) => r.receipt.duration);
    const avgDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    return {
      iterations: this._iteration,
      totalExecuted: this._results.length,
      successes,
      failures,
      successRate: this._results.length > 0 ? (successes / this._results.length * 100).toFixed(1) + '%' : 'N/A',
      avgDuration: Math.round(avgDuration),
    };
  }

  /**
   * Reset for new mission.
   */
  reset() {
    this._results = [];
    this._iteration = 0;
    this.runtime.reset();
  }

  // ─── Private ──────────────────────────────────────────────────────

  _getTimeout(task) {
    // Higher priority tasks get more time
    const multipliers = { CRITICAL: 2, HIGH: 1.5, MEDIUM: 1, LOW: 0.75 };
    const base = 300_000; // 5 minutes
    return Math.round(base * (multipliers[task.priority] || 1));
  }
}
