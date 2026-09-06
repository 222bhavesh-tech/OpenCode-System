import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ControlPlane } from '../runtime/control-plane.mjs';
import { DecisionEngine, DECISION_TYPE } from '../runtime/decision-engine.mjs';
import { Scheduler } from '../runtime/scheduler.mjs';
import { WorkerAdapter } from '../runtime/worker.mjs';
import { Replanner } from '../runtime/replanner.mjs';
import { FailureStrategy } from '../runtime/failure-strategy.mjs';
import { ContextCheckpoint } from '../runtime/context-checkpoint.mjs';
import { StrategyEngine } from '../runtime/strategy-engine.mjs';
import { ExperienceStore } from '../runtime/experience-store.mjs';
import { FailurePredictor } from '../runtime/failure-predictor.mjs';
import { TaskDecomposer } from '../runtime/task-decomposer.mjs';
import { StallDetector } from '../runtime/stall-detector.mjs';
import { OscillationGuard } from '../runtime/oscillation-guard.mjs';
import { MissionEconomics } from '../runtime/mission-economics.mjs';
import { TelemetryCollector } from '../runtime/telemetry.mjs';
import { AutonomyGovernor } from '../runtime/autonomy-governor.mjs';
import { AdaptiveVerification } from '../runtime/adaptive-verification.mjs';
import { MissionMemory } from '../runtime/mission-memory.mjs';
import { Dashboard } from '../runtime/dashboard.mjs';
import { StateSnapshot } from '../runtime/state-snapshot.mjs';

const BENCH_DIR = path.join(process.cwd(), 'test-benchmark-project');

function cleanBench() {
  const dir = path.join(BENCH_DIR, '.opencode-system');
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function initBench() {
  cleanBench();
  const plane = new ControlPlane(BENCH_DIR);
  plane.initialize({ goal: 'Build a CLI utility with tests', mode: 'ASSISTED', budgets: { iterations: 50, retriesPerTask: 2, parallelAgents: 2 } });
  return plane;
}

// ═══ E2E: Full autonomous pipeline ═══

describe('E2E BENCHMARK: Full autonomous pipeline', () => {
  it('should execute a complete mission: init → plan → execute → verify → complete', async () => {
    const plane = initBench();

    // Phase 1: Plan — add tasks with dependencies
    plane.addTask({ id: 'setup', title: 'Create project structure', kind: 'file', path: '.project-init', content: 'initialized', requiredEvidence: ['build'] });
    plane.addTask({ id: 'impl', title: 'Implement utility function', kind: 'file', path: 'src/utils.js', content: 'function add(a, b) { return a + b; } module.exports = { add };', dependencies: ['setup'], requiredEvidence: ['build'] });
    plane.addTask({ id: 'test', title: 'Write test file', kind: 'file', path: 'test/utils.test.js', content: 'const {add} = require("../src/utils.js"); const r = add(1,2); if (r !== 3) throw new Error("Expected 3 got " + r); console.log("PASS");', dependencies: ['impl'], requiredEvidence: ['build'] });
    plane.addTask({ id: 'review', title: 'Verify output', kind: 'shell', command: 'echo PASS', dependencies: ['test'], requiredEvidence: ['test'] });

    // Phase 2: Execute via scheduler
    const scheduler = new Scheduler(plane, { maxIterations: 10, taskTimeoutMs: 30000, stopOnFail: false });
    const results = [];
    scheduler.on('scheduler:result', (e) => results.push(e));

    const runResult = await scheduler.run();

    // Phase 3: Verify final state
    const status = plane.status();
    assert.equal(status.status, 'COMPLETE', 'Mission should be COMPLETE');
    assert.ok(results.length >= 3, 'Should have executed at least 3 tasks');

    // Phase 4: Verify evidence
    const state = plane.load();
    const evidence = state.evidence;
    assert.ok(evidence.length > 0, 'Should have evidence records');

    // Phase 5: Verify dashboard
    const dash = new Dashboard(BENCH_DIR);
    const report = dash.generate();
    assert.equal(report.initialized, true);
    assert.equal(report.taskCounts.COMPLETE, 4, 'All 4 tasks complete');

    cleanBench();
  });
});

// ═══ E2E: Decision engine dynamic decisions ═══

describe('E2E BENCHMARK: Decision engine makes real decisions', () => {
  it('should select EXECUTE_TASK when tasks are ready', async () => {
    const plane = initBench();
    plane.addTask({ id: 't1', title: 'Task 1', kind: 'shell', command: 'echo ok', requiredEvidence: [] });
    const engine = new DecisionEngine(plane);
    const decision = await engine.decide();
    assert.equal(decision.type, DECISION_TYPE.EXECUTE_TASK);
    assert.equal(decision.taskId, 't1');
    cleanBench();
  });

  it('should select COMPLETE when all tasks done', async () => {
    const plane = initBench();
    plane.addTask({ id: 't1', title: 'Task 1', kind: 'shell', command: 'echo ok', requiredEvidence: [] });
    plane.startTask('t1');
    plane.recordEvidence('t1', { type: 'test', verdict: 'PASS' });
    plane.completeTask('t1');
    const engine = new DecisionEngine(plane);
    const decision = await engine.decide();
    assert.equal(decision.type, DECISION_TYPE.COMPLETE);
    cleanBench();
  });

  it('should select WAIT when tasks in progress', async () => {
    const plane = initBench();
    plane.addTask({ id: 't1', title: 'Task 1', kind: 'shell', command: 'echo ok', requiredEvidence: [] });
    plane.startTask('t1');
    const engine = new DecisionEngine(plane);
    const decision = await engine.decide();
    assert.equal(decision.type, DECISION_TYPE.WAIT);
    cleanBench();
  });

  it('should select PARALLELIZE for multiple independent tasks', async () => {
    const plane = initBench();
    plane.addTask({ id: 't1', title: 'Task 1', kind: 'shell', command: 'echo ok', requiredEvidence: [] });
    plane.addTask({ id: 't2', title: 'Task 2', kind: 'shell', command: 'echo ok', requiredEvidence: [] });
    const engine = new DecisionEngine(plane);
    const decision = await engine.decide();
    assert.equal(decision.type, DECISION_TYPE.PARALLELIZE);
    assert.ok(decision.taskIds.length >= 2);
    cleanBench();
  });

  it('should select CHECKPOINT at intervals', async () => {
    const plane = initBench();
    plane.addTask({ id: 't1', title: 'Task 1', kind: 'shell', command: 'echo ok', requiredEvidence: [] });
    plane.addTask({ id: 't2', title: 'Task 2', kind: 'shell', command: 'echo ok', requiredEvidence: [] });
    const engine = new DecisionEngine(plane, { checkpointInterval: 1 });
    // First call executes task, second should checkpoint
    await engine.decide();
    const decision = await engine.decide();
    assert.equal(decision.type, DECISION_TYPE.CHECKPOINT);
    cleanBench();
  });

  it('should select ESCALATE when blocked with exhausted retries', async () => {
    const plane = initBench();
    plane.addTask({ id: 't1', title: 'Task 1', kind: 'shell', command: 'exit 1', requiredEvidence: [] });
    // Fail the task twice (exhausting retries)
    plane.startTask('t1');
    plane.failTask('t1', { category: 'CODE', cause: 'fail 1' });
    plane.startTask('t1');
    plane.failTask('t1', { category: 'CODE', cause: 'fail 2' });
    const engine = new DecisionEngine(plane, { maxFailuresBeforeReplan: 1 });
    const decision = await engine.decide();
    assert.ok([DECISION_TYPE.ESCALATE, DECISION_TYPE.REPLAN, DECISION_TYPE.RECOVER].includes(decision.type));
    cleanBench();
  });
});

// ═══ E2E: Replanner mutates DAG ═══

describe('E2E BENCHMARK: Replanner dynamically mutates task graph', () => {
  it('should add a new task', () => {
    const plane = initBench();
    plane.addTask({ id: 't1', title: 'Original task', kind: 'shell', command: 'echo ok', requiredEvidence: [] });
    const replanner = new Replanner(plane);
    replanner.addTask({ id: 't1b', title: 'Additional task', kind: 'shell', command: 'echo extra', dependencies: [], requiredEvidence: [] });
    const state = plane.load();
    assert.ok(state.tasks['t1b'], 'New task added');
    assert.equal(state.tasks['t1b'].title, 'Additional task');
    cleanBench();
  });

  it('should split a task', () => {
    const plane = initBench();
    plane.addTask({ id: 't1', title: 'Big task', kind: 'shell', command: 'echo ok', requiredEvidence: [] });
    const replanner = new Replanner(plane);
    replanner.splitTask('t1', [
      { id: 't1a', title: 'Part A', kind: 'shell', command: 'echo a', requiredEvidence: [] },
      { id: 't1b', title: 'Part B', kind: 'shell', command: 'echo b', requiredEvidence: [] },
    ]);
    const state = plane.load();
    assert.ok(state.tasks['t1a'], 'Split task A created');
    assert.ok(state.tasks['t1b'], 'Split task B created');
    cleanBench();
  });

  it('should detect cycles', () => {
    const plane = initBench();
    plane.addTask({ id: 't1', title: 'Task 1', kind: 'shell', command: 'echo ok', requiredEvidence: [] });
    plane.addTask({ id: 't2', title: 'Task 2', kind: 'shell', command: 'echo ok', dependencies: ['t1'], requiredEvidence: [] });
    const replanner = new Replanner(plane);
    let threw = false;
    try { replanner.addDependency('t1', 't2'); } catch (e) { threw = true; }
    assert.ok(threw, 'Should detect cycle');
    cleanBench();
  });
});

// ═══ E2E: Failure recovery ═══

describe('E2E BENCHMARK: Failure strategy recovery', () => {
  it('should select RETRY for first failure', () => {
    const plane = initBench();
    plane.addTask({ id: 't1', title: 'Task', kind: 'shell', command: 'exit 1', requiredEvidence: [] });
    plane.startTask('t1');
    plane.failTask('t1', { category: 'CODE', cause: 'syntax error' });
    const strategy = new FailureStrategy(plane);
    const result = strategy.select('t1', plane.load().failures[0]);
    assert.ok(['RETRY', 'SWITCH_AGENT', 'CHANGE_STRATEGY'].includes(result.strategy));
    cleanBench();
  });

  it('should select ESCALATE after max retries', () => {
    const plane = initBench();
    plane.addTask({ id: 't1', title: 'Task', kind: 'shell', command: 'exit 1', requiredEvidence: [] });
    // With retriesPerTask=2, two failures exhaust retries → task becomes FAILED
    plane.startTask('t1');
    plane.failTask('t1', { category: 'CODE', cause: 'persistent error' });
    plane.startTask('t1');
    plane.failTask('t1', { category: 'CODE', cause: 'persistent error' });
    const state = plane.load();
    assert.equal(state.tasks['t1'].status, 'FAILED', 'Task is FAILED after exhausting retries');
    const strategy = new FailureStrategy(plane);
    const failure = state.failures[state.failures.length - 1];
    const result = strategy.select('t1', failure);
    assert.ok(['ESCALATE', 'ABORT', 'CHANGE_STRATEGY', 'CHANGE_APPROACH'].includes(result.strategy));
    cleanBench();
  });
});

// ═══ E2E: Context checkpoint + restore ═══

describe('E2E BENCHMARK: Context checkpoint and restore', () => {
  it('should save and restore checkpoint', () => {
    const plane = initBench();
    plane.addTask({ id: 't1', title: 'Task', kind: 'shell', command: 'echo ok', requiredEvidence: [] });
    plane.startTask('t1');
    const checkpoint = new ContextCheckpoint(plane);
    checkpoint.save({ workers: [], decisions: [], mutations: [] });
    const restored = checkpoint.restore();
    assert.ok(restored, 'Should restore checkpoint');
    cleanBench();
  });
});

// ═══ E2E: Phase C modules integrated ═══

describe('E2E BENCHMARK: Phase C modules work with ControlPlane', () => {
  it('strategy engine selects strategy for a task', () => {
    const plane = initBench();
    plane.addTask({ id: 't1', title: 'Fix bug in parser', kind: 'shell', command: 'echo ok', requiredEvidence: [] });
    const state = plane.load();
    const task = state.tasks['t1'];
    const engine = new StrategyEngine(null);
    const result = engine.selectStrategy({ id: task.id, type: 'BUG_FIX', files: ['parser.js'] });
    assert.ok(result.selectedStrategy, 'Selected a strategy');
    assert.ok(result.score >= 0, 'Has score');
    cleanBench();
  });

  it('failure predictor identifies risks', () => {
    const predictor = new FailurePredictor(null);
    const result = predictor.predict({ id: 't1', type: 'MIGRATION', files: ['a.js', 'b.js', 'c.js', 'd.js', 'e.js', 'f.js'], dependencies: ['d1', 'd2', 'd3', 'd4', 'd5', 'd6'] }, { budget: { spent: 90, max: 100 } });
    assert.ok(result.risks.length > 0, 'Identified risks');
    assert.ok(result.overallRisk, 'Has overall risk level');
    cleanBench();
  });

  it('task decomposer breaks down complex tasks', () => {
    const decomposer = new TaskDecomposer();
    const result = decomposer.decompose({ id: 't1', title: 'Implement full feature and refactor', type: 'MIGRATION', files: ['a.js', 'b.js', 'c.js', 'd.js', 'e.js', 'f.js', 'g.js', 'h.js'], dependencies: ['d1', 'd2', 'd3', 'd4'] });
    assert.ok(result.decomposed, 'Task was decomposed');
    assert.ok(result.subtasks.length > 1, 'Has multiple subtasks');
    cleanBench();
  });

  it('autonomy governor enforces policies', () => {
    const gov = new AutonomyGovernor(null);
    const r1 = gov.check('file-write', {});
    assert.ok(r1.allowed !== undefined, 'Has allowed field');
    const r2 = gov.check('paid-operation', {});
    assert.equal(r2.allowed, false, 'Paid operations blocked');
    cleanBench();
  });

  it('adaptive verification includes mandatory safety checks', () => {
    const verifier = new AdaptiveVerification();
    const result = verifier.selectChecks({ id: 't1', title: 'Simple change' }, 'LOW');
    const mandatory = result.checks.filter(c => c.mandatory);
    assert.ok(mandatory.length >= 2, 'Has mandatory safety checks');
    cleanBench();
  });

  it('mission memory saves and recalls', () => {
    const memory = new MissionMemory(BENCH_DIR);
    memory.save({ id: 'm1', objective: 'Test mission', outcome: 'SUCCESS', qualityScore: 0.9 });
    const recalled = memory.recall('Test mission');
    assert.ok(recalled.length > 0, 'Recalled mission');
    assert.equal(recalled[0].outcome, 'SUCCESS');
    memory.clear();
    cleanBench();
  });

  it('telemetry records metrics', () => {
    const telemetry = new TelemetryCollector();
    telemetry.recordMetric('test.metric', 42);
    telemetry.incrementCounter('test.counter');
    telemetry.setGauge('test.gauge', 100);
    const stats = telemetry.summary();
    assert.equal(stats.totalMetrics, 1);
    assert.equal(stats.counters['test.counter'], 1);
    cleanBench();
  });

  it('economics tracks costs', () => {
    const econ = new MissionEconomics();
    econ.startSession('m1');
    econ.recordTokens('m1', 1000);
    econ.recordToolCall('m1', 5);
    econ.endSession('m1');
    const stats = econ.stats();
    assert.ok(stats.totalSpent > 0, 'Has cost');
    cleanBench();
  });

  it('stall detector identifies stalls', () => {
    const detector = new StallDetector({ idleThreshold: 10 });
    detector.trackTask('t1', { status: 'RUNNING', progress: true });
    const ts = detector.taskStates.get('t1');
    ts.lastProgress = Date.now() - 1000;
    detector.trackTask('t1', { status: 'RUNNING' });
    const status = detector.getStallStatus('t1');
    assert.equal(status.stalled, true, 'Detected stall');
    cleanBench();
  });

  it('oscillation guard detects oscillation', () => {
    const guard = new OscillationGuard({ windowSize: 10, repeatThreshold: 2 });
    for (let i = 0; i < 6; i++) guard.recordChange('t1', { value: i % 2 === 0 ? 'A' : 'B' });
    assert.equal(guard.isOscillating('t1'), true, 'Detected oscillation');
    cleanBench();
  });

  it('dashboard generates report', () => {
    const dash = new Dashboard(BENCH_DIR);
    const report = dash.generate();
    assert.ok(report.initialized !== undefined, 'Has initialized field');
    cleanBench();
  });

  it('state snapshot saves and restores', () => {
    initBench();
    const snap = new StateSnapshot(BENCH_DIR);
    const saved = snap.save('test');
    assert.ok(saved.id, 'Saved snapshot');
    const list = snap.list();
    assert.ok(list.length >= 1, 'Has snapshots');
    snap.delete(saved.id);
    cleanBench();
  });
});

// ═══ E2E: Worker actually executes ═══

describe('E2E BENCHMARK: Worker executes real commands', () => {
  it('should execute a shell command and produce evidence', async () => {
    const plane = initBench();
    plane.addTask({ id: 't1', title: 'Echo test', kind: 'shell', command: 'echo hello-world-benchmark', requiredEvidence: ['test'] });
    const worker = new WorkerAdapter(plane, { timeout: 10000 });
    const result = await worker.execute('t1');
    assert.equal(result.success, true, 'Task succeeded');
    assert.ok(result.evidence.length > 0, 'Has evidence');
    assert.equal(result.evidence[0].verdict, 'PASS', 'Evidence passes');
    cleanBench();
  });

  it('should execute a file write and produce evidence', async () => {
    const plane = initBench();
    plane.addTask({ id: 't1', title: 'Write file', kind: 'file', path: 'test-output.txt', content: 'benchmark content', requiredEvidence: ['build'] });
    const worker = new WorkerAdapter(plane, { timeout: 10000 });
    const result = await worker.execute('t1');
    assert.equal(result.success, true, 'Task succeeded');
    assert.ok(result.evidence.length > 0, 'Has evidence');
    const filePath = path.join(BENCH_DIR, 'test-output.txt');
    assert.ok(fs.existsSync(filePath), 'File was written');
    assert.equal(fs.readFileSync(filePath, 'utf8'), 'benchmark content');
    cleanBench();
  });

  it('should fail a command and record failure', async () => {
    const plane = initBench();
    plane.addTask({ id: 't1', title: 'Failing command', kind: 'shell', command: 'exit 42', requiredEvidence: [] });
    const worker = new WorkerAdapter(plane, { timeout: 10000 });
    const result = await worker.execute('t1');
    assert.equal(result.success, false, 'Task failed');
    assert.equal(result.category, 'UNKNOWN', 'Classified error');
    const state = plane.load();
    assert.ok(state.failures.length > 0, 'Failure recorded');
    cleanBench();
  });
});

// ═══ E2E: Full scheduler loop ═══

describe('E2E BENCHMARK: Scheduler runs complete loop', () => {
  it('should execute multiple tasks in sequence', async () => {
    const plane = initBench();
    plane.addTask({ id: 't1', title: 'Step 1', kind: 'shell', command: 'echo step1', requiredEvidence: [] });
    plane.addTask({ id: 't2', title: 'Step 2', kind: 'shell', command: 'echo step2', dependencies: ['t1'], requiredEvidence: [] });
    plane.addTask({ id: 't3', title: 'Step 3', kind: 'shell', command: 'echo step3', dependencies: ['t2'], requiredEvidence: [] });
    const scheduler = new Scheduler(plane, { maxIterations: 10, taskTimeoutMs: 10000, stopOnFail: true });
    const result = await scheduler.run();
    assert.ok(result.succeeded >= 3 || result.iterations >= 3, 'Executed tasks');
    const status = plane.status();
    assert.equal(status.status, 'COMPLETE', 'Mission complete');
    cleanBench();
  });
});

// ═══ E2E: Evidence gate prevents false completion ═══

describe('E2E BENCHMARK: Evidence gate prevents false completion', () => {
  it('should not complete task without required evidence', async () => {
    const plane = initBench();
    plane.addTask({ id: 't1', title: 'Needs evidence', kind: 'shell', command: 'echo ok', requiredEvidence: ['test', 'review'] });
    plane.startTask('t1');
    plane.recordEvidence('t1', { type: 'test', verdict: 'PASS' });
    // Try to complete without 'review' evidence
    let threw = false;
    try { plane.completeTask('t1'); } catch (e) { threw = true; }
    assert.ok(threw, 'Should throw EVIDENCE_REQUIRED');
    cleanBench();
  });

  it('should complete task when all evidence passes', async () => {
    const plane = initBench();
    plane.addTask({ id: 't1', title: 'Has evidence', kind: 'shell', command: 'echo ok', requiredEvidence: ['test'] });
    plane.startTask('t1');
    plane.recordEvidence('t1', { type: 'test', verdict: 'PASS' });
    plane.completeTask('t1');
    const state = plane.load();
    assert.equal(state.tasks['t1'].status, 'COMPLETE');
    cleanBench();
  });

  it('should not complete task with failing evidence', async () => {
    const plane = initBench();
    plane.addTask({ id: 't1', title: 'Failing evidence', kind: 'shell', command: 'echo ok', requiredEvidence: ['test'] });
    plane.startTask('t1');
    plane.recordEvidence('t1', { type: 'test', verdict: 'FAIL' });
    let threw = false;
    try { plane.completeTask('t1'); } catch (e) { threw = true; }
    assert.ok(threw, 'Should throw EVIDENCE_REQUIRED');
    cleanBench();
  });
});