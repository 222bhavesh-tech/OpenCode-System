import { EventEmitter } from 'node:events';

const STALL_TYPE = Object.freeze({
  IDLE: 'IDLE',
  RETRY_LOOP: 'RETRY_LOOP',
  BLOCKED_DEPENDENCY: 'BLOCKED_DEPENDENCY',
  NO_PROGRESS: 'NO_PROGRESS',
  WAITING_APPROVAL: 'WAITING_APPROVAL',
  RESOURCE_EXHAUSTED: 'RESOURCE_EXHAUSTED',
});

class StallDetector extends EventEmitter {
  constructor(options) {
    super();
    options = options || {};
    this.idleThreshold = options.idleThreshold || 60000;
    this.maxRetries = options.maxRetries || 5;
    this.maxNoProgress = options.maxNoProgress || 3;
    this.taskStates = new Map();
  }

  /**
   * Track a task state.
   */
  trackTask(taskId, state) {
    if (!this.taskStates.has(taskId)) {
      this.taskStates.set(taskId, { id: taskId, states: [], retries: 0, lastProgress: Date.now(), stallType: null, detectedAt: null });
    }
    const ts = this.taskStates.get(taskId);
    ts.states.push({ ...state, timestamp: Date.now() });
    if (state.progress) ts.lastProgress = Date.now();
    if (state.status === 'RETRY') ts.retries++;
    this._detectStall(ts);
    return ts;
  }

  /**
   * Get stall status for a task.
   */
  getStallStatus(taskId) {
    const ts = this.taskStates.get(taskId);
    if (!ts) return { stalled: false };
    return { stalled: ts.stallType !== null, stallType: ts.stallType, detectedAt: ts.detectedAt, retries: ts.retries, idleDuration: Date.now() - ts.lastProgress };
  }

  /**
   * Get all stalled tasks.
   */
  getStalledTasks() {
    return [...this.taskStates.values()].filter(t => t.stallType !== null).map(t => ({ id: t.id, stallType: t.stallType, detectedAt: t.detectedAt, retries: t.retries }));
  }

  /**
   * Clear a stall.
   */
  clearStall(taskId) {
    const ts = this.taskStates.get(taskId);
    if (ts) { ts.stallType = null; ts.detectedAt = null; ts.retries = 0; }
    return ts;
  }

  _detectStall(ts) {
    const idleTime = Date.now() - ts.lastProgress;
    if (idleTime > this.idleThreshold) {
      ts.stallType = STALL_TYPE.IDLE;
      ts.detectedAt = Date.now();
      this.emit('stall:detected', { taskId: ts.id, type: STALL_TYPE.IDLE });
      return;
    }
    if (ts.retries >= this.maxRetries) {
      ts.stallType = STALL_TYPE.RETRY_LOOP;
      ts.detectedAt = Date.now();
      this.emit('stall:detected', { taskId: ts.id, type: STALL_TYPE.RETRY_LOOP });
      return;
    }
    const recentStates = ts.states.slice(-this.maxNoProgress);
    if (recentStates.length >= this.maxNoProgress && recentStates.every(s => !s.progress)) {
      ts.stallType = STALL_TYPE.NO_PROGRESS;
      ts.detectedAt = Date.now();
      this.emit('stall:detected', { taskId: ts.id, type: STALL_TYPE.NO_PROGRESS });
      return;
    }
  }

  reset() { this.taskStates.clear(); }
}

export { STALL_TYPE, StallDetector };