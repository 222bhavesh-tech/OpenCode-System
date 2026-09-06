import { EventEmitter } from 'node:events';

class LearningEngine extends EventEmitter {
  constructor(experienceStore, options) {
    super();
    this.experienceStore = experienceStore;
    this.minSamples = (options && options.minSamples) || 3;
    this.recommendations = [];
  }

  /**
   * Analyze experiences and produce recommendations.
   */
  analyze() {
    this.recommendations = [];
    const stats = this.experienceStore.stats();
    this._analyzeStrategies(stats);
    this._analyzeAgents(stats);
    this._analyzeFailures();
    this._analyzeWorkflows();
    this.emit('learning:analyzed', { recommendations: this.recommendations.length });
    return this.recommendations;
  }

  /**
   * Get recommendations for a specific task type.
   */
  getRecommendations(taskType) {
    return this.recommendations.filter(r => !r.taskType || r.taskType === taskType);
  }

  _analyzeStrategies(stats) {
    if (!stats.byStrategy) return;
    for (const [strategy, data] of Object.entries(stats.byStrategy)) {
      if (data.count < this.minSamples) continue;
      const successRate = data.successes / data.count;
      if (successRate >= 0.8) {
        this.recommendations.push({ type: 'STRATEGY_PREFERRED', strategy: strategy, successRate: successRate, evidence: data.count + ' samples', priority: 'HIGH' });
      } else if (successRate < 0.3 && data.count >= this.minSamples) {
        this.recommendations.push({ type: 'STRATEGY_AVOID', strategy: strategy, successRate: successRate, evidence: data.count + ' samples', priority: 'HIGH' });
      }
    }
  }

  _analyzeAgents(stats) {
    const byAgent = {};
    const all = this.experienceStore.getOutcomes({});
    for (const e of all) {
      if (!byAgent[e.agentRole]) byAgent[e.agentRole] = { count: 0, successes: 0, totalDuration: 0, totalQuality: 0 };
      byAgent[e.agentRole].count++;
      if (e.outcome === 'SUCCESS') byAgent[e.agentRole].successes++;
      byAgent[e.agentRole].totalDuration += e.duration;
      byAgent[e.agentRole].totalQuality += e.qualityScore;
    }
    for (const [role, data] of Object.entries(byAgent)) {
      if (data.count < this.minSamples) continue;
      const successRate = data.successes / data.count;
      const avgQuality = data.totalQuality / data.count;
      if (successRate < 0.4) {
        this.recommendations.push({ type: 'AGENT_AVOID', agentRole: role, successRate: successRate, avgQuality: avgQuality, priority: 'MEDIUM' });
      } else if (successRate >= 0.9 && avgQuality >= 0.8) {
        this.recommendations.push({ type: 'AGENT_PREFERRED', agentRole: role, successRate: successRate, avgQuality: avgQuality, priority: 'MEDIUM' });
      }
    }
  }

  _analyzeFailures() {
    const failures = this.experienceStore.getOutcomes({}).filter(e => e.outcome !== 'SUCCESS');
    const catCounts = {};
    for (const f of failures) {
      for (const cat of (f.failureCategories || [])) {
        catCounts[cat] = (catCounts[cat] || 0) + 1;
      }
    }
    for (const [cat, count] of Object.entries(catCounts)) {
      if (count >= this.minSamples) {
        this.recommendations.push({ type: 'FAILURE_PATTERN', category: cat, occurrences: count, priority: 'MEDIUM' });
      }
    }
  }

  _analyzeWorkflows() {
    const all = this.experienceStore.getOutcomes({});
    const recoveryCases = all.filter(e => e.recoveryUsed);
    if (recoveryCases.length >= this.minSamples) {
      const recoverySuccessRate = recoveryCases.filter(e => e.outcome === 'SUCCESS').length / recoveryCases.length;
      this.recommendations.push({ type: 'RECOVERY_EFFECTIVENESS', rate: recoverySuccessRate, evidence: recoveryCases.length + ' cases', priority: 'LOW' });
    }
  }
}

export { LearningEngine };