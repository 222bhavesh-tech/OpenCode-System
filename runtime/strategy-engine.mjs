import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';

const STRATEGY_TYPE = Object.freeze({
  DIRECT_IMPLEMENTATION: 'DIRECT_IMPLEMENTATION',
  RESEARCH_FIRST: 'RESEARCH_FIRST',
  ARCHITECTURE_FIRST: 'ARCHITECTURE_FIRST',
  TEST_DRIVEN: 'TEST_DRIVEN',
  DEBUG_FIRST: 'DEBUG_FIRST',
  PROTOTYPE: 'PROTOTYPE',
  PARALLEL: 'PARALLEL',
  SEQUENTIAL: 'SEQUENTIAL',
  DELEGATE_SPECIALIST: 'DELEGATE_SPECIALIST',
  BROWSER_FIRST: 'BROWSER_FIRST',
  SECURITY_FIRST: 'SECURITY_FIRST',
  ROLLBACK_AND_REBUILD: 'ROLLBACK_AND_REBUILD',
});

const TASK_TYPE = Object.freeze({
  BUG_FIX: 'BUG_FIX',
  FEATURE: 'FEATURE',
  REFACTOR: 'REFACTOR',
  MIGRATION: 'MIGRATION',
  TESTING: 'TESTING',
  DOCUMENTATION: 'DOCUMENTATION',
  ARCHITECTURE: 'ARCHITECTURE',
  SECURITY: 'SECURITY',
  PERFORMANCE: 'PERFORMANCE',
  DEPENDENCY_UPDATE: 'DEPENDENCY_UPDATE',
  DATABASE: 'DATABASE',
  FRONTEND: 'FRONTEND',
  BACKEND: 'BACKEND',
  DEVOPS: 'DEVOPS',
  UNKNOWN: 'UNKNOWN',
});

const RISK_LEVEL = Object.freeze({ LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH', CRITICAL: 'CRITICAL' });

class StrategyScorer {
  constructor(config) {
    config = config || {};
    this.weights = config.weights || { quality: 0.30, reliability: 0.25, verification: 0.20, speed: 0.10, cost: -0.10, failureRate: -0.05 };
    this.minSamples = config.minSamples || 3;
  }

  score(outcomes) {
    if (!outcomes || outcomes.length < this.minSamples) return { score: 0.5, confidence: 'LOW', samples: outcomes ? outcomes.length : 0 };
    const n = outcomes.length;
    const avgQuality = outcomes.reduce((s, o) => s + (o.qualityScore || 0.5), 0) / n;
    const successRate = outcomes.filter(o => o.outcome === 'SUCCESS').length / n;
    const avgDuration = outcomes.reduce((s, o) => s + (o.duration || 0), 0) / n;
    const avgCost = outcomes.reduce((s, o) => s + (o.cost || 0), 0) / n;
    const failCount = outcomes.filter(o => o.outcome !== 'SUCCESS').length / n;
    const retryCount = outcomes.reduce((s, o) => s + (o.attempts || 1), 0) / n;
    const verifyPass = outcomes.filter(o => o.verificationResults === 'PASS').length / n;
    const raw = (this.weights.quality * avgQuality) + (this.weights.reliability * successRate) + (this.weights.verification * verifyPass) + (this.weights.speed * Math.max(0, 1 - avgDuration / 300000)) + (this.weights.cost * Math.max(0, 1 - avgCost / 1000)) + (this.weights.failureRate * failCount) + (this.weights.failureRate * retryCount);
    const clamped = Math.max(0, Math.min(1, raw));
    return { score: Math.round(clamped * 1000) / 1000, confidence: n >= 10 ? 'HIGH' : n >= 5 ? 'MEDIUM' : 'LOW', samples: n };
  }
}

class StrategyEngine extends EventEmitter {
  constructor(experienceStore, options) {
    super();
    this.experienceStore = experienceStore || null;
    this.scorer = new StrategyScorer(options);
    this.strategies = new Map();
    this._registerDefaults();
  }

  _registerDefaults() {
    this.strategies.set(STRATEGY_TYPE.DIRECT_IMPLEMENTATION, { type: STRATEGY_TYPE.DIRECT_IMPLEMENTATION, description: 'Implement directly without preamble', bestFor: [TASK_TYPE.BUG_FIX, TASK_TYPE.FEATURE], risk: RISK_LEVEL.LOW, estimatedSteps: 3 });
    this.strategies.set(STRATEGY_TYPE.RESEARCH_FIRST, { type: STRATEGY_TYPE.RESEARCH_FIRST, description: 'Research before implementation', bestFor: [TASK_TYPE.FEATURE, TASK_TYPE.DEPENDENCY_UPDATE], risk: RISK_LEVEL.MEDIUM, estimatedSteps: 5 });
    this.strategies.set(STRATEGY_TYPE.ARCHITECTURE_FIRST, { type: STRATEGY_TYPE.ARCHITECTURE_FIRST, description: 'Design architecture before coding', bestFor: [TASK_TYPE.ARCHITECTURE, TASK_TYPE.MIGRATION], risk: RISK_LEVEL.MEDIUM, estimatedSteps: 7 });
    this.strategies.set(STRATEGY_TYPE.TEST_DRIVEN, { type: STRATEGY_TYPE.TEST_DRIVEN, description: 'Write tests first, then implement', bestFor: [TASK_TYPE.BUG_FIX, TASK_TYPE.FEATURE, TASK_TYPE.BACKEND], risk: RISK_LEVEL.LOW, estimatedSteps: 5 });
    this.strategies.set(STRATEGY_TYPE.DEBUG_FIRST, { type: STRATEGY_TYPE.DEBUG_FIRST, description: 'Debug and diagnose before fixing', bestFor: [TASK_TYPE.BUG_FIX, TASK_TYPE.PERFORMANCE], risk: RISK_LEVEL.LOW, estimatedSteps: 4 });
    this.strategies.set(STRATEGY_TYPE.PROTOTYPE, { type: STRATEGY_TYPE.PROTOTYPE, description: 'Build prototype then refine', bestFor: [TASK_TYPE.FEATURE, TASK_TYPE.FRONTEND], risk: RISK_LEVEL.MEDIUM, estimatedSteps: 4 });
    this.strategies.set(STRATEGY_TYPE.PARALLEL, { type: STRATEGY_TYPE.PARALLEL, description: 'Execute independent tasks in parallel', bestFor: [TASK_TYPE.FEATURE, TASK_TYPE.TESTING], risk: RISK_LEVEL.MEDIUM, estimatedSteps: 3 });
    this.strategies.set(STRATEGY_TYPE.SEQUENTIAL, { type: STRATEGY_TYPE.SEQUENTIAL, description: 'Execute tasks sequentially with dependencies', bestFor: [TASK_TYPE.MIGRATION, TASK_TYPE.DATABASE], risk: RISK_LEVEL.LOW, estimatedSteps: 4 });
    this.strategies.set(STRATEGY_TYPE.DELEGATE_SPECIALIST, { type: STRATEGY_TYPE.DELEGATE_SPECIALIST, description: 'Delegate to domain specialist', bestFor: [TASK_TYPE.SECURITY, TASK_TYPE.DEVOPS, TASK_TYPE.DATABASE], risk: RISK_LEVEL.LOW, estimatedSteps: 3 });
    this.strategies.set(STRATEGY_TYPE.BROWSER_FIRST, { type: STRATEGY_TYPE.BROWSER_FIRST, description: 'Use browser verification for UI work', bestFor: [TASK_TYPE.FRONTEND], risk: RISK_LEVEL.LOW, estimatedSteps: 4 });
    this.strategies.set(STRATEGY_TYPE.SECURITY_FIRST, { type: STRATEGY_TYPE.SECURITY_FIRST, description: 'Security analysis before implementation', bestFor: [TASK_TYPE.SECURITY], risk: RISK_LEVEL.LOW, estimatedSteps: 5 });
    this.strategies.set(STRATEGY_TYPE.ROLLBACK_AND_REBUILD, { type: STRATEGY_TYPE.ROLLBACK_AND_REBUILD, description: 'Rollback and rebuild from known good state', bestFor: [TASK_TYPE.MIGRATION], risk: RISK_LEVEL.HIGH, estimatedSteps: 6 });
  }

  /**
   * Select the best strategy for a task.
   */
  selectStrategy(task) {
    if (!task) task = {};
    const taskType = this._classifyTask(task);
    const risk = this._assessRisk(task);
    const candidates = this._getCandidates(taskType, risk);
    const scored = candidates.map(s => {
      const history = this.experienceStore ? this.experienceStore.getOutcomes({ strategy: s.type, taskType: taskType }) : [];
      const scoreResult = this.scorer.score(history);
      return { strategy: s, score: scoreResult.score, confidence: scoreResult.confidence, samples: scoreResult.samples };
    });
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    const record = {
      id: 'strat-' + crypto.randomUUID().slice(0, 8),
      taskType: taskType,
      risk: risk,
      selectedStrategy: best.strategy.type,
      score: best.score,
      confidence: best.confidence,
      samples: best.samples,
      alternatives: scored.slice(1).map(s => ({ strategy: s.strategy.type, score: s.score })),
      timestamp: new Date().toISOString(),
    };
    this.emit('strategy:selected', { taskId: task.id, strategy: record.selectedStrategy, score: record.score });
    return record;
  }

  /**
   * Record the outcome of a strategy execution.
   */
  recordOutcome(strategyType, outcome) {
    if (this.experienceStore) {
      this.experienceStore.record({ strategy: strategyType, ...outcome });
    }
    this.emit('strategy:outcome', { strategy: strategyType, outcome: outcome.outcome });
  }

  /**
   * Get all available strategies.
   */
  getStrategies() {
    return [...this.strategies.values()];
  }

  _classifyTask(task) {
    if (!task) return TASK_TYPE.UNKNOWN;
    if (task.type) return task.type;
    const title = (task.title || task.description || '').toLowerCase();
    if (/fix|bug|error|crash/.test(title)) return TASK_TYPE.BUG_FIX;
    if (/feat|add|create|implement|build/.test(title)) return TASK_TYPE.FEATURE;
    if (/refactor|clean|reorganize/.test(title)) return TASK_TYPE.REFACTOR;
    if (/migrat|upgrade|move/.test(title)) return TASK_TYPE.MIGRATION;
    if (/test|spec|coverage/.test(title)) return TASK_TYPE.TESTING;
    if (/doc|readme|comment/.test(title)) return TASK_TYPE.DOCUMENTATION;
    if (/architect|design|structure/.test(title)) return TASK_TYPE.ARCHITECTURE;
    if (/secur|auth|permission|vulnerab/.test(title)) return TASK_TYPE.SECURITY;
    if (/perf|optim|slow|speed/.test(title)) return TASK_TYPE.PERFORMANCE;
    if (/depend|package|version/.test(title)) return TASK_TYPE.DEPENDENCY_UPDATE;
    if (/database|sql|schema|migration/.test(title)) return TASK_TYPE.DATABASE;
    if (/ui|css|html|component|page|render/.test(title)) return TASK_TYPE.FRONTEND;
    if (/api|endpoint|server|route/.test(title)) return TASK_TYPE.BACKEND;
    if (/deploy|ci|cd|docker|k8s/.test(title)) return TASK_TYPE.DEVOPS;
    return TASK_TYPE.UNKNOWN;
  }

  _assessRisk(task) {
    if (!task) return RISK_LEVEL.LOW;
    let risk = RISK_LEVEL.LOW;
    if (task.risk) return task.risk;
    if (task.files && task.files.length > 10) risk = RISK_LEVEL.MEDIUM;
    if (task.dependencies && task.dependencies.length > 5) risk = RISK_LEVEL.MEDIUM;
    if (task.type === TASK_TYPE.MIGRATION || task.type === TASK_TYPE.DATABASE) risk = RISK_LEVEL.HIGH;
    if (task.type === TASK_TYPE.SECURITY) risk = RISK_LEVEL.HIGH;
    if (task.type === TASK_TYPE.DEVOPS) risk = RISK_LEVEL.HIGH;
    return risk;
  }

  _getCandidates(taskType, risk) {
    const candidates = [];
    for (const s of this.strategies.values()) {
      if (s.bestFor.includes(taskType)) candidates.push(s);
    }
    if (candidates.length === 0) {
      candidates.push(this.strategies.get(STRATEGY_TYPE.DIRECT_IMPLEMENTATION));
    }
    return candidates;
  }
}

export { STRATEGY_TYPE, TASK_TYPE, RISK_LEVEL, StrategyScorer, StrategyEngine };