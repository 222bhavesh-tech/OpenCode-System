import { EventEmitter } from 'node:events';

const CONTEXT_SIGNAL = Object.freeze({
  RELEVANT: 'RELEVANT',
  IRRELEVANT: 'IRRELEVANT',
  STALE: 'STALE',
  CRITICAL: 'CRITICAL',
});

class ContextOptimizer extends EventEmitter {
  constructor(experienceStore, options) {
    super();
    this.experienceStore = experienceStore;
    this.maxTokens = (options && options.maxTokens) || 40000;
    this.tracking = new Map();
    this.retrievalPatterns = new Map();
  }

  /**
   * Optimize context for a task type.
   */
  optimize(taskType, fullContext) {
    const pattern = this.retrievalPatterns.get(taskType);
    const prioritized = this._prioritize(fullContext, taskType, pattern);
    const estimatedTokens = this._estimateTokens(prioritized);
    const needsPruning = estimatedTokens > this.maxTokens;
    const optimized = needsPruning ? this._prune(prioritized) : prioritized;
    return {
      context: optimized,
      originalTokens: estimatedTokens,
      optimizedTokens: this._estimateTokens(optimized),
      pruned: needsPruning,
      sections: Object.keys(optimized),
    };
  }

  /**
   * Track context usage for learning.
   */
  trackUsage(taskId, contextSections, outcome) {
    const usage = { taskId: taskId, sections: contextSections, outcome: outcome, timestamp: Date.now() };
    this.tracking.set(taskId, usage);
  }

  /**
   * Record which context was useful for a task type.
   */
  recordRetrieval(taskType, sections, verified) {
    if (!this.retrievalPatterns.has(taskType)) {
      this.retrievalPatterns.set(taskType, {});
    }
    const pattern = this.retrievalPatterns.get(taskType);
    for (const section of sections) {
      if (!pattern[section]) pattern[section] = { count: 0, verified: 0 };
      pattern[section].count++;
      if (verified) pattern[section].verified++;
    }
  }

  /**
   * Get optimization stats.
   */
  stats() {
    return {
      trackedTasks: this.tracking.size,
      patterns: [...this.retrievalPatterns.entries()].map(([type, pattern]) => ({ taskType: type, sections: Object.keys(pattern).length })),
    };
  }

  _prioritize(context, taskType, pattern) {
    const prioritized = {};
    if (context.objective) prioritized.objective = context.objective;
    if (context.phase) prioritized.phase = context.phase;
    if (taskType === 'FRONTEND') {
      if (context.components) prioritized.components = context.components;
      if (context.styles) prioritized.styles = context.styles;
      if (context.routing) prioritized.routing = context.routing;
      if (context.uiTests) prioritized.uiTests = context.uiTests;
    } else if (taskType === 'DATABASE') {
      if (context.schema) prioritized.schema = context.schema;
      if (context.migrations) prioritized.migrations = context.migrations;
      if (context.models) prioritized.models = context.models;
    } else {
      for (const [key, value] of Object.entries(context)) {
        if (value !== undefined && value !== null) prioritized[key] = value;
      }
    }
    return prioritized;
  }

  _prune(context) {
    const pruned = { objective: context.objective, phase: context.phase };
    const keys = Object.keys(context);
    const essentialKeys = ['objective', 'phase', 'task', 'files', 'dependencies'];
    for (const key of keys) {
      if (essentialKeys.includes(key)) pruned[key] = context[key];
      else if (typeof context[key] === 'string' && context[key].length < 500) pruned[key] = context[key];
    }
    return pruned;
  }

  _estimateTokens(obj) {
    return Math.ceil(JSON.stringify(obj).length / 4);
  }
}

export { CONTEXT_SIGNAL, ContextOptimizer };