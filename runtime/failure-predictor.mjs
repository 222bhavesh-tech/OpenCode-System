import { EventEmitter } from 'node:events';

const RISK_CATEGORY = Object.freeze({
  DEPENDENCY: 'DEPENDENCY',
  FLAKY_TEST: 'FLAKY_TEST',
  LARGE_MIGRATION: 'LARGE_MIGRATION',
  PARALLEL_CONFLICT: 'PARALLEL_CONFLICT',
  UNSTABLE_TOOL: 'UNSTABLE_TOOL',
  FAILED_STRATEGY: 'FAILED_STRATEGY',
  PROVIDER_INSTABILITY: 'PROVIDER_INSTABILITY',
  BROWSER_ENV: 'BROWSER_ENV',
  FILE_CONFLICT: 'FILE_CONFLICT',
  CONTEXT_OVERFLOW: 'CONTEXT_OVERFLOW',
  BUDGET_EXCEEDED: 'BUDGET_EXCEEDED',
  UNKNOWN: 'UNKNOWN',
});

const RISK = Object.freeze({ LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH', CRITICAL: 'CRITICAL' });

class FailurePredictor extends EventEmitter {
  constructor(experienceStore, options) {
    super();
    this.experienceStore = experienceStore;
    this.thresholds = (options && options.thresholds) || { highRiskRate: 0.5, minSamples: 3 };
  }

  /**
   * Predict risks for a given task.
   */
  predict(task, context) {
    const risks = [];
    if (!task) task = {};
    risks.push(...this._checkStrategyRisks(task));
    risks.push(...this._checkDependencyRisks(task));
    risks.push(...this._checkParallelRisks(task));
    risks.push(...this._checkBudgetRisks(task, context));
    risks.push(...this._checkContextRisks(context));
    risks.sort((a, b) => { const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }; return (order[a.risk] || 4) - (order[b.risk] || 4); });
    return { risks: risks, overallRisk: risks.length > 0 ? risks[0].risk : RISK.LOW, riskCount: risks.length };
  }

  _checkStrategyRisks(task) {
    const risks = [];
    if (!this.experienceStore) return risks;
    const outcomes = this.experienceStore.getOutcomes({ taskType: task.type });
    if (outcomes.length < this.thresholds.minSamples) return risks;
    const failRate = outcomes.filter(o => o.outcome !== 'SUCCESS').length / outcomes.length;
    if (failRate >= this.thresholds.highRiskRate) {
      risks.push({ risk: RISK.HIGH, category: RISK_CATEGORY.FAILED_STRATEGY, recommendation: 'Consider alternative strategy', confidence: Math.min(0.9, failRate), evidence: Math.round(failRate * 100) + '% failure rate across ' + outcomes.length + ' samples' });
    }
    return risks;
  }

  _checkDependencyRisks(task) {
    const risks = [];
    if (task.dependencies && task.dependencies.length > 5) {
      risks.push({ risk: RISK.MEDIUM, category: RISK_CATEGORY.DEPENDENCY, recommendation: 'Verify all dependencies before proceeding', confidence: 0.6, evidence: task.dependencies.length + ' dependencies' });
    }
    return risks;
  }

  _checkParallelRisks(task) {
    const risks = [];
    if (task.parallel && task.files && task.files.length > 3) {
      risks.push({ risk: RISK.MEDIUM, category: RISK_CATEGORY.PARALLEL_CONFLICT, recommendation: 'Consider serial execution to avoid file conflicts', confidence: 0.5, evidence: task.files.length + ' files in parallel task' });
    }
    return risks;
  }

  _checkBudgetRisks(task, context) {
    const risks = [];
    if (context && context.budget) {
      const spent = context.budget.spent || 0;
      const max = context.budget.max || 1;
      if (spent / max > 0.8) {
        risks.push({ risk: RISK.HIGH, category: RISK_CATEGORY.BUDGET_EXCEEDED, recommendation: 'Budget nearly exhausted, prioritize critical tasks', confidence: 0.9, evidence: Math.round((spent / max) * 100) + '% budget used' });
      }
    }
    return risks;
  }

  _checkContextRisks(context) {
    const risks = [];
    if (context && context.contextSize && context.contextSize > 40000) {
      risks.push({ risk: RISK.MEDIUM, category: RISK_CATEGORY.CONTEXT_OVERFLOW, recommendation: 'Context approaching limits, consider rotation', confidence: 0.7, evidence: context.contextSize + ' tokens estimated' });
    }
    return risks;
  }
}

export { RISK_CATEGORY, RISK, FailurePredictor };