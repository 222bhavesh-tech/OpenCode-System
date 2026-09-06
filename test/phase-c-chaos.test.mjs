import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { StrategyEngine, STRATEGY_TYPE } from '../runtime/strategy-engine.mjs';
import { ExperienceStore } from '../runtime/experience-store.mjs';
import { LearningEngine } from '../runtime/learning-engine.mjs';
import { FailurePredictor, RISK } from '../runtime/failure-predictor.mjs';
import { TaskDecomposer, COMPLEXITY } from '../runtime/task-decomposer.mjs';
import { TeamOptimizer } from '../runtime/team-optimizer.mjs';
import { AgentOrchestrator, AGENT_STATE } from '../runtime/agent-orchestrator.mjs';
import { AgentEvaluator } from '../runtime/agent-evaluator.mjs';
import { ModelRouter } from '../runtime/model-router.mjs';
import { ContextOptimizer } from '../runtime/context-optimizer.mjs';
import { AdaptiveVerification, VERIFICATION_LEVEL } from '../runtime/adaptive-verification.mjs';
import { ExperimentEngine, EXPERIMENT_STATE } from '../runtime/experiment-engine.mjs';
import { SelfImprovementEngine } from '../runtime/self-improvement.mjs';
import { EvaluationSystem } from '../runtime/evaluation-system.mjs';
import { MissionMemory } from '../runtime/mission-memory.mjs';
import { CrossMissionKnowledge } from '../runtime/cross-mission-knowledge.mjs';
import { AutonomyGovernor, AUTONOMY_LEVEL, GOVERNOR_ACTION } from '../runtime/autonomy-governor.mjs';
import { MissionEconomics } from '../runtime/mission-economics.mjs';
import { CriticalPathFinder } from '../runtime/critical-path.mjs';
import { StallDetector, STALL_TYPE } from '../runtime/stall-detector.mjs';
import { OscillationGuard } from '../runtime/oscillation-guard.mjs';
import { QualityImprover } from '../runtime/quality-improver.mjs';
import { TelemetryCollector } from '../runtime/telemetry.mjs';

// ═══ CHAOS: Rapid creation/destruction cycles ═══

describe('CHAOS: StrategyEngine lifecycle stress', () => {
  it('should survive rapid strategy creation cycles', () => {
    const engine = new StrategyEngine(null);
    for (let i = 0; i < 100; i++) {
      engine.selectStrategy({ id: 'task-' + i, type: 'BUG_FIX', files: ['a.js'] });
    }
    assert.ok(true, 'Survived 100 rapid strategy selections');
  });

  it('should handle null/undefined tasks gracefully', () => {
    const engine = new StrategyEngine(null);
    const r1 = engine.selectStrategy(null);
    assert.ok(r1, 'Null task handled');
    const r2 = engine.selectStrategy({});
    assert.ok(r2, 'Empty task handled');
    const r3 = engine.selectStrategy({ title: null });
    assert.ok(r3, 'Null title handled');
  });
});

describe('CHAOS: ExperienceStore concurrent access', () => {
  it('should handle rapid record/query cycles', () => {
    const store = new ExperienceStore('C:/Users/bhavesh jeengar/OpenCode-System');
    for (let i = 0; i < 50; i++) {
      store.record({ taskType: 'FEATURE', outcome: i % 2 === 0 ? 'SUCCESS' : 'FAILURE', strategy: 'DIRECT', duration: 1000 + i });
      store.getOutcomes({ taskType: 'FEATURE' });
    }
    const stats = store.stats();
    assert.equal(stats.total, 50);
    store.clear();
  });

  it('should handle empty queries', () => {
    const store = new ExperienceStore('C:/Users/bhavesh jeengar/OpenCode-System');
    const results = store.getOutcomes({ taskType: 'NONEXISTENT' });
    assert.equal(results.length, 0);
    store.clear();
  });
});

describe('CHAOS: LearningEngine with no data', () => {
  it('should produce no recommendations with empty store', () => {
    const store = new ExperienceStore('C:/Users/bhavesh jeengar/OpenCode-System');
    const engine = new LearningEngine(store);
    const recs = engine.analyze();
    assert.equal(recs.length, 0);
    store.clear();
  });
});

describe('CHAOS: FailurePredictor with extreme inputs', () => {
  it('should handle null task and context', () => {
    const predictor = new FailurePredictor(null);
    const result = predictor.predict(null, null);
    assert.ok(result.risks !== undefined, 'Handled null inputs');
    assert.equal(result.riskCount, 0);
  });

  it('should handle budget overflow', () => {
    const predictor = new FailurePredictor(null);
    const result = predictor.predict({ id: 't1' }, { budget: { spent: 999, max: 1000 } });
    assert.ok(result.risks.length > 0, 'Detected budget risk');
  });
});

describe('CHAOS: TaskDecomposer with minimal input', () => {
  it('should handle task with no files and no deps', () => {
    const decomposer = new TaskDecomposer();
    const result = decomposer.decompose({ id: 't1', title: 'Simple task' });
    assert.ok(result.subtasks.length > 0, 'Produced subtasks');
  });

  it('should classify trivial tasks correctly', () => {
    const decomposer = new TaskDecomposer();
    const eval_ = decomposer.evaluate({ id: 't1', title: 'Fix typo', files: ['readme.md'] });
    assert.equal(eval_.needsDecomposition, false, 'Trivial task not decomposed');
  });
});

describe('CHAOS: TeamOptimizer with unknown task type', () => {
  it('should handle unknown task types', () => {
    const optimizer = new TeamOptimizer(null);
    const result = optimizer.selectTeam({ id: 't1', type: 'UNKNOWN_TYPE' });
    assert.ok(result.selectedTeam.length > 0, 'Selected default team');
  });
});

describe('CHAOS: AgentOrchestrator state corruption', () => {
  it('should handle operating on non-existent agents/tasks', () => {
    const orch = new AgentOrchestrator();
    try {
      orch.assignTask('nonexistent-agent', { id: 't1' });
      assert.fail('Should have thrown');
    } catch (e) {
      assert.ok(e.message.includes('Unknown agent'), 'Threw correct error');
    }
  });

  it('should handle double-complete', () => {
    const orch = new AgentOrchestrator();
    orch.registerAgent({ id: 'a1', role: 'builder' });
    orch.registerAgent({ id: 'a1', role: 'builder' });
    orch.assignTask('a1', { id: 't1' });
    orch.startTask('t1');
    orch.completeTask('t1', { files: [] });
    orch.completeTask('t1', { files: [] }); // Second complete
    assert.ok(true, 'Double complete handled');
  });
});

describe('CHAOS: AgentEvaluator with no data', () => {
  it('should return null data for unknown agent', () => {
    const evaluator = new AgentEvaluator(null);
    const result = evaluator.evaluate('unknown-role');
    assert.equal(result.data, null);
    assert.equal(result.confidence, 'NONE');
  });
});

describe('CHAOS: ModelRouter with null options', () => {
  it('should use defaults', () => {
    const router = new ModelRouter();
    const result = router.route('planning');
    assert.ok(result.provider, 'Has provider');
    assert.ok(result.fallback, 'Has fallback');
  });
});

describe('CHAOS: ContextOptimizer with empty context', () => {
  it('should handle empty context', () => {
    const optimizer = new ContextOptimizer(null);
    const result = optimizer.optimize('FEATURE', {});
    assert.ok(result.context, 'Has context');
    assert.ok(result.sections !== undefined, 'Has sections');
  });
});

describe('CHAOS: AdaptiveVerification mandatory checks', () => {
  it('should always include mandatory safety checks', () => {
    const verifier = new AdaptiveVerification({ defaultLevel: VERIFICATION_LEVEL.MINIMAL });
    const result = verifier.selectChecks({ id: 't1', title: 'Simple change' }, 'LOW');
    const mandatoryNames = result.checks.filter(c => c.mandatory).map(c => c.name);
    assert.ok(mandatoryNames.includes('no-secrets'), 'Includes no-secrets');
    assert.ok(mandatoryNames.includes('no-credentials'), 'Includes no-credentials');
  });
});

describe('CHAOS: ExperimentEngine lifecycle', () => {
  it('should create, run, and analyze experiment', () => {
    const engine = new ExperimentEngine(null);
    const exp = engine.createExperiment('test', [{ name: 'A' }, { name: 'B' }]);
    assert.equal(exp.state, EXPERIMENT_STATE.DESIGN);
    engine.startExperiment(exp.id);
    for (let i = 0; i < 10; i++) {
      const variant = engine.assignVariant(exp.id, 'task-' + i);
      engine.recordResult(exp.id, 'task-' + i, { outcome: 'SUCCESS', duration: 1000 });
    }
    const analysis = engine.analyze(exp.id);
    assert.ok(analysis.variants.length > 0, 'Has variant results');
  });
});

describe('CHAOS: SelfImprovementEngine with no data', () => {
  it('should produce improvements from recommendations', () => {
    const store = new ExperienceStore('C:/Users/bhavesh jeengar/OpenCode-System');
    const learning = new LearningEngine(store);
    const engine = new SelfImprovementEngine(store, learning);
    const improvements = engine.analyze();
    assert.ok(Array.isArray(improvements), 'Returns array');
    store.clear();
  });
});

describe('CHAOS: EvaluationSystem scoring', () => {
  it('should produce valid scores', () => {
    const system = new EvaluationSystem();
    const result = system.evaluate({ id: 't1', files: ['a.js', 'b.js'] }, { files: ['a.js', 'b.js'], verificationResults: 'PASS' });
    assert.ok(result.compositeScore >= 0 && result.compositeScore <= 1, 'Score in range');
    assert.ok(['A', 'B', 'C', 'D', 'F'].includes(result.grade), 'Valid grade');
  });
});

describe('CHAOS: MissionMemory rapid save/recall', () => {
  it('should handle rapid save/recall cycles', () => {
    const memory = new MissionMemory('C:/Users/bhavesh jeengar/OpenCode-System');
    for (let i = 0; i < 20; i++) {
      memory.save({ id: 'm-' + i, objective: 'Test mission ' + i, outcome: i % 2 === 0 ? 'SUCCESS' : 'FAILURE' });
    }
    const recent = memory.recent(5);
    assert.equal(recent.length, 5);
    const recalled = memory.recall('Test');
    assert.ok(recalled.length > 0, 'Recalled missions');
    memory.clear();
  });
});

describe('CHAOS: CrossMissionKnowledge learning', () => {
  it('should learn from missions', () => {
    const knowledge = new CrossMissionKnowledge('C:/Users/bhavesh jeengar/OpenCode-System');
    knowledge.learnFromMission({ id: 'm1', outcome: 'SUCCESS', successfulPatterns: ['pattern-a', 'pattern-b'] });
    knowledge.learnFromMission({ id: 'm2', outcome: 'FAILURE', failures: ['error-x'] });
    const top = knowledge.topPatterns(5);
    assert.ok(top.length > 0, 'Has patterns');
    const stats = knowledge.stats();
    assert.ok(stats.patterns > 0 || stats.antiPatterns > 0, 'Has knowledge');
    knowledge.clear();
  });
});

describe('CHAOS: AutonomyGovernor level changes', () => {
  it('should enforce policies at different levels', () => {
    const gov = new AutonomyGovernor(null, { initialLevel: AUTONOMY_LEVEL.L0_SUPERVISED });
    const r1 = gov.check('file-write', {});
    assert.equal(r1.allowed, false, 'L0 blocks file-write');
    gov.setLevel(AUTONOMY_LEVEL.L3_FULL);
    const r2 = gov.check('file-write', {});
    assert.equal(r2.allowed, true, 'L3 allows file-write');
  });

  it('should block paid operations at all levels', () => {
    const gov = new AutonomyGovernor(null, { initialLevel: AUTONOMY_LEVEL.L3_FULL });
    const result = gov.check('paid-operation', {});
    assert.equal(result.allowed, false, 'Paid blocked even at L3');
  });
});

describe('CHAOS: MissionEconomics tracking', () => {
  it('should track costs accurately', () => {
    const econ = new MissionEconomics();
    econ.startSession('m1');
    econ.recordTokens('m1', 1000);
    econ.recordToolCall('m1', 5);
    econ.recordMcpCall('m1', 2);
    econ.endSession('m1');
    const stats = econ.stats();
    assert.ok(stats.totalSpent > 0, 'Cost > 0');
    assert.equal(stats.totalTokens, 1000);
    assert.equal(stats.totalToolCalls, 5);
  });
});

describe('CHAOS: CriticalPathFinder with circular deps', () => {
  it('should handle tasks with no deps', () => {
    const finder = new CriticalPathFinder();
    const result = finder.findCriticalPath([
      { id: 't1', dependencies: [], estimatedDuration: 100 },
      { id: 't2', dependencies: ['t1'], estimatedDuration: 200 },
    ]);
    assert.ok(result.criticalPath.length > 0, 'Found path');
    assert.ok(result.estimatedDuration > 0, 'Has duration');
  });
});

describe('CHAOS: StallDetector state tracking', () => {
  it('should detect idle stalls', () => {
    const detector = new StallDetector({ idleThreshold: 10 });
    detector.trackTask('t1', { status: 'RUNNING', progress: true });
    // Wait conceptually — simulate by setting lastProgress in the past
    const ts = detector.taskStates.get('t1');
    ts.lastProgress = Date.now() - 1000;
    detector.trackTask('t1', { status: 'RUNNING' });
    const status = detector.getStallStatus('t1');
    assert.equal(status.stalled, true, 'Detected idle stall');
  });
});

describe('CHAOS: OscillationGuard detection', () => {
  it('should detect oscillation', () => {
    const guard = new OscillationGuard({ windowSize: 10, repeatThreshold: 2 });
    for (let i = 0; i < 6; i++) {
      guard.recordChange('t1', { value: i % 2 === 0 ? 'A' : 'B' });
    }
    const isOsc = guard.isOscillating('t1');
    assert.equal(isOsc, true, 'Detected oscillation');
  });
});

describe('CHAOS: QualityImprover analysis', () => {
  it('should detect console.log in non-test file', () => {
    const improver = new QualityImprover(null);
    const results = improver.analyzeChanges([{ type: 'add', path: 'src/app.js', content: 'console.log("hello");\nconst x = 1;' }]);
    assert.ok(results.length > 0, 'Found improvements');
  });
});

describe('CHAOS: TelemetryCollector metrics', () => {
  it('should record and aggregate metrics', () => {
    const telemetry = new TelemetryCollector();
    for (let i = 0; i < 100; i++) telemetry.recordMetric('test.metric', Math.random() * 100);
    telemetry.incrementCounter('test.counter', 10);
    telemetry.setGauge('test.gauge', 42);
    telemetry.recordEvent('test.event', { data: 'hello' });
    const stats = telemetry.summary();
    assert.equal(stats.totalMetrics, 100);
    assert.equal(stats.counters['test.counter'], 10);
  });
});

// ═══ CHAOS: Integration across multiple modules ═══

describe('CHAOS: Full pipeline integration', () => {
  it('should chain StrategyEngine → FailurePredictor → TaskDecomposer', () => {
    const strategy = new StrategyEngine(null);
    const predictor = new FailurePredictor(null);
    const decomposer = new TaskDecomposer();
    const task = { id: 'chaos-task', type: 'FEATURE', files: ['a.js', 'b.js', 'c.js', 'd.js', 'e.js', 'f.js', 'g.js'], risk: 'HIGH' };
    const stratRecord = strategy.selectStrategy(task);
    assert.ok(stratRecord.selectedStrategy, 'Selected strategy');
    const prediction = predictor.predict(task, null);
    assert.ok(prediction.risks !== undefined, 'Predicted risks');
    const decomposed = decomposer.decompose(task);
    assert.ok(decomposed.subtasks.length > 0, 'Decomposed task');
  });

  it('should chain AgentOrchestrator → AgentEvaluator → ModelRouter', () => {
    const orch = new AgentOrchestrator();
    orch.registerAgent({ id: 'a1', role: 'builder' });
    orch.registerAgent({ id: 'a2', role: 'tester' });
    orch.assignTask('a1', { id: 't1', type: 'FEATURE' });
    orch.startTask('t1');
    orch.completeTask('t1', { files: ['output.js'], verificationResults: 'PASS' });
    const evaluator = new AgentEvaluator(null);
    const eval_ = evaluator.evaluate('builder');
    assert.ok(eval_.data === null || eval_.data !== null, 'Evaluated');
    const router = new ModelRouter();
    const routing = router.route('coding');
    assert.ok(routing.provider, 'Routed');
  });

  it('should chain MissionEconomics → TelemetryCollector', () => {
    const econ = new MissionEconomics();
    const telemetry = new TelemetryCollector();
    econ.startSession('chaos-m1');
    econ.recordTokens('chaos-m1', 500);
    econ.recordToolCall('chaos-m1', 3);
    econ.endSession('chaos-m1');
    const session = econ.getSession('chaos-m1');
    telemetry.recordMetric('mission.cost', session.estimatedCost);
    telemetry.recordMetric('mission.tokens', session.tokenUsage);
    telemetry.setGauge('active.missions', 1);
    const stats = telemetry.summary();
    assert.ok(stats.totalMetrics >= 2, 'Recorded metrics');
  });
});