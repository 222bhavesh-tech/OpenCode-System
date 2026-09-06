import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';

class SelfImprovementEngine extends EventEmitter {
  constructor(experienceStore, learningEngine, options) {
    super();
    this.experienceStore = experienceStore;
    this.learningEngine = learningEngine;
    this.improvements = [];
    this.applied = new Map();
    this.minSamples = (options && options.minSamples) || 5;
  }

  /**
   * Analyze and suggest improvements.
   */
  analyze() {
    if (!this.experienceStore) return [];
    const stats = this.experienceStore.stats();
    const recommendations = this.learningEngine ? this.learningEngine.analyze() : [];
    const improvements = [];
    if (stats.successRate < 0.6 && stats.total >= this.minSamples) {
      improvements.push({ id: 'imp-' + crypto.randomUUID().slice(0, 6), type: 'STRATEGY', priority: 'HIGH', recommendation: 'Success rate is below 60%, review and adjust strategies', evidence: 'Overall success rate: ' + Math.round(stats.successRate * 100) + '% across ' + stats.total + ' tasks', timestamp: Date.now() });
    }
    for (const rec of recommendations) {
      if (rec.type === 'STRATEGY_AVOID' && rec.priority === 'HIGH') {
        improvements.push({ id: 'imp-' + crypto.randomUUID().slice(0, 6), type: 'STRATEGY_AVOID', priority: 'HIGH', recommendation: 'Reduce usage of strategy: ' + rec.strategy, evidence: rec.evidence, timestamp: Date.now() });
      }
      if (rec.type === 'AGENT_AVOID') {
        improvements.push({ id: 'imp-' + crypto.randomUUID().slice(0, 6), type: 'AGENT', priority: 'MEDIUM', recommendation: 'Avoid or retrain agent: ' + rec.agentRole, evidence: 'Success rate: ' + Math.round(rec.successRate * 100) + '%', timestamp: Date.now() });
      }
      if (rec.type === 'FAILURE_PATTERN') {
        improvements.push({ id: 'imp-' + crypto.randomUUID().slice(0, 6), type: 'FAILURE_PATTERN', priority: 'MEDIUM', recommendation: 'Add mitigation for failure category: ' + rec.category, evidence: rec.occurrences + ' occurrences', timestamp: Date.now() });
      }
    }
    this.improvements = improvements;
    this.emit('improvement:analyzed', { count: improvements.length });
    return improvements;
  }

  /**
   * Apply an improvement.
   */
  applyImprovement(improvementId) {
    const improvement = this.improvements.find(i => i.id === improvementId);
    if (!improvement) throw new Error('Unknown improvement: ' + improvementId);
    improvement.appliedAt = Date.now();
    this.applied.set(improvementId, improvement);
    this.emit('improvement:applied', { id: improvementId, type: improvement.type });
    return improvement;
  }

  /**
   * Get all improvements.
   */
  getImprovements() {
    return this.improvements;
  }

  /**
   * Get applied improvements.
   */
  getApplied() {
    return [...this.applied.values()];
  }
}

export { SelfImprovementEngine };