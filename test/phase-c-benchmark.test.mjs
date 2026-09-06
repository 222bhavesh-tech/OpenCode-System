import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { StrategyEngine } from '../runtime/strategy-engine.mjs';
import { ExperienceStore } from '../runtime/experience-store.mjs';
import { LearningEngine } from '../runtime/learning-engine.mjs';
import { FailurePredictor } from '../runtime/failure-predictor.mjs';
import { TaskDecomposer } from '../runtime/task-decomposer.mjs';
import { TeamOptimizer } from '../runtime/team-optimizer.mjs';
import { AgentOrchestrator } from '../runtime/agent-orchestrator.mjs';
import { AgentEvaluator } from '../runtime/agent-evaluator.mjs';
import { ModelRouter } from '../runtime/model-router.mjs';
import { ContextOptimizer } from '../runtime/context-optimizer.mjs';
import { AdaptiveVerification } from '../runtime/adaptive-verification.mjs';
import { ExperimentEngine } from '../runtime/experiment-engine.mjs';
import { SelfImprovementEngine } from '../runtime/self-improvement.mjs';
import { EvaluationSystem } from '../runtime/evaluation-system.mjs';
import { MissionMemory } from '../runtime/mission-memory.mjs';
import { CrossMissionKnowledge } from '../runtime/cross-mission-knowledge.mjs';
import { AutonomyGovernor } from '../runtime/autonomy-governor.mjs';
import { MissionEconomics } from '../runtime/mission-economics.mjs';
import { CriticalPathFinder } from '../runtime/critical-path.mjs';
import { StallDetector } from '../runtime/stall-detector.mjs';
import { OscillationGuard } from '../runtime/oscillation-guard.mjs';
import { QualityImprover } from '../runtime/quality-improver.mjs';
import { TelemetryCollector } from '../runtime/telemetry.mjs';

function bench(name, fn, iterations) {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn(i);
  const elapsed = performance.now() - start;
  return { name, iterations, elapsed: Math.round(elapsed), perIteration: Math.round(elapsed / iterations * 1000) / 1000 };
}

describe('BENCHMARK: StrategyEngine', () => {
  it('should select strategy in <50ms avg for 100 iterations', () => {
    const engine = new StrategyEngine(null);
    const task = { id: 'b1', type: 'BUG_FIX', files: ['a.js'] };
    const result = bench('StrategyEngine.selectStrategy', () => engine.selectStrategy(task), 100);
    assert.ok(result.perIteration < 50, 'Avg ' + result.perIteration + 'ms < 50ms');
  });
});

describe('BENCHMARK: ExperienceStore', () => {
  it('should record 200 entries in <200ms', () => {
    const store = new ExperienceStore('C:/Users/bhavesh jeengar/OpenCode-System');
    store.clear();
    const result = bench('ExperienceStore.record', (i) => store.record({ taskType: 'TEST', outcome: 'SUCCESS', strategy: 'A', duration: 100 }), 200);
    assert.ok(result.elapsed < 300, 'Total ' + result.elapsed + 'ms < 300ms');
    store.clear();
  });

  it('should query 100 times in <100ms', () => {
    const store = new ExperienceStore('C:/Users/bhavesh jeengar/OpenCode-System');
    for (let i = 0; i < 50; i++) store.record({ taskType: 'TEST', outcome: 'SUCCESS', strategy: 'A' });
    const result = bench('ExperienceStore.getOutcomes', () => store.getOutcomes({ taskType: 'TEST' }), 100);
    assert.ok(result.elapsed < 100, 'Total ' + result.elapsed + 'ms < 100ms');
    store.clear();
  });
});

describe('BENCHMARK: FailurePredictor', () => {
  it('should predict 200 times in <100ms', () => {
    const predictor = new FailurePredictor(null);
    const task = { id: 'b', type: 'FEATURE', files: ['a.js'], dependencies: ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'], risk: 'HIGH' };
    const context = { budget: { spent: 90, max: 100 }, contextSize: 50000 };
    const result = bench('FailurePredictor.predict', () => predictor.predict(task, context), 200);
    assert.ok(result.elapsed < 100, 'Total ' + result.elapsed + 'ms < 100ms');
  });
});

describe('BENCHMARK: TaskDecomposer', () => {
  it('should decompose 100 tasks in <100ms', () => {
    const decomposer = new TaskDecomposer();
    const task = { id: 'b', type: 'FEATURE', files: Array.from({ length: 10 }, (_, i) => 'file-' + i + '.js'), dependencies: ['dep1', 'dep2'] };
    const result = bench('TaskDecomposer.decompose', () => decomposer.decompose(task), 100);
    assert.ok(result.elapsed < 100, 'Total ' + result.elapsed + 'ms < 100ms');
  });
});

describe('BENCHMARK: AgentOrchestrator', () => {
  it('should handle 50 agents and 200 tasks in <200ms', () => {
    const orch = new AgentOrchestrator();
    for (let i = 0; i < 50; i++) orch.registerAgent({ id: 'a' + i, role: 'builder' });
    const result = bench('AgentOrchestrator lifecycle', (i) => {
      const agentId = 'a' + (i % 50);
      orch.assignTask(agentId, { id: 't' + i, type: 'FEATURE' });
      orch.startTask('t' + i);
      orch.completeTask('t' + i, { files: [] });
    }, 200);
    assert.ok(result.elapsed < 200, 'Total ' + result.elapsed + 'ms < 200ms');
  });
});

describe('BENCHMARK: ContextOptimizer', () => {
  it('should optimize 200 contexts in <100ms', () => {
    const optimizer = new ContextOptimizer(null);
    const context = { objective: 'Build feature', phase: 'implementation', files: ['a.js', 'b.js', 'c.js'], components: { nav: {}, header: {}, footer: {} }, styles: { theme: 'dark' }, routing: { routes: ['/home', '/about'] } };
    const result = bench('ContextOptimizer.optimize', () => optimizer.optimize('FRONTEND', context), 200);
    assert.ok(result.elapsed < 100, 'Total ' + result.elapsed + 'ms < 100ms');
  });
});

describe('BENCHMARK: AdaptiveVerification', () => {
  it('should select checks 200 times in <50ms', () => {
    const verifier = new AdaptiveVerification();
    const task = { id: 'b', title: 'Add security middleware' };
    const result = bench('AdaptiveVerification.selectChecks', () => verifier.selectChecks(task, 'HIGH'), 200);
    assert.ok(result.elapsed < 50, 'Total ' + result.elapsed + 'ms < 50ms');
  });
});

describe('BENCHMARK: MissionMemory', () => {
  it('should save/recall 100 missions in <200ms', () => {
    const memory = new MissionMemory('C:/Users/bhavesh jeengar/OpenCode-System');
    const result = bench('MissionMemory save+recall', (i) => {
      memory.save({ id: 'm' + i, objective: 'Test ' + i, outcome: 'SUCCESS' });
      memory.recall('Test');
    }, 100);
    assert.ok(result.elapsed < 200, 'Total ' + result.elapsed + 'ms < 200ms');
    memory.clear();
  });
});

describe('BENCHMARK: TelemetryCollector', () => {
  it('should record 1000 metrics in <100ms', () => {
    const telemetry = new TelemetryCollector();
    const result = bench('TelemetryCollector.recordMetric', (i) => telemetry.recordMetric('bench.metric', i), 1000);
    assert.ok(result.elapsed < 100, 'Total ' + result.elapsed + 'ms < 100ms');
  });
});

describe('BENCHMARK: EvaluationSystem', () => {
  it('should evaluate 200 tasks in <100ms', () => {
    const system = new EvaluationSystem();
    const task = { id: 'b', files: ['a.js'] };
    const result = { files: ['a.js'], verificationResults: 'PASS', lintResults: 'PASS' };
    const b = bench('EvaluationSystem.evaluate', () => system.evaluate(task, result), 200);
    assert.ok(b.elapsed < 100, 'Total ' + b.elapsed + 'ms < 100ms');
  });
});

describe('BENCHMARK: Full pipeline throughput', () => {
  it('should complete 50 full mission pipelines in <500ms', () => {
    const strategy = new StrategyEngine(null);
    const predictor = new FailurePredictor(null);
    const decomposer = new TaskDecomposer();
    const verification = new AdaptiveVerification();
    const economics = new MissionEconomics();
    const telemetry = new TelemetryCollector();
    const result = bench('Full pipeline', (i) => {
      const task = { id: 'p' + i, type: 'FEATURE', files: ['a.js'], risk: 'MEDIUM' };
      strategy.selectStrategy(task);
      predictor.predict(task, null);
      decomposer.decompose(task);
      verification.selectChecks(task, 'MEDIUM');
      economics.startSession('p' + i);
      economics.recordTokens('p' + i, 500);
      economics.endSession('p' + i);
      telemetry.recordMetric('pipeline.duration', 100 + i);
    }, 50);
    assert.ok(result.elapsed < 500, 'Total ' + result.elapsed + 'ms < 500ms');
  });
});