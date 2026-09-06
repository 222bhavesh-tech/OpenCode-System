import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';

const EVAL_METRIC = Object.freeze({
  COMPLETENESS: 'COMPLETENESS',
  CORRECTNESS: 'CORRECTNESS',
  QUALITY: 'QUALITY',
  EFFICIENCY: 'EFFICIENCY',
  COMPLIANCE: 'COMPLIANCE',
  MAINTAINABILITY: 'MAINTAINABILITY',
});

class EvaluationSystem extends EventEmitter {
  constructor(options) {
    super();
    this.metrics = new Map();
    this.baselines = new Map();
    this._registerDefaults();
  }

  _registerDefaults() {
    this.metrics.set(EVAL_METRIC.COMPLETENESS, { name: EVAL_METRIC.COMPLETENESS, weight: 0.25, description: 'All requirements addressed', evaluate: (task, result) => this._evalCompleteness(task, result) });
    this.metrics.set(EVAL_METRIC.CORRECTNESS, { name: EVAL_METRIC.CORRECTNESS, weight: 0.25, description: 'Implementation is functionally correct', evaluate: (task, result) => this._evalCorrectness(task, result) });
    this.metrics.set(EVAL_METRIC.QUALITY, { name: EVAL_METRIC.QUALITY, weight: 0.15, description: 'Code quality and standards', evaluate: (task, result) => this._evalQuality(task, result) });
    this.metrics.set(EVAL_METRIC.EFFICIENCY, { name: EVAL_METRIC.EFFICIENCY, weight: 0.15, description: 'Efficient execution', evaluate: (task, result) => this._evalEfficiency(task, result) });
    this.metrics.set(EVAL_METRIC.COMPLIANCE, { name: EVAL_METRIC.COMPLIANCE, weight: 0.10, description: 'Follows project rules', evaluate: (task, result) => this._evalCompliance(task, result) });
    this.metrics.set(EVAL_METRIC.MAINTAINABILITY, { name: EVAL_METRIC.MAINTAINABILITY, weight: 0.10, description: 'Code is maintainable', evaluate: (task, result) => this._evalMaintainability(task, result) });
  }

  /**
   * Evaluate a task result.
   */
  evaluate(task, result) {
    const scores = {};
    for (const [name, metric] of this.metrics) {
      scores[name] = { score: metric.evaluate(task, result), weight: metric.weight, description: metric.description };
    }
    let composite = 0;
    for (const [name, data] of Object.entries(scores)) {
      composite += data.score * data.weight;
    }
    const evaluation = {
      id: 'eval-' + crypto.randomUUID().slice(0, 8),
      taskId: task.id,
      scores: scores,
      compositeScore: Math.round(composite * 1000) / 1000,
      grade: this._grade(composite),
      timestamp: Date.now(),
    };
    this.emit('evaluation:completed', { taskId: task.id, grade: evaluation.grade, score: evaluation.compositeScore });
    return evaluation;
  }

  /**
   * Compare against baseline.
   */
  compareAgainstBaseline(taskType, evaluation) {
    const baseline = this.baselines.get(taskType);
    if (!baseline) return { compared: false, reason: 'No baseline for task type' };
    const improvement = evaluation.compositeScore - baseline.score;
    return {
      compared: true,
      baseline: baseline.score,
      current: evaluation.compositeScore,
      improvement: Math.round(improvement * 1000) / 1000,
      improved: improvement > 0,
    };
  }

  /**
   * Set baseline for a task type.
   */
  setBaseline(taskType, score) {
    this.baselines.set(taskType, { score: score, timestamp: Date.now() });
  }

  getMetrics() { return [...this.metrics.values()].map(m => ({ name: m.name, weight: m.weight, description: m.description })); }

  _evalCompleteness(task, result) {
    if (!result || !result.files) return 0.3;
    const expectedFiles = (task.files || []).length;
    if (expectedFiles === 0) return 0.8;
    return Math.min(1, result.files.length / expectedFiles);
  }

  _evalCorrectness(task, result) {
    if (!result) return 0.2;
    if (result.verificationResults === 'PASS') return 0.95;
    if (result.verificationResults === 'FAIL') return 0.3;
    return 0.5;
  }

  _evalQuality(task, result) {
    if (!result) return 0.3;
    if (result.lintResults === 'PASS') return 0.9;
    if (result.lintResults === 'FAIL') return 0.4;
    return 0.6;
  }

  _evalEfficiency(task, result) {
    if (!result || !result.duration) return 0.5;
    const targetDuration = 300000;
    return Math.max(0.2, Math.min(1, 1 - (result.duration / (targetDuration * 2))));
  }

  _evalCompliance(task, result) {
    if (!result || !result.checkResults) return 0.5;
    const mandatory = result.checkResults.filter(c => c.mandatory);
    if (mandatory.length === 0) return 0.8;
    const passed = mandatory.filter(c => c.verdict === 'PASS').length;
    return passed / mandatory.length;
  }

  _evalMaintainability(task, result) {
    if (!result) return 0.3;
    if (result.documentationUpdated) return 0.9;
    return 0.5;
  }

  _grade(score) {
    if (score >= 0.9) return 'A';
    if (score >= 0.8) return 'B';
    if (score >= 0.7) return 'C';
    if (score >= 0.6) return 'D';
    return 'F';
  }
}

export { EVAL_METRIC, EvaluationSystem };