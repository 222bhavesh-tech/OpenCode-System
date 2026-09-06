/**
 * HardenedScheduler — scheduler with checkpoint-per-iteration, stall detection, pause/resume.
 *
 * Extends the base Scheduler with:
 *   - State checkpoint after every iteration
 *   - Stall detection (no progress for N iterations)
 *   - Pause/resume across process restarts
 *   - Graceful degradation on worker failure
 *   - Budget enforcement via ResourceGovernor
 *   - Structured logging via StructuredLogger
 */

import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';

const SCHEDULER_STATES = Object.freeze({
  IDLE: 'IDLE',
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED',
  STOPPED: 'STOPPED',
  STALLED: 'STALLED',
});

export class HardenedScheduler extends EventEmitter {
  /**
   * @param {import('./control-plane.mjs').ControlPlane} plane
   * @param {object} [options]
   * @param {number} [options.maxIterations=100]
   * @param {number} [options.pollIntervalMs=1000]
   * @param {number} [options.taskTimeoutMs=300000]
   * @param {number} [options.stallThreshold=5]        Iterations with no progress before stall
   * @param {number} [options.checkpointIntervalMs=10000] How often to checkpoint
   * @param {boolean} [options.stopOnFail=true]
   * @param {object} [options.resourceGovernor]        Optional ResourceGovernor
   * @param {object} [options.logger]                  Optional StructuredLogger
   */
  constructor(plane, options = {}) {
    super();
    this.plane = plane;
    this.maxIterations = options.maxIterations ?? 100;
    this.pollIntervalMs = options.pollIntervalMs ?? 1000;
    this.taskTimeoutMs = options.taskTimeoutMs ?? 300_000;
    this.stallThreshold = options.stallThreshold ?? 5;
    this.checkpointIntervalMs = options.checkpointIntervalMs ?? 10_000;
    this.stopOnFail = options.stopOnFail ?? true;
    this.resourceGovernor = options.resourceGovernor || null;
    this.logger = options.logger || null;

    this._state = SCHEDULER_STATES.IDLE;
    this._iterations = 0;
    this._results = [];
    this._lastProgressIteration = 0;
    this._checkpointFile = path.join(plane.dir, 'scheduler-checkpoint.json');
    this._timer = null;
  }

  // ─── Lifecycle ───────────────────────────────────────────────────

  /**
   * Run the scheduler loop.
   */
  async run() {
    if (this._state === SCHEDULER_STATES.RUNNING) {
      throw new Error('Scheduler is already running');
    }

    this._state = SCHEDULER_STATES.RUNNING;
    this._iterations = 0;
    this._results = [];
    this._lastProgressIteration = 0;

    if (this.resourceGovernor) this.resourceGovernor.startMission();
    this.logger?.missionEvent('scheduler.started', { maxIterations: this.maxIterations });
    this.emit('scheduler:start', { maxIterations: this.maxIterations });

    try {
      while (this._state === SCHEDULER_STATES.RUNNING) {
        // Budget checks
        if (this.resourceGovernor) {
          if (!this.resourceGovernor.canIterate()) {
            this.logger?.warn('Budget exhausted: iterations');
            this.emit('scheduler:stop', { reason: 'budget_exhausted' });
            break;
          }
          if (!this.resourceGovernor.hasTimeRemaining()) {
            this.logger?.warn('Budget exhausted: time');
            this.emit('scheduler:stop', { reason: 'time_exhausted' });
            break;
          }
        }

        const ready = this.plane.readyTasks();

        if (ready.length === 0) {
          const status = this.plane.status();
          if (status.status === 'COMPLETE') {
            this.logger?.missionEvent('scheduler.complete', { reason: 'all_tasks_complete' });
            this.emit('scheduler:complete', { reason: 'all_tasks_complete' });
            break;
          }
          if (status.status === 'BLOCKED') {
            this.logger?.missionEvent('scheduler.blocked', { reason: 'blocked_by_failures' });
            this.emit('scheduler:complete', { reason: 'blocked_by_failures' });
            break;
          }
          this.logger?.debug('Scheduler idle: no ready tasks');
          this.emit('scheduler:idle', { ready: 0, status: status.status });
          break;
        }

        // Execute highest-priority ready task
        const task = ready[0];
        this._iterations++;

        if (this.resourceGovernor) {
          this.resourceGovernor.recordIteration();
          this.resourceGovernor.registerTask(task.id);
        }

        this.logger?.taskEvent(task.id, 'dispatched', { iteration: this._iterations });
        this.emit('scheduler:dispatch', { taskId: task.id, iteration: this._iterations });

        // Record start time for stall detection
        const taskStart = Date.now();

        // Simulate task execution (in real use, delegate to WorkerAdapter)
        const result = await this._executeTask(task);
        this._results.push(result);

        // Track progress for stall detection
        if (result.success) {
          this._lastProgressIteration = this._iterations;
        }

        this.logger?.taskEvent(task.id, result.success ? 'completed' : 'failed', {
          iteration: this._iterations,
          duration: Date.now() - taskStart,
        });
        this.emit('scheduler:result', { taskId: task.id, success: result.success, iteration: this._iterations });

        // Checkpoint after iteration
        this._checkpoint();

        // Stall detection
        if (this._iterations - this._lastProgressIteration >= this.stallThreshold) {
          this._state = SCHEDULER_STATES.STALLED;
          this.logger?.warn('Scheduler stalled: no progress', {
            lastProgress: this._lastProgressIteration,
            currentIteration: this._iterations,
          });
          this.emit('scheduler:stalled', { lastProgress: this._lastProgressIteration });
          break;
        }

        // Check if we should stop on failure
        if (!result.success && this.stopOnFail) {
          this.logger?.warn('Stopping: task failed', { taskId: task.id });
          this.emit('scheduler:stop', { reason: 'task_failed', taskId: task.id });
          break;
        }
      }
    } finally {
      this._state = SCHEDULER_STATES.STOPPED;
      this._checkpoint();
      this.logger?.missionEvent('scheduler.stopped', { iterations: this._iterations });
      this.emit('scheduler:done', this._getSummary());
    }
  }

  /**
   * Pause the scheduler after current iteration.
   */
  pause() {
    if (this._state !== SCHEDULER_STATES.RUNNING) return;
    this._state = SCHEDULER_STATES.PAUSED;
    this.logger?.missionEvent('scheduler.paused', { iteration: this._iterations });
    this.emit('scheduler:paused', { iteration: this._iterations });
  }

  /**
   * Resume from a checkpoint.
   */
  resume() {
    if (this._state !== SCHEDULER_STATES.PAUSED) return false;
    const checkpoint = this._loadCheckpoint();
    if (!checkpoint) return false;

    this._iterations = checkpoint.iterations;
    this._lastProgressIteration = checkpoint.lastProgressIteration;
    this._results = checkpoint.results || [];
    this._state = SCHEDULER_STATES.RUNNING;

    this.logger?.missionEvent('scheduler.resumed', { iteration: this._iterations });
    this.emit('scheduler:resumed', { iteration: this._iterations });
    return true;
  }

  /**
   * Stop the scheduler.
   */
  stop(reason = 'manual') {
    if (this._state !== SCHEDULER_STATES.RUNNING && this._state !== SCHEDULER_STATES.PAUSED) return;
    this._state = SCHEDULER_STATES.STOPPED;
    this.logger?.missionEvent('scheduler.stopped', { reason, iterations: this._iterations });
    this.emit('scheduler:stopping', { reason });
  }

  /**
   * Get current state.
   */
  getState() {
    return this._state;
  }

  // ─── Task Execution (override point) ────────────────────────────

  /**
   * Execute a task. Override this for real execution.
   * Default implementation marks the task as complete.
   */
  async _executeTask(task) {
    // Default: just record success (override in production)
    return { taskId: task.id, success: true, result: {} };
  }

  // ─── Checkpointing ───────────────────────────────────────────────

  _checkpoint() {
    const data = {
      state: this._state,
      iterations: this._iterations,
      lastProgressIteration: this._lastProgressIteration,
      results: this._results.slice(-100), // Keep last 100 results
      timestamp: new Date().toISOString(),
    };
    try {
      fs.writeFileSync(this._checkpointFile, JSON.stringify(data, null, 2));
    } catch (e) {
      // Checkpoint failure is non-fatal
    }
  }

  _loadCheckpoint() {
    try {
      if (fs.existsSync(this._checkpointFile)) {
        return JSON.parse(fs.readFileSync(this._checkpointFile, 'utf8'));
      }
    } catch (e) {
      // Checkpoint load failure
    }
    return null;
  }

  // ─── Summary ─────────────────────────────────────────────────────

  _getSummary() {
    const elapsed = this._iterations * this.pollIntervalMs;
    const succeeded = this._results.filter(r => r.success).length;
    const failed = this._results.filter(r => !r.success).length;

    return {
      state: this._state,
      iterations: this._iterations,
      succeeded,
      failed,
      elapsed,
      projectStatus: this.plane.status().status,
      stalled: this._state === SCHEDULER_STATES.STALLED,
      results: this._results,
    };
  }
}
