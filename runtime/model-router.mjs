import { EventEmitter } from 'node:events';

const TASK_COMPLEXITY = Object.freeze({ SIMPLE: 'SIMPLE', MODERATE: 'MODERATE', COMPLEX: 'COMPLEX' });

class ModelRouter extends EventEmitter {
  constructor(options) {
    super();
    options = options || {};
    this.primaryProvider = options.primaryProvider || 'opencode-native';
    this.fallbackProvider = options.fallbackProvider || 'omniroute';
    this.routingTable = new Map();
    this.performance = new Map();
    this._registerDefaults();
  }

  _registerDefaults() {
    this.routingTable.set('planning', { provider: this.primaryProvider, complexity: TASK_COMPLEXITY.COMPLEX });
    this.routingTable.set('coding', { provider: this.primaryProvider, complexity: TASK_COMPLEXITY.MODERATE });
    this.routingTable.set('review', { provider: this.primaryProvider, complexity: TASK_COMPLEXITY.MODERATE });
    this.routingTable.set('lightweight', { provider: this.primaryProvider, complexity: TASK_COMPLEXITY.SIMPLE });
    this.routingTable.set('testing', { provider: this.primaryProvider, complexity: TASK_COMPLEXITY.SIMPLE });
    this.routingTable.set('research', { provider: this.primaryProvider, complexity: TASK_COMPLEXITY.COMPLEX });
  }

  /**
   * Route a task to the best provider.
   */
  route(taskType, options) {
    options = options || {};
    const entry = this.routingTable.get(taskType) || this.routingTable.get('lightweight');
    const perf = this.performance.get(entry.provider);
    let confidence = 0.5;
    if (perf && perf.samples > 5) {
      confidence = perf.successRate;
    }
    return {
      provider: entry.provider,
      complexity: entry.complexity,
      confidence: confidence,
      fallback: this.fallbackProvider,
      reason: perf ? 'Historical success rate: ' + Math.round(perf.successRate * 100) + '%' : 'Default routing (no history)',
    };
  }

  /**
   * Record routing outcome.
   */
  recordOutcome(provider, outcome) {
    if (!this.performance.has(provider)) {
      this.performance.set(provider, { samples: 0, successes: 0, totalDuration: 0 });
    }
    const perf = this.performance.get(provider);
    perf.samples++;
    if (outcome.success) perf.successes++;
    perf.totalDuration += outcome.duration || 0;
    perf.successRate = perf.samples > 0 ? perf.successes / perf.samples : 0;
    perf.avgDuration = perf.samples > 0 ? perf.totalDuration / perf.samples : 0;
  }

  /**
   * Get routing recommendations.
   */
  getRecommendations() {
    const recs = [];
    for (const [taskType, entry] of this.routingTable) {
      recs.push({ taskType, provider: entry.provider, complexity: entry.complexity });
    }
    return recs;
  }

  /**
   * Get performance stats.
   */
  stats() {
    const stats = {};
    for (const [provider, perf] of this.performance) {
      stats[provider] = { samples: perf.samples, successRate: Math.round(perf.successRate * 100) / 100, avgDuration: Math.round(perf.avgDuration) };
    }
    return { primaryProvider: this.primaryProvider, fallbackProvider: this.fallbackProvider, performance: stats };
  }
}

export { TASK_COMPLEXITY, ModelRouter };