/**
 * Scheduler — autonomous loop engine.
 *
 * Reads ready tasks from the ControlPlane, dispatches them to the
 * WorkerAdapter, and loops until the project reaches a terminal state
 * (COMPLETE, BLOCKED, or cancelled).
 *
 * Design:
 *   - Single-threaded: one task at a time by default.
 *   - Interruptible: call stop() or send SIGINT/SIGTERM.
 *   - Observable: emits structured events to the control plane.
 *   - Budgeted: respects iteration limits and per-task timeouts.
 *   - Crash-safe: state is persisted after every transition.
 */

import { EventEmitter } from 'node:events';
import { WorkerAdapter } from './worker.mjs';

export class Scheduler extends EventEmitter {
  /**
   * @param {import('./control-plane.mjs').ControlPlane} plane
   * @param {object} [options]
   * @param {number} [options.maxIterations=100]      Total task limit
   * @param {number} [options.pollIntervalMs=1000]    Delay between loop ticks
   * @param {number} [options.taskTimeoutMs=300000]   Per-task timeout
   * @param {boolean} [options.stopOnFail=true]       Halt loop when a task fails
   */
  constructor(plane, options = {}) {
    super();
    this.plane = plane;
    this.worker = new WorkerAdapter(plane, {
      timeout: options.taskTimeoutMs,
    });
    this.maxIterations = options.maxIterations ?? 100;
    this.pollIntervalMs = options.pollIntervalMs ?? 1000;
    this.stopOnFail = options.stopOnFail ?? true;

    this._running = false;
    this._timer = null;
    this._iterations = 0;
    this._results = [];
  }

  /**
   * Run the scheduler loop until completion or cancellation.
   *
   * Returns a summary of all task results.
   */
  async run() {
    if (this._running) throw new Error('Scheduler is already running');
    this._running = true;
    this._iterations = 0;
    this._results = [];
    const startTime = Date.now();

    this.emit('scheduler:start', { maxIterations: this.maxIterations });

    try {
      while (this._running && this._iterations < this.maxIterations) {
        const ready = this.plane.readyTasks();

        if (ready.length === 0) {
          // Check terminal states
          const status = this.plane.status();
          if (status.status === 'COMPLETE') {
            this.emit('scheduler:complete', { reason: 'all_tasks_complete' });
            break;
          }
          if (status.status === 'BLOCKED') {
            this.emit('scheduler:complete', { reason: 'blocked_by_failures' });
            break;
          }
          // No tasks ready, no terminal state — wait for external input
          this.emit('scheduler:idle', { ready: 0, status: status.status });
          break;
        }

        // Execute the highest-priority ready task
        const task = ready[0];
        this._iterations++;

        this.emit('scheduler:dispatch', {
          taskId: task.id,
          iteration: this._iterations,
          remaining: ready.length - 1,
        });

        const result = await this.worker.execute(task.id);
        this._results.push(result);

        this.emit('scheduler:result', {
          taskId: task.id,
          success: result.success,
          iteration: this._iterations,
        });

        // Check if we should stop on failure
        if (!result.success && this.stopOnFail) {
          this.emit('scheduler:stop', {
            reason: 'task_failed',
            taskId: task.id,
            error: result.error,
          });
          break;
        }
      }

      // Budget exhausted
      if (this._iterations >= this.maxIterations) {
        this.emit('scheduler:stop', {
          reason: 'budget_exhausted',
          iterations: this._iterations,
        });
      }
    } finally {
      this._running = false;
      if (this._timer) clearTimeout(this._timer);

      const summary = this.getSummary(startTime);
      this.emit('scheduler:done', summary);
      return summary;
    }
  }

  /**
   * Run a single iteration (for manual or step-through mode).
   * Returns the ready task list or empty if nothing to do.
   */
  async step() {
    const ready = this.plane.readyTasks();
    if (ready.length === 0) return { ready: [], executed: null };

    const task = ready[0];
    const result = await this.worker.execute(task.id);
    this._results.push(result);

    return { ready: ready.map((t) => t.id), executed: result };
  }

  /**
   * Gracefully stop the loop after the current iteration.
   */
  stop(reason = 'manual') {
    if (!this._running) return;
    this.emit('scheduler:stopping', { reason });
    this._running = false;
  }

  /** Whether the scheduler is currently running. */
  get isRunning() {
    return this._running;
  }

  /** Total iterations completed in this run. */
  get iterations() {
    return this._iterations;
  }

  /** Results from the most recent run. */
  get results() {
    return [...this._results];
  }

  // ─── Private ──────────────────────────────────────────────────────

  getSummary(startTime) {
    const elapsed = startTime ? Date.now() - startTime : 0;
    const succeeded = this._results.filter((r) => r.success).length;
    const failed = this._results.filter((r) => !r.success).length;

    return {
      iterations: this._iterations,
      succeeded,
      failed,
      elapsed,
      projectStatus: this.plane.status().status,
      results: this._results,
    };
  }
}
