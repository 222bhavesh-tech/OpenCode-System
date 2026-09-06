import { EventEmitter } from 'node:events';

class OscillationGuard extends EventEmitter {
  constructor(options) {
    super();
    options = options || {};
    this.windowSize = options.windowSize || 10;
    this.repeatThreshold = options.repeatThreshold || 3;
    this.changeHistory = new Map();
    this.detectedOscillations = [];
  }

  /**
   * Record a state change.
   */
  recordChange(taskId, change) {
    if (!this.changeHistory.has(taskId)) this.changeHistory.set(taskId, []);
    const history = this.changeHistory.get(taskId);
    history.push({ ...change, timestamp: Date.now() });
    if (history.length > this.windowSize) history.splice(0, history.length - this.windowSize);
    return this._detectOscillation(taskId, history);
  }

  /**
   * Check if a task is oscillating.
   */
  isOscillating(taskId) {
    const history = this.changeHistory.get(taskId) || [];
    return this._detectOscillation(taskId, history);
  }

  /**
   * Get detected oscillations.
   */
  getOscillations() {
    return this.detectedOscillations;
  }

  /**
   * Get change history for a task.
   */
  getHistory(taskId) {
    return this.changeHistory.get(taskId) || [];
  }

  _detectOscillation(taskId, history) {
    if (history.length < 4) return false;
    const values = history.map(h => JSON.stringify(h.value));
    let oscillationCount = 0;
    for (let i = 2; i < values.length; i++) {
      if (values[i] === values[i - 2] && values[i] !== values[i - 1]) oscillationCount++;
    }
    const isOscillating = oscillationCount >= this.repeatThreshold;
    if (isOscillating) {
      this.detectedOscillations.push({ taskId, detectedAt: Date.now(), windowSize: history.length, oscillationCount, values: values.slice(-5) });
      this.emit('oscillation:detected', { taskId, oscillationCount });
    }
    return isOscillating;
  }

  reset() { this.changeHistory.clear(); this.detectedOscillations = []; }
}

export { OscillationGuard };