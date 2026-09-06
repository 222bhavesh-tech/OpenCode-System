import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';

const EXPERIMENT_STATE = Object.freeze({
  DESIGN: 'DESIGN',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  ABORTED: 'ABORTED',
});

class ExperimentEngine extends EventEmitter {
  constructor(experienceStore, options) {
    super();
    this.experienceStore = experienceStore;
    this.experiments = new Map();
    this.minSamples = (options && options.minSamples) || 10;
    this.explorationRate = (options && options.explorationRate) || 0.1;
  }

  /**
   * Create a new experiment.
   */
  createExperiment(name, variants) {
    const id = 'exp-' + crypto.randomUUID().slice(0, 8);
    const experiment = {
      id: id,
      name: name,
      variants: variants,
      state: EXPERIMENT_STATE.DESIGN,
      assignments: new Map(),
      results: new Map(),
      createdAt: Date.now(),
      completedAt: null,
    };
    this.experiments.set(id, experiment);
    this.emit('experiment:created', { id, name, variantCount: variants.length });
    return experiment;
  }

  /**
   * Start an experiment.
   */
  startExperiment(experimentId) {
    const exp = this.experiments.get(experimentId);
    if (!exp) throw new Error('Unknown experiment: ' + experimentId);
    exp.state = EXPERIMENT_STATE.RUNNING;
    exp.startedAt = Date.now();
    this.emit('experiment:started', { id: experimentId });
    return exp;
  }

  /**
   * Assign a task to an experiment variant.
   */
  assignVariant(experimentId, taskId) {
    const exp = this.experiments.get(experimentId);
    if (!exp || exp.state !== EXPERIMENT_STATE.RUNNING) return null;
    const variantIndex = Math.floor(Math.random() * exp.variants.length);
    const variant = exp.variants[variantIndex];
    exp.assignments.set(taskId, { variant: variant, assignedAt: Date.now() });
    return variant;
  }

  /**
   * Record a result for an experiment.
   */
  recordResult(experimentId, taskId, result) {
    const exp = this.experiments.get(experimentId);
    if (!exp) return;
    const assignment = exp.assignments.get(taskId);
    if (!assignment) return;
    if (!exp.results.has(assignment.variant.name)) {
      exp.results.set(assignment.variant.name, { outcomes: [], totalDuration: 0, totalQuality: 0 });
    }
    const variantResult = exp.results.get(assignment.variant.name);
    variantResult.outcomes.push({ taskId, ...result, recordedAt: Date.now() });
    variantResult.totalDuration += result.duration || 0;
    variantResult.totalQuality += result.qualityScore || 0;
  }

  /**
   * Analyze experiment results.
   */
  analyze(experimentId) {
    const exp = this.experiments.get(experimentId);
    if (!exp) throw new Error('Unknown experiment: ' + experimentId);
    const analysis = { id: experimentId, name: exp.name, variants: [] };
    for (const [name, result] of exp.results) {
      const n = result.outcomes.length;
      if (n === 0) continue;
      const successRate = result.outcomes.filter(o => o.outcome === 'SUCCESS').length / n;
      const avgDuration = result.totalDuration / n;
      const avgQuality = result.totalQuality / n;
      analysis.variants.push({
        name: name,
        samples: n,
        successRate: Math.round(successRate * 100) / 100,
        avgDuration: Math.round(avgDuration),
        avgQuality: Math.round(avgQuality * 100) / 100,
        compositeScore: Math.round(((successRate * 0.4) + (avgQuality * 0.3) + (Math.max(0, 1 - avgDuration / 300000) * 0.3)) * 1000) / 1000,
      });
    }
    analysis.variants.sort((a, b) => b.compositeScore - a.compositeScore);
    analysis.winner = analysis.variants.length > 0 ? analysis.variants[0].name : null;
    analysis.confidence = this._calculateConfidence(analysis.variants);
    return analysis;
  }

  /**
   * Complete an experiment.
   */
  completeExperiment(experimentId) {
    const exp = this.experiments.get(experimentId);
    if (!exp) throw new Error('Unknown experiment: ' + experimentId);
    exp.state = EXPERIMENT_STATE.COMPLETED;
    exp.completedAt = Date.now();
    const analysis = this.analyze(experimentId);
    this.emit('experiment:completed', { id: experimentId, winner: analysis.winner, confidence: analysis.confidence });
    return { experiment: exp, analysis };
  }

  getExperiments() {
    return [...this.experiments.values()].map(e => ({ id: e.id, name: e.name, state: e.state, variantCount: e.variants.length }));
  }

  _calculateConfidence(variants) {
    const minSamples = Math.min(...variants.map(v => v.samples));
    if (minSamples >= this.minSamples) return 'HIGH';
    if (minSamples >= 5) return 'MEDIUM';
    return 'LOW';
  }
}

export { EXPERIMENT_STATE, ExperimentEngine };