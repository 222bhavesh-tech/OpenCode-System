/**
 * AgentRuntime — manages agent lifecycle and ownership.
 *
 * Every worker has:
 *   workerId, taskId, role, status, startTime, timeout,
 *   budget, permissions, owned files, execution session, result receipt
 *
 * Workers support: start, pause, resume, cancel, timeout, fail, complete
 * Workers never directly mark a mission complete.
 *
 * Usage:
 *   import { AgentRuntime } from './agent-runtime.mjs';
 *   const runtime = new AgentRuntime(plane);
 *   const worker = runtime.spawn('task-001', 'builder', { timeout: 60000 });
 *   const result = await runtime.execute(worker.workerId);
 */

import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import { WorkerAdapter } from './worker.mjs';
import { ContextResolver } from './context-resolver.mjs';

const WORKER_STATUS = Object.freeze({
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  TIMED_OUT: 'TIMED_OUT',
});

export { WORKER_STATUS };

export class AgentRuntime extends EventEmitter {
  /**
   * @param {import('./control-plane.mjs').ControlPlane} plane
   * @param {object} [options]
   * @param {number} [options.defaultTimeout=300000]
   * @param {number} [options.maxConcurrent=3]
   */
  constructor(plane, options = {}) {
    super();
    this.plane = plane;
    this.worker = new WorkerAdapter(plane, { timeout: options.defaultTimeout });
    this.contextResolver = new ContextResolver(plane);
    this.defaultTimeout = options.defaultTimeout ?? 300_000;
    this.maxConcurrent = options.maxConcurrent ?? 3;

    this._workers = new Map(); // workerId → WorkerState
    this._taskWorkers = new Map(); // taskId → workerId
    this._ownedFiles = new Map(); // workerId → string[]
  }

  /**
   * Spawn a new worker for a task.
   *
   * @param {string} taskId
   * @param {string} role — Agent role (builder, tester, reviewer, etc.)
   * @param {object} [options] — { timeout, budget, permissions }
   * @returns {{ workerId, taskId, role, status }}
   */
  spawn(taskId, role, options = {}) {
    if (this._taskWorkers.has(taskId)) {
      throw new Error(`Task ${taskId} already has a worker: ${this._taskWorkers.get(taskId)}`);
    }

    const workerId = `worker-${crypto.randomUUID().slice(0, 8)}`;
    const state = {
      workerId,
      taskId,
      role,
      status: WORKER_STATUS.PENDING,
      startTime: null,
      timeout: options.timeout ?? this.defaultTimeout,
      budget: options.budget ?? null,
      permissions: options.permissions ?? ['read', 'write', 'execute'],
      ownedFiles: [],
      context: null,
      receipt: null,
      error: null,
    };

    this._workers.set(workerId, state);
    this._taskWorkers.set(taskId, workerId);

    this.emit('worker:spawned', { workerId, taskId, role });
    return { workerId, taskId, role, status: state.status };
  }

  /**
   * Execute a worker's task.
   *
   * @param {string} workerId
   * @returns {{ workerId, taskId, success, result, receipt }}
   */
  async execute(workerId) {
    const state = this._workers.get(workerId);
    if (!state) throw new Error(`Unknown worker: ${workerId}`);
    if (state.status !== WORKER_STATUS.PENDING) {
      throw new Error(`Worker ${workerId} is ${state.status}, cannot execute`);
    }

    // Check concurrent limit
    const running = [...this._workers.values()].filter(
      (w) => w.status === WORKER_STATUS.RUNNING
    ).length;
    if (running >= this.maxConcurrent) {
      throw new Error(`Max concurrent workers (${this.maxConcurrent}) reached`);
    }

    // Start execution
    state.status = WORKER_STATUS.RUNNING;
    state.startTime = Date.now();
    state.context = this.contextResolver.resolve(state.taskId);

    this.emit('worker:started', { workerId, taskId: state.taskId, role: state.role });

    // Set up timeout
    const timeoutId = setTimeout(() => {
      if (state.status === WORKER_STATUS.RUNNING) {
        state.status = WORKER_STATUS.TIMED_OUT;
        state.error = 'Worker timed out';
        this.emit('worker:timeout', { workerId, taskId: state.taskId });
      }
    }, state.timeout);

    try {
      // Execute through WorkerAdapter
      const result = await this.worker.execute(state.taskId, {
        agent: state.role,
        kind: state.context.task.kind,
        command: state.context.task.command,
        timeout: state.timeout,
      });

      clearTimeout(timeoutId);

      if (state.status === WORKER_STATUS.TIMED_OUT) {
        return { workerId, taskId: state.taskId, success: false, error: 'Timed out' };
      }

      // Build receipt
      state.receipt = {
        workerId,
        taskId: state.taskId,
        role: state.role,
        success: result.success,
        duration: Date.now() - state.startTime,
        timestamp: new Date().toISOString(),
        evidence: result.evidence || [],
        error: result.error || null,
        category: result.category || null,
      };

      state.status = result.success ? WORKER_STATUS.COMPLETED : WORKER_STATUS.FAILED;
      state.error = result.error || null;

      this.emit('worker:done', {
        workerId,
        taskId: state.taskId,
        success: result.success,
        duration: state.receipt.duration,
      });

      return { workerId, taskId: state.taskId, success: result.success, result, receipt: state.receipt };
    } catch (error) {
      clearTimeout(timeoutId);
      state.status = WORKER_STATUS.FAILED;
      state.error = error.message;
      state.receipt = {
        workerId,
        taskId: state.taskId,
        role: state.role,
        success: false,
        duration: Date.now() - state.startTime,
        timestamp: new Date().toISOString(),
        evidence: [],
        error: error.message,
      };

      this.emit('worker:failed', { workerId, taskId: state.taskId, error: error.message });
      return { workerId, taskId: state.taskId, success: false, error: error.message, receipt: state.receipt };
    }
  }

  /**
   * Cancel a running worker.
   *
   * @param {string} workerId
   * @param {string} [reason]
   */
  cancel(workerId, reason = 'manual') {
    const state = this._workers.get(workerId);
    if (!state) throw new Error(`Unknown worker: ${workerId}`);

    if (state.status === WORKER_STATUS.COMPLETED || state.status === WORKER_STATUS.CANCELLED) {
      return; // Already done
    }

    state.status = WORKER_STATUS.CANCELLED;
    state.error = `Cancelled: ${reason}`;
    this._taskWorkers.delete(state.taskId);

    this.emit('worker:cancelled', { workerId, taskId: state.taskId, reason });
  }

  /**
   * Get worker state.
   *
   * @param {string} workerId
   * @returns {object|null}
   */
  getWorker(workerId) {
    return this._workers.get(workerId) || null;
  }

  /**
   * Get worker for a task.
   *
   * @param {string} taskId
   * @returns {object|null}
   */
  getWorkerByTask(taskId) {
    const workerId = this._taskWorkers.get(taskId);
    return workerId ? this._workers.get(workerId) : null;
  }

  /**
   * List all workers and their status.
   *
   * @returns {Array}
   */
  listWorkers() {
    return [...this._workers.values()].map((w) => ({
      workerId: w.workerId,
      taskId: w.taskId,
      role: w.role,
      status: w.status,
      startTime: w.startTime,
      duration: w.startTime ? Date.now() - w.startTime : 0,
      error: w.error,
    }));
  }

  /**
   * Get runtime statistics.
   *
   * @returns {{ total, running, completed, failed, cancelled }}
   */
  stats() {
    const workers = [...this._workers.values()];
    return {
      total: workers.length,
      running: workers.filter((w) => w.status === WORKER_STATUS.RUNNING).length,
      completed: workers.filter((w) => w.status === WORKER_STATUS.COMPLETED).length,
      failed: workers.filter((w) => w.status === WORKER_STATUS.FAILED).length,
      cancelled: workers.filter((w) => w.status === WORKER_STATUS.CANCELLED).length,
      timedOut: workers.filter((w) => w.status === WORKER_STATUS.TIMED_OUT).length,
    };
  }

  /**
   * Reset runtime (for new mission).
   */
  reset() {
    this._workers.clear();
    this._taskWorkers.clear();
    this._ownedFiles.clear();
  }
}
