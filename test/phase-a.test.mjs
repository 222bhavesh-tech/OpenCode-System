import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ControlPlane } from '../runtime/control-plane.mjs';
import { DecisionEngine, DECISION_TYPE } from '../runtime/decision-engine.mjs';
import { Replanner } from '../runtime/replanner.mjs';
import { ContextResolver } from '../runtime/context-resolver.mjs';
import { AgentRuntime, WORKER_STATUS } from '../runtime/agent-runtime.mjs';
import { ParallelScheduler } from '../runtime/parallel-scheduler.mjs';
import { FailureStrategy, STRATEGY_TYPE } from '../runtime/failure-strategy.mjs';
import { ContextCheckpoint } from '../runtime/context-checkpoint.mjs';
import { AutonomousLoop, LOOP_PHASE } from '../runtime/autonomous-loop.mjs';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-phase-a-'));
  return { root, plane: new ControlPlane(root) };
}

// ─── DecisionEngine tests ───────────────────────────────────────────

test('DecisionEngine returns COMPLETE when all tasks done', async () => {
  const { plane } = fixture();
  plane.initialize({ goal: 'Test complete' });
  plane.addTask({ id: 't1', title: 'Task 1', requiredEvidence: [] });
  plane.startTask('t1');
  plane.completeTask('t1');

  const engine = new DecisionEngine(plane);
  const decision = await engine.decide();
  assert.equal(decision.type, DECISION_TYPE.COMPLETE);
});

test('DecisionEngine returns EXECUTE_TASK when task is ready', async () => {
  const { plane } = fixture();
  plane.initialize({ goal: 'Test execute' });
  plane.addTask({ id: 't1', title: 'Task 1', requiredEvidence: [] });

  const engine = new DecisionEngine(plane);
  const decision = await engine.decide();
  assert.equal(decision.type, DECISION_TYPE.EXECUTE_TASK);
  assert.equal(decision.taskId, 't1');
});

test('DecisionEngine returns WAIT when tasks are in progress', async () => {
  const { plane } = fixture();
  plane.initialize({ goal: 'Test wait' });
  plane.addTask({ id: 't1', title: 'Task 1', requiredEvidence: [] });
  plane.startTask('t1');

  const engine = new DecisionEngine(plane);
  const decision = await engine.decide();
  assert.equal(decision.type, DECISION_TYPE.WAIT);
});

test('DecisionEngine returns CHECKPOINT at interval', async () => {
  const { plane } = fixture();
  plane.initialize({ goal: 'Test checkpoint' });
  plane.addTask({ id: 't1', title: 'Task 1', requiredEvidence: [] });

  const engine = new DecisionEngine(plane, { checkpointInterval: 1 });
  const decision = await engine.decide();
  assert.equal(decision.type, DECISION_TYPE.CHECKPOINT);
});

test('DecisionEngine tracks history', async () => {
  const { plane } = fixture();
  plane.initialize({ goal: 'Test history' });
  plane.addTask({ id: 't1', title: 'Task 1', requiredEvidence: [] });

  const engine = new DecisionEngine(plane);
  await engine.decide();
  await engine.decide();
  assert.equal(engine.history.length, 2);
  assert.ok(engine.lastDecision);
});

test('DecisionEngine resets state', async () => {
  const { plane } = fixture();
  plane.initialize({ goal: 'Test reset' });
  plane.addTask({ id: 't1', title: 'Task 1', requiredEvidence: [] });

  const engine = new DecisionEngine(plane);
  await engine.decide();
  await engine.decide();
  engine.reset();
  assert.equal(engine.history.length, 0);
});

// ─── Replanner tests ────────────────────────────────────────────────

test('Replanner adds a task', () => {
  const { plane } = fixture();
  plane.initialize({ goal: 'Test add' });
  plane.addTask({ id: 't1', title: 'Task 1', requiredEvidence: [] });

  const replanner = new Replanner(plane);
  const { taskId } = replanner.addTask({ id: 't2', title: 'Task 2', requiredEvidence: [] });
  assert.equal(taskId, 't2');
  const state = plane.load();
  assert.ok(state.tasks.t2);
});

test('Replanner removes a task', () => {
  const { plane } = fixture();
  plane.initialize({ goal: 'Test remove' });
  plane.addTask({ id: 't1', title: 'Task 1', requiredEvidence: [] });
  plane.addTask({ id: 't2', title: 'Task 2', dependencies: ['t1'], requiredEvidence: [] });

  const replanner = new Replanner(plane);
  replanner.removeTask('t2');
  const state = plane.load();
  assert.ok(!state.tasks.t2);
});

test('Replanner changes priority', () => {
  const { plane } = fixture();
  plane.initialize({ goal: 'Test priority' });
  plane.addTask({ id: 't1', title: 'Task 1', requiredEvidence: [] });

  const replanner = new Replanner(plane);
  replanner.changePriority('t1', 'CRITICAL');
  const state = plane.load();
  assert.equal(state.tasks.t1.priority, 'CRITICAL');
});

test('Replanner changes specialist', () => {
  const { plane } = fixture();
  plane.initialize({ goal: 'Test specialist' });
  plane.addTask({ id: 't1', title: 'Task 1', specialist: 'builder', requiredEvidence: [] });

  const replanner = new Replanner(plane);
  replanner.changeSpecialist('t1', 'tester');
  const state = plane.load();
  assert.equal(state.tasks.t1.specialist, 'tester');
});

test('Replanner tracks mutation history', () => {
  const { plane } = fixture();
  plane.initialize({ goal: 'Test history' });
  plane.addTask({ id: 't1', title: 'Task 1', requiredEvidence: [] });

  const replanner = new Replanner(plane);
  replanner.addTask({ id: 't2', title: 'Task 2', requiredEvidence: [] });
  replanner.changePriority('t1', 'HIGH');
  assert.equal(replanner.history.length, 2);
});

test('Replanner gets DAG structure', () => {
  const { plane } = fixture();
  plane.initialize({ goal: 'Test DAG' });
  plane.addTask({ id: 'a', title: 'A', requiredEvidence: [] });
  plane.addTask({ id: 'b', title: 'B', dependencies: ['a'], requiredEvidence: [] });

  const replanner = new Replanner(plane);
  const dag = replanner.getDAG();
  assert.equal(dag.roots.length, 1);
  assert.equal(dag.leaves.length, 1);
  assert.equal(dag.edges.length, 1);
});

// ─── ContextResolver tests ──────────────────────────────────────────

test('ContextResolver resolves task context', () => {
  const { plane } = fixture();
  plane.initialize({ goal: 'Test context' });
  plane.addTask({ id: 't1', title: 'Task 1', specialist: 'builder', priority: 'HIGH', requiredEvidence: ['test'] });
  plane.startTask('t1');
  plane.failTask('t1', { category: 'CODE', cause: 'syntax error', attemptedFixes: [], prevention: '' });

  const resolver = new ContextResolver(plane);
  const ctx = resolver.resolve('t1');
  assert.equal(ctx.task.id, 't1');
  assert.equal(ctx.task.specialist, 'builder');
  assert.equal(ctx.failures.length, 1);
  assert.equal(ctx.failures[0].category, 'CODE');
});

test('ContextResolver detects file conflicts', () => {
  const { plane } = fixture();
  plane.initialize({ goal: 'Test conflicts' });
  plane.addTask({ id: 't1', title: 'Task 1', kind: 'shell', command: 'echo a', requiredEvidence: [] });
  plane.addTask({ id: 't2', title: 'Task 2', kind: 'shell', command: 'echo b', requiredEvidence: [] });

  const resolver = new ContextResolver(plane);
  const { conflicts } = resolver.detectConflicts(['t1', 't2']);
  // No conflicts for tasks without file references
  assert.equal(conflicts.length, 0);
});

test('ContextResolver resolves many tasks', () => {
  const { plane } = fixture();
  plane.initialize({ goal: 'Test many' });
  plane.addTask({ id: 't1', title: 'Task 1', requiredEvidence: [] });
  plane.addTask({ id: 't2', title: 'Task 2', requiredEvidence: [] });

  const resolver = new ContextResolver(plane);
  const contexts = resolver.resolveMany(['t1', 't2']);
  assert.equal(contexts.size, 2);
  assert.ok(contexts.has('t1'));
  assert.ok(contexts.has('t2'));
});

// ─── FailureStrategy tests ──────────────────────────────────────────

test('FailureStrategy selects RETRY for transient failures', () => {
  const { plane } = fixture();
  plane.initialize({ goal: 'Test strategy' });
  plane.addTask({ id: 't1', title: 'Task 1', requiredEvidence: [] });
  plane.startTask('t1');
  plane.failTask('t1', { category: 'NETWORK', cause: 'connection reset', attemptedFixes: [], prevention: '' });

  const strategy = new FailureStrategy(plane);
  const result = strategy.select('t1', { category: 'NETWORK', cause: 'connection reset' });
  assert.equal(result.strategy, STRATEGY_TYPE.RETRY);
  assert.ok(result.confidence > 0);
});

test('FailureStrategy selects ESCALATE for security failures', () => {
  const { plane } = fixture();
  plane.initialize({ goal: 'Test security' });
  plane.addTask({ id: 't1', title: 'Task 1', requiredEvidence: [] });
  plane.startTask('t1');
  plane.failTask('t1', { category: 'SECURITY', cause: 'auth failure', attemptedFixes: [], prevention: '' });

  const strategy = new FailureStrategy(plane);
  const result = strategy.select('t1', { category: 'SECURITY', cause: 'auth failure' });
  assert.equal(result.strategy, STRATEGY_TYPE.ESCALATE);
});

test('FailureStrategy selects SWITCH_AGENT after retries', () => {
  const { plane } = fixture();
  plane.initialize({ goal: 'Test switch' });
  plane.addTask({ id: 't1', title: 'Task 1', specialist: 'builder', requiredEvidence: [] });
  for (let i = 0; i < 3; i++) {
    plane.startTask('t1');
    plane.failTask('t1', { category: 'CODE', cause: `error ${i}`, attemptedFixes: [], prevention: '' });
  }

  const strategy = new FailureStrategy(plane);
  const result = strategy.select('t1', { category: 'CODE', cause: 'error' });
  // Should NOT be RETRY (task is FAILED) — should be a recovery strategy
  assert.ok(result.strategy !== STRATEGY_TYPE.RETRY);
  assert.ok([STRATEGY_TYPE.CHANGE_APPROACH, STRATEGY_TYPE.SWITCH_AGENT, STRATEGY_TYPE.SPLIT_TASK, STRATEGY_TYPE.ESCALATE].includes(result.strategy));
});

test('FailureStrategy gets stats', () => {
  const { plane } = fixture();
  plane.initialize({ goal: 'Test stats' });
  plane.addTask({ id: 't1', title: 'Task 1', requiredEvidence: [] });
  plane.startTask('t1');
  plane.failTask('t1', { category: 'CODE', cause: 'e1', attemptedFixes: [], prevention: '' });
  plane.startTask('t1');
  plane.failTask('t1', { category: 'CODE', cause: 'e2', attemptedFixes: [], prevention: '' });
  plane.startTask('t1');
  plane.failTask('t1', { category: 'TEST', cause: 'e3', attemptedFixes: [], prevention: '' });

  const strategy = new FailureStrategy(plane);
  const stats = strategy.getStats('t1');
  assert.equal(stats.totalFailures, 3);
  assert.equal(stats.categories.CODE, 2);
  assert.equal(stats.categories.TEST, 1);
  assert.equal(stats.mostCommon, 'CODE');
});

// ─── ContextCheckpoint tests ────────────────────────────────────────

test('ContextCheckpoint saves and restores', () => {
  const { plane } = fixture();
  plane.initialize({ goal: 'Test checkpoint' });
  plane.addTask({ id: 't1', title: 'Task 1', requiredEvidence: [] });

  const checkpoint = new ContextCheckpoint(plane);
  const saved = checkpoint.save({ workers: ['w1'], decisions: ['d1'] });
  assert.ok(saved.id);
  assert.ok(saved.path);

  const restored = checkpoint.restore();
  assert.ok(restored);
  assert.equal(restored.state.goal, 'Test checkpoint');
  assert.deepEqual(restored.workers, ['w1']);
});

test('ContextCheckpoint lists checkpoints', () => {
  const { plane } = fixture();
  plane.initialize({ goal: 'Test list' });

  const checkpoint = new ContextCheckpoint(plane);
  checkpoint.save();
  checkpoint.save();

  const list = checkpoint.list();
  assert.equal(list.length, 2);
});

test('ContextCheckpoint deletes a checkpoint', () => {
  const { plane } = fixture();
  plane.initialize({ goal: 'Test delete' });

  const checkpoint = new ContextCheckpoint(plane);
  const saved = checkpoint.save();
  assert.ok(checkpoint.delete(saved.id));

  const list = checkpoint.list();
  assert.equal(list.length, 0);
});

test('ContextCheckpoint applies checkpoint to ControlPlane', () => {
  const { plane } = fixture();
  plane.initialize({ goal: 'Test apply' });
  plane.addTask({ id: 't1', title: 'Task 1', requiredEvidence: [] });

  const checkpoint = new ContextCheckpoint(plane);
  const saved = checkpoint.save();

  // Modify state
  plane.addTask({ id: 't2', title: 'Task 2', requiredEvidence: [] });

  // Apply checkpoint
  const result = checkpoint.apply(saved.id);
  assert.ok(result.restored);

  // Verify state was restored
  const state = plane.load();
  assert.ok(!state.tasks.t2);
});

// ─── AgentRuntime tests ─────────────────────────────────────────────

test('AgentRuntime spawns and lists workers', () => {
  const { plane } = fixture();
  plane.initialize({ goal: 'Test runtime' });
  plane.addTask({ id: 't1', title: 'Task 1', requiredEvidence: [] });

  const runtime = new AgentRuntime(plane);
  const { workerId } = runtime.spawn('t1', 'builder');
  assert.ok(workerId);

  const workers = runtime.listWorkers();
  assert.equal(workers.length, 1);
  assert.equal(workers[0].taskId, 't1');
});

test('AgentRuntime cancels a worker', () => {
  const { plane } = fixture();
  plane.initialize({ goal: 'Test cancel' });
  plane.addTask({ id: 't1', title: 'Task 1', requiredEvidence: [] });

  const runtime = new AgentRuntime(plane);
  const { workerId } = runtime.spawn('t1', 'builder');
  runtime.cancel(workerId, 'test');

  const worker = runtime.getWorker(workerId);
  assert.equal(worker.status, WORKER_STATUS.CANCELLED);
});

test('AgentRuntime stats', () => {
  const { plane } = fixture();
  plane.initialize({ goal: 'Test stats' });
  plane.addTask({ id: 't1', title: 'Task 1', requiredEvidence: [] });
  plane.addTask({ id: 't2', title: 'Task 2', requiredEvidence: [] });

  const runtime = new AgentRuntime(plane);
  runtime.spawn('t1', 'builder');
  runtime.spawn('t2', 'tester');

  const stats = runtime.stats();
  assert.equal(stats.total, 2);
});

test('AgentRuntime resets', () => {
  const { plane } = fixture();
  plane.initialize({ goal: 'Test reset' });
  plane.addTask({ id: 't1', title: 'Task 1', requiredEvidence: [] });

  const runtime = new AgentRuntime(plane);
  runtime.spawn('t1', 'builder');
  runtime.reset();

  const stats = runtime.stats();
  assert.equal(stats.total, 0);
});

// ─── ParallelScheduler tests ────────────────────────────────────────

test('ParallelScheduler runs ready tasks', async () => {
  const { plane } = fixture();
  plane.initialize({ goal: 'Test parallel' });
  plane.addTask({ id: 't1', title: 'Task 1', kind: 'shell', command: 'echo one', requiredEvidence: ['test'] });
  plane.addTask({ id: 't2', title: 'Task 2', kind: 'shell', command: 'echo two', requiredEvidence: ['test'] });

  const scheduler = new ParallelScheduler(plane, { maxConcurrent: 2 });
  const result = await scheduler.runParallel();
  assert.ok(result.executed > 0);
});

test('ParallelScheduler stats', async () => {
  const { plane } = fixture();
  plane.initialize({ goal: 'Test stats' });
  plane.addTask({ id: 't1', title: 'Task 1', kind: 'shell', command: 'echo one', requiredEvidence: ['test'] });

  const scheduler = new ParallelScheduler(plane);
  await scheduler.runParallel();

  const stats = scheduler.stats();
  assert.equal(stats.totalExecuted, 1);
  assert.equal(stats.successes, 1);
});

// ─── AutonomousLoop tests ───────────────────────────────────────────

test('AutonomousLoop runs in dry-run mode', async () => {
  const { plane } = fixture();
  plane.initialize({ goal: 'Test loop dry' });
  plane.addTask({ id: 't1', title: 'Task 1', requiredEvidence: [] });
  plane.addTask({ id: 't2', title: 'Task 2', dependencies: ['t1'], requiredEvidence: [] });

  const loop = new AutonomousLoop(plane, { maxIterations: 3, dryRun: true });
  const result = await loop.run();
  assert.ok(result.iterations > 0);
  assert.ok(result.duration > 0);
});

test('AutonomousLoop status and history', async () => {
  const { plane } = fixture();
  plane.initialize({ goal: 'Test status' });
  plane.addTask({ id: 't1', title: 'Task 1', requiredEvidence: [] });

  const loop = new AutonomousLoop(plane, { maxIterations: 1, dryRun: true });
  await loop.run();

  const status = loop.status();
  assert.ok(status.iteration > 0);

  const history = loop.history();
  assert.ok(history.phases.length > 0);
  assert.ok(history.decisions.length > 0);
});

test('AutonomousLoop stops', async () => {
  const { plane } = fixture();
  plane.initialize({ goal: 'Test stop' });
  // Add many tasks that take time to process
  for (let i = 0; i < 10; i++) {
    plane.addTask({ id: `t${i}`, title: `Task ${i}`, kind: 'shell', command: `echo ${i}`, requiredEvidence: ['test'] });
  }

  const loop = new AutonomousLoop(plane, { maxIterations: 100, maxConcurrent: 1 });
  setTimeout(() => loop.stop('test'), 200);
  const result = await loop.run();
  assert.ok(result.iterations < 100);
});

test('AutonomousLoop resets', async () => {
  const { plane } = fixture();
  plane.initialize({ goal: 'Test reset' });
  plane.addTask({ id: 't1', title: 'Task 1', requiredEvidence: [] });

  const loop = new AutonomousLoop(plane, { maxIterations: 1, dryRun: true });
  await loop.run();
  loop.reset();

  const status = loop.status();
  assert.equal(status.iteration, 0);
  assert.equal(status.running, false);
});

// ─── Integration: Full autonomous mission ───────────────────────────

test('Full autonomous mission: 3-task pipeline', async () => {
  const { plane } = fixture();
  plane.initialize({ goal: 'Ship feature', budgets: { iterations: 50 } });

  // Task A: shell (echo)
  plane.addTask({ id: 'A', title: 'Design', kind: 'shell', command: 'echo design-done', specialist: 'builder', requiredEvidence: ['test'] });
  // Task B: shell (echo), depends on A
  plane.addTask({ id: 'B', title: 'Implement', kind: 'shell', command: 'echo impl-done', dependencies: ['A'], specialist: 'builder', requiredEvidence: ['test'] });
  // Task C: shell (echo), depends on B
  plane.addTask({ id: 'C', title: 'Test', kind: 'shell', command: 'echo test-done', dependencies: ['B'], specialist: 'tester', requiredEvidence: ['test'] });

  const loop = new AutonomousLoop(plane, { maxConcurrent: 2, dryRun: false });
  const events = [];
  loop.on('loop:iteration', (e) => events.push(e));
  loop.on('loop:end', (e) => events.push({ type: 'end', ...e }));

  const result = await loop.run();

  // Verify mission completed
  assert.ok(result.iterations > 0);
  assert.ok(result.duration > 0);
  assert.ok(result.stats.totalExecuted > 0);

  // Verify events were emitted
  assert.ok(events.length > 0);

  // Verify final state
  const status = plane.status();
  assert.equal(status.status, 'COMPLETE');
});

// ─── Replanner: Split and Merge ─────────────────────────────────────

test('Replanner splits a task', () => {
  const { plane } = fixture();
  plane.initialize({ goal: 'Test split' });
  plane.addTask({ id: 'big', title: 'Big task', requiredEvidence: [] });

  const replanner = new Replanner(plane);
  const result = replanner.splitTask('big', [
    { id: 'sub1', title: 'Subtask 1', requiredEvidence: [] },
    { id: 'sub2', title: 'Subtask 2', dependencies: ['sub1'], requiredEvidence: [] },
  ]);

  assert.equal(result.removed, 'big');
  assert.equal(result.added.length, 2);
  const state = plane.load();
  assert.ok(state.tasks.sub1);
  assert.ok(state.tasks.sub2);
  assert.ok(!state.tasks.big);
});

test('Replanner merges tasks', () => {
  const { plane } = fixture();
  plane.initialize({ goal: 'Test merge' });
  plane.addTask({ id: 'a', title: 'A', requiredEvidence: [] });
  plane.addTask({ id: 'b', title: 'B', dependencies: ['a'], requiredEvidence: [] });

  const replanner = new Replanner(plane);
  const result = replanner.mergeTasks(['a', 'b'], { id: 'merged', title: 'Merged', requiredEvidence: [] });

  assert.equal(result.removed.length, 2);
  assert.equal(result.added, 'merged');
  const state = plane.load();
  assert.ok(state.tasks.merged);
  assert.ok(!state.tasks.a);
  assert.ok(!state.tasks.b);
});

test('Replanner creates recovery task', () => {
  const { plane } = fixture();
  plane.initialize({ goal: 'Test recovery' });
  plane.addTask({ id: 'fail', title: 'Failed task', specialist: 'builder', requiredEvidence: [] });

  const replanner = new Replanner(plane);
  const { taskId } = replanner.createRecoveryTask('fail', { title: 'Recover' });

  assert.ok(taskId.startsWith('recovery-fail'));
  const state = plane.load();
  assert.ok(state.tasks[taskId]);
  assert.equal(state.tasks[taskId].specialist, 'builder');
});

test('Replanner changes dependency', () => {
  const { plane } = fixture();
  plane.initialize({ goal: 'Test dep change' });
  plane.addTask({ id: 'a', title: 'A', requiredEvidence: [] });
  plane.addTask({ id: 'b', title: 'B', requiredEvidence: [] });
  plane.addTask({ id: 'c', title: 'C', dependencies: ['a'], requiredEvidence: [] });

  const replanner = new Replanner(plane);
  replanner.changeDependency('c', 'a', 'b');

  const state = plane.load();
  assert.deepEqual(state.tasks.c.dependencies, ['b']);
});

test('Replanner updates acceptance criteria', () => {
  const { plane } = fixture();
  plane.initialize({ goal: 'Test criteria' });
  plane.addTask({ id: 't1', title: 'Task 1', requiredEvidence: [] });

  const replanner = new Replanner(plane);
  replanner.updateAcceptanceCriteria('t1', ['Files compile', 'Tests pass']);

  const state = plane.load();
  assert.deepEqual(state.tasks.t1.acceptanceCriteria, ['Files compile', 'Tests pass']);
});

// ─── ContextCheckpoint: Prune old checkpoints ───────────────────────

test('ContextCheckpoint prunes old checkpoints', () => {
  const { plane } = fixture();
  plane.initialize({ goal: 'Test prune' });

  const checkpoint = new ContextCheckpoint(plane, { maxCheckpoints: 3 });
  checkpoint.save();
  checkpoint.save();
  checkpoint.save();
  checkpoint.save(); // Should prune the oldest

  const list = checkpoint.list();
  assert.equal(list.length, 3);
});

// ─── AgentRuntime: Execute a shell task ─────────────────────────────

test('AgentRuntime executes a shell task', async () => {
  const { plane } = fixture();
  plane.initialize({ goal: 'Test execute' });
  plane.addTask({ id: 'echo', title: 'Echo', kind: 'shell', command: 'echo hello', requiredEvidence: ['test'] });

  const runtime = new AgentRuntime(plane);
  const { workerId } = runtime.spawn('echo', 'builder');
  const result = await runtime.execute(workerId);

  assert.equal(result.success, true);
  assert.equal(result.taskId, 'echo');
});

test('AgentRuntime fails on bad command', async () => {
  const { plane } = fixture();
  plane.initialize({ goal: 'Test fail' });
  plane.addTask({ id: 'fail', title: 'Fail', kind: 'shell', command: 'exit 1', requiredEvidence: [] });

  const runtime = new AgentRuntime(plane);
  const { workerId } = runtime.spawn('fail', 'builder');
  const result = await runtime.execute(workerId);

  assert.equal(result.success, false);
});

// ─── ParallelScheduler: runUntilComplete ────────────────────────────

test('ParallelScheduler runs until complete', async () => {
  const { plane } = fixture();
  plane.initialize({ goal: 'Test until' });
  plane.addTask({ id: 'a', title: 'A', kind: 'shell', command: 'echo a', requiredEvidence: ['test'] });
  plane.addTask({ id: 'b', title: 'B', dependencies: ['a'], kind: 'shell', command: 'echo b', requiredEvidence: ['test'] });

  const scheduler = new ParallelScheduler(plane);
  const result = await scheduler.runUntilComplete();

  assert.ok(result.totalResults >= 2);
  assert.ok(result.iterations >= 2);
});
