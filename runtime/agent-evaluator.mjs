import { EventEmitter } from 'node:events';

class AgentEvaluator extends EventEmitter {
  constructor(experienceStore, options) {
    super();
    this.experienceStore = experienceStore;
    this.minSamples = (options && options.minSamples) || 3;
    this.evaluations = new Map();
  }

  /**
   * Evaluate an agent's performance.
   */
  evaluate(agentRole) {
    const outcomes = this.experienceStore ? this.experienceStore.getOutcomes({ agentRole: agentRole }) : [];
    if (outcomes.length === 0) return { agentRole: agentRole, data: null, confidence: 'NONE', samples: 0 };
    const n = outcomes.length;
    const successes = outcomes.filter(o => o.outcome === 'SUCCESS').length;
    const failRate = 1 - successes / n;
    const retryRate = outcomes.reduce((s, o) => s + (o.attempts || 1), 0) / n;
    const avgDuration = outcomes.reduce((s, o) => s + o.duration, 0) / n;
    const avgCost = outcomes.reduce((s, o) => s + (o.cost || 0), 0) / n;
    const avgQuality = outcomes.reduce((s, o) => s + o.qualityScore, 0) / n;
    const verifyPass = outcomes.filter(o => o.verificationResults === 'PASS').length / n;
    const regressionRate = outcomes.filter(o => o.failureCategories && o.failureCategories.includes('REGRESSION')).length / n;
    const score = (avgQuality * 0.3) + ((successes / n) * 0.25) + (verifyPass * 0.2) + (Math.max(0, 1 - failRate) * 0.15) + (Math.max(0, 1 - retryRate / 3) * 0.1);
    const evaluation = {
      agentRole: agentRole,
      data: {
        tasksAttempted: n,
        tasksCompleted: successes,
        verificationSuccessRate: Math.round(verifyPass * 100) / 100,
        failureRate: Math.round(failRate * 100) / 100,
        retryRate: Math.round(retryRate * 100) / 100,
        averageDuration: Math.round(avgDuration),
        averageCost: Math.round(avgCost * 100) / 100,
        averageQuality: Math.round(avgQuality * 100) / 100,
        regressionRate: Math.round(regressionRate * 100) / 100,
        compositeScore: Math.round(score * 1000) / 1000,
      },
      confidence: n >= 10 ? 'HIGH' : n >= 5 ? 'MEDIUM' : 'LOW',
      samples: n,
      timestamp: new Date().toISOString(),
    };
    this.evaluations.set(agentRole, evaluation);
    return evaluation;
  }

  /**
   * Rank all agents by composite score.
   */
  rankAll() {
    const roles = new Set();
    if (this.experienceStore) {
      for (const e of this.experienceStore.getOutcomes({})) {
        if (e.agentRole) roles.add(e.agentRole);
      }
    }
    const evaluations = [...roles].map(r => this.evaluate(r)).filter(e => e.data);
    evaluations.sort((a, b) => (b.data.compositeScore || 0) - (a.data.compositeScore || 0));
    return evaluations.map((e, i) => ({ rank: i + 1, ...e }));
  }

  /**
   * Get evaluation for a specific agent.
   */
  getEvaluation(agentRole) {
    return this.evaluations.get(agentRole) || null;
  }

  /**
   * Recommend agent for a task.
   */
  recommendAgent(taskType) {
    const ranked = this.rankAll();
    if (ranked.length === 0) return null;
    return ranked[0];
  }
}

export { AgentEvaluator };