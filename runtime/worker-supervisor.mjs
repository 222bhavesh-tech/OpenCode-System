/**
 * WorkerSupervisor — lifecycle management, heartbeat, dead/hung detection.
 *
 * Tracks every worker execution with:
 *   - PID tracking (for shell processes)
 *   - Heartbeat monitoring (for long-running tasks)
 *   - Dead/hung/silent detection
 *   - Recovery hierarchy (retry → fail → escalate)
 *   - Orphan prevention (cleanup on exit)
 *
 * Integrates with ControlPlane for state persistence.
 */

import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

const WORKER_STATES = Object.freeze({
  IDLE: 'IDLE',
  RUNNING: 'RUNNING',
  HUNG: 'HUNG',
  DEAD: 'DEAD',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
});

export class WorkerSupervisor extends EventEmitter {
  /**
   * @param {import('./control-plane.mjs').ControlPlane} plane
   * @param {object} [options]
   * @param {number} [options.heartbeatIntervalMs=5000]   How often to check worker health
   * @param {number} [options.heartbeatTimeoutMs=30000]   Worker considered hung after this
   * @param {number} [options.maxConsecutiveFailures=3]   Worker marked dead after this many failures
   * @param {number} [options.orphanCleanupIntervalMs=60000] How often to check for orphans
   */
  constructor(plane, options = {}) {
    super();
    this.plane = plane;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 5000;
    this.heartbeatTimeoutMs = options.heartbeatTimeoutMs ?? 30000;
    this.maxConsecutiveFailures = options.maxConsecutiveFailures ?? 3;
    this.orphanCleanupIntervalMs = options.orphanCleanupIntervalMs ?? 60000;

    this._workers = new Map(); // workerId → WorkerRecord
    this._heartbeatTimer = null;
    this._orphanTimer = null;
    this._pidRegistry = new Map(); // pid → workerId
  }

  // ─── Worker Lifecycle ────────────────────────────────────────────

  /**
   * Register a new worker.
   * Returns a workerId for tracking.
   */
  register(taskId, options = {}) {
    const workerId = `worker-${crypto.randomUUID().slice(0, 12)}`;
    const record = {
      id: workerId,
      taskId,
      state: WORKER_STATES.IDLE,
      pid: options.pid || null,
      createdAt: Date.now(),
      lastHeartbeat: Date.now(),
      lastStateChange: Date.now(),
      consecutiveFailures: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      timeout: options.timeout ?? 300_000,
      metadata: options.metadata || {},
    };

    this._workers.set(workerId, record);

    if (record.pid) {
      this._pidRegistry.set(record.pid, workerId);
    }

    this.emit('worker:registered', { workerId, taskId });
    return workerId;
  }

  /**
   * Mark a worker as running.
   */
  start(workerId) {
    const record = this._getWorker(workerId);
    this._setState(record, WORKER_STATES.RUNNING);
    record.lastHeartbeat = Date.now();
    this.emit('worker:started', { workerId });
    return record;
  }

  /**
   * Send a heartbeat from a worker.
   */
  heartbeat(workerId) {
    const record = this._getWorker(workerId);
    record.lastHeartbeat = Date.now();
    if (record.state === WORKER_STATES.HUNG) {
      this._setState(record, WORKER_STATES.RUNNING);
      this.emit('worker:recovered', { workerId });
    }
    return record;
  }

  /**
   * Mark a worker as completed.
   */
  complete(workerId) {
    const record = this._getWorker(workerId);
    record.state = WORKER_STATES.COMPLETED;
    record.lastStateChange = Date.now();
    record.totalSuccesses++;
    this._cleanupWorker(record);
    this.emit('worker:completed', { workerId });
    return record;
  }

  /**
   * Mark a worker as failed.
   */
  fail(workerId, error = {}) {
    const record = this._getWorker(workerId);
    record.state = WORKER_STATES.FAILED;
    record.lastStateChange = Date.now();
    record.consecutiveFailures++;
    record.totalFailures++;
    record.lastError = { message: error.message, category: error.category, at: Date.now() };
    this._cleanupWorker(record);
    this.emit('worker:failed', { workerId, error, consecutiveFailures: record.consecutiveFailures });

    // Check if worker should be marked dead
    if (record.consecutiveFailures >= this.maxConsecutiveFailures) {
      record.state = WORKER_STATES.DEAD;
      this.emit('worker:dead', { workerId, consecutiveFailures: record.consecutiveFailures });
    }

    return record;
  }

  // ─── Health Monitoring ───────────────────────────────────────────

  /**
   * Start the heartbeat monitoring loop.
   */
  startMonitoring() {
    if (this._heartbeatTimer) return;

    this._heartbeatTimer = setInterval(() => {
      this._checkWorkerHealth();
    }, this.heartbeatIntervalMs);

    this._orphanTimer = setInterval(() => {
      this._cleanupOrphans();
    }, this.orphanCleanupIntervalMs);

    this.emit('monitoring:started');
  }

  /**
   * Stop the monitoring loop.
   */
  stopMonitoring() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
    if (this._orphanTimer) {
      clearInterval(this._orphanTimer);
      this._orphanTimer = null;
    }
    this.emit('monitoring:stopped');
  }

  /**
   * Get health status of all workers.
   */
  health() {
    const workers = Array.from(this._workers.values());
    return {
      total: workers.length,
      idle: workers.filter(w => w.state === WORKER_STATES.IDLE).length,
      running: workers.filter(w => w.state === WORKER_STATES.RUNNING).length,
      hung: workers.filter(w => w.state === WORKER_STATES.HUNG).length,
      dead: workers.filter(w => w.state === WORKER_STATES.DEAD).length,
      completed: workers.filter(w => w.state === WORKER_STATES.COMPLETED).length,
      failed: workers.filter(w => w.state === WORKER_STATES.FAILED).length,
      workers: workers.map(w => ({
        id: w.id,
        taskId: w.taskId,
        state: w.state,
        pid: w.pid,
        uptime: Date.now() - w.createdAt,
        lastHeartbeatAgo: Date.now() - w.lastHeartbeat,
        consecutiveFailures: w.consecutiveFailures,
      })),
    };
  }

  /**
   * Get a specific worker record.
   */
  getWorker(workerId) {
    return this._getWorker(workerId);
  }

  /**
   * Check if a PID is still alive.
   */
  isPidAlive(pid) {
    try {
      process.kill(pid, 0); // Signal 0 = check existence only
      return true;
    } catch (e) {
      return false;
    }
  }

  // ─── Internal ────────────────────────────────────────────────────

  _getWorker(workerId) {
    const record = this._workers.get(workerId);
    if (!record) throw new Error(`Unknown worker ${workerId}`);
    return record;
  }

  _setState(record, newState) {
    const oldState = record.state;
    record.state = newState;
    record.lastStateChange = Date.now();
    this.emit('worker:stateChanged', { workerId: record.id, from: oldState, to: newState });
  }

  _checkWorkerHealth() {
    const now = Date.now();
    for (const record of this._workers.values()) {
      if (record.state !== WORKER_STATES.RUNNING) continue;

      const timeSinceHeartbeat = now - record.lastHeartbeat;

      // Check if hung
      if (timeSinceHeartbeat > this.heartbeatTimeoutMs) {
        this._setState(record, WORKER_STATES.HUNG);
        this.emit('worker:hung', {
          workerId: record.id,
          taskId: record.taskId,
          lastHeartbeatAgo: timeSinceHeartbeat,
        });
        continue;
      }

      // Check if timeout exceeded
      const uptime = now - record.createdAt;
      if (uptime > record.timeout) {
        this._setState(record, WORKER_STATES.HUNG);
        this.emit('worker:timeout', {
          workerId: record.id,
          taskId: record.taskId,
          uptime,
          timeout: record.timeout,
        });
      }

      // Check PID liveness (for shell processes)
      if (record.pid && !this.isPidAlive(record.pid)) {
        this._setState(record, WORKER_STATES.DEAD);
        this.emit('worker:pidDead', {
          workerId: record.id,
          taskId: record.taskId,
          pid: record.pid,
        });
      }
    }
  }

  _cleanupOrphans() {
    const now = Date.now();
    for (const [workerId, record] of this._workers) {
      // Remove completed/failed workers older than 1 hour
      if ((record.state === WORKER_STATES.COMPLETED || record.state === WORKER_STATES.FAILED) &&
          (now - record.lastStateChange) > 3600_000) {
        this._workers.delete(workerId);
        if (record.pid) this._pidRegistry.delete(record.pid);
      }
    }
  }

  _cleanupWorker(record) {
    // Don't remove PID tracking immediately — let orphan cleanup handle it
  }
}
