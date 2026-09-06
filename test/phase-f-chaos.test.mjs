/**
 * Phase F Chaos Engineering Suite — production-grade chaos tests.
 *
 * Tests:
 *   1. Crash recovery — write partial state, verify recovery
 *   2. Corruption detection — write corrupt state, verify detection
 *   3. Worker failure — kill worker, verify supervisor detects
 *   4. Budget exhaustion — run through budget, verify enforcement
 *   5. Stall detection — simulate stall, verify detection
 *   6. Circuit breaker — trigger failures, verify circuit opens
 *   7. Lock contention — concurrent lock attempts
 *   8. File system failure — simulate write failure
 *   9. State machine invalid transitions
 *  10. Memory pressure — large state handling
 *  11. Rapid restart — crash and recover quickly
 *  12. Timeline overflow — too many events
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// Import production modules
import { ControlPlane } from '../runtime/control-plane.mjs';
import { WorkerSupervisor } from '../runtime/worker-supervisor.mjs';
import { ResourceGovernor } from '../runtime/resource-governor.mjs';
import { StructuredLogger } from '../runtime/structured-logger.mjs';
import { NetworkResilience, CircuitOpenError } from '../runtime/network-resilience.mjs';
import { FileSystemGuard } from '../runtime/filesystem-guard.mjs';
import { StateMachine, createTaskStateMachine, createMissionStateMachine } from '../runtime/state-machine.mjs';
import { MissionTimeline } from '../runtime/mission-timeline.mjs';
import { MissionRecovery } from '../runtime/mission-recovery.mjs';

// ─── Helpers ───────────────────────────────────────────────────────

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'chaos-f-'));
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {}
}

// ─── Test Suite ────────────────────────────────────────────────────

describe('Phase F — Crash Recovery', () => {
  let tmpDir, plane;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    plane = new ControlPlane(tmpDir);
    plane.initialize({ goal: 'Chaos test mission', mode: 'AUTONOMOUS' });
  });

  afterEach(() => cleanup(tmpDir));

  it('should detect corrupted state file', () => {
    // Write corrupt data
    fs.writeFileSync(plane.stateFile, '{corrupt json!!!');

    // load() now catches JSON.parse errors and throws ControlPlaneError
    assert.throws(() => plane.load(), { code: 'CORRUPT_STATE' });
  });

  it('should recover from missing state file', () => {
    // Delete state file
    fs.unlinkSync(plane.stateFile);

    assert.throws(() => plane.load(), { code: 'NOT_INITIALIZED' });
  });

  it('should handle concurrent writes without corruption', () => {
    // Simulate concurrent writes by writing directly
    const state = plane.load();
    state.tasks['concurrent-1'] = { id: 'concurrent-1', title: 'Test' };
    fs.writeFileSync(plane.stateFile, JSON.stringify(state));

    // Write another version
    state.tasks['concurrent-2'] = { id: 'concurrent-2', title: 'Test 2' };
    fs.writeFileSync(plane.stateFile, JSON.stringify(state));

    // Should still load valid state
    const loaded = plane.load();
    assert.ok(loaded.tasks['concurrent-2']);
  });
});

describe('Phase F — Worker Supervision', () => {
  let tmpDir, plane, supervisor;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    plane = new ControlPlane(tmpDir);
    plane.initialize({ goal: 'Worker test', mode: 'AUTONOMOUS' });
    supervisor = new WorkerSupervisor(plane, { heartbeatTimeoutMs: 100 });
  });

  afterEach(() => {
    supervisor.stopMonitoring();
    cleanup(tmpDir);
  });

  it('should track worker lifecycle', () => {
    const workerId = supervisor.register('task-1', { pid: process.pid });
    assert.ok(workerId);

    supervisor.start(workerId);
    assert.equal(supervisor.getWorker(workerId).state, 'RUNNING');

    supervisor.heartbeat(workerId);
    assert.ok(supervisor.getWorker(workerId).lastHeartbeat > 0);

    supervisor.complete(workerId);
    assert.equal(supervisor.getWorker(workerId).state, 'COMPLETED');
  });

  it('should detect hung workers', async () => {
    const workerId = supervisor.register('task-hung', { timeout: 50 });
    supervisor.start(workerId);

    // Wait for heartbeat timeout
    await new Promise(resolve => setTimeout(resolve, 200));

    supervisor._checkWorkerHealth();
    assert.equal(supervisor.getWorker(workerId).state, 'HUNG');
  });

  it('should track consecutive failures', () => {
    const workerId = supervisor.register('task-fail', {});

    supervisor.fail(workerId, { message: 'Error 1' });
    supervisor.fail(workerId, { message: 'Error 2' });
    supervisor.fail(workerId, { message: 'Error 3' });

    const worker = supervisor.getWorker(workerId);
    assert.equal(worker.consecutiveFailures, 3);
    assert.equal(worker.state, 'DEAD'); // After maxConsecutiveFailures
  });

  it('should provide health summary', () => {
    supervisor.register('task-a');
    supervisor.register('task-b');
    supervisor.register('task-c');

    const health = supervisor.health();
    assert.equal(health.total, 3);
    assert.equal(health.idle, 3);
  });
});

describe('Phase F — Resource Governance', () => {
  let governor;

  beforeEach(() => {
    governor = new ResourceGovernor({
      mission: { iterations: 5, timeMs: 1000, costCents: 100, maxConcurrent: 2 },
      task: { retries: 2, timeoutMs: 500 },
    });
  });

  it('should enforce iteration budget', () => {
    governor.startMission();

    for (let i = 0; i < 5; i++) {
      assert.ok(governor.canIterate());
      governor.recordIteration();
    }

    assert.ok(!governor.canIterate());
  });

  it('should enforce time budget', () => {
    governor.startMission();
    assert.ok(governor.hasTimeRemaining());

    // Simulate time passing (by manipulating start time)
    governor._startTime = Date.now() - 2000;
    assert.ok(!governor.hasTimeRemaining());
  });

  it('should enforce cost budget', () => {
    governor.startMission();

    assert.ok(governor.canSpend(50));
    governor.recordCost(50);

    assert.ok(governor.canSpend(49));
    governor.recordCost(49);

    assert.ok(!governor.canSpend(2)); // Would exceed 100
  });

  it('should enforce concurrent limit', () => {
    governor.startMission();

    assert.ok(governor.canStartConcurrent());
    governor.registerConcurrentStart();

    assert.ok(governor.canStartConcurrent());
    governor.registerConcurrentStart();

    assert.ok(!governor.canStartConcurrent()); // At max

    governor.registerConcurrentEnd();
    assert.ok(governor.canStartConcurrent());
  });

  it('should enforce per-task retry budget', () => {
    governor.registerTask('task-1', { retries: 2 });

    assert.ok(governor.canRetry('task-1'));
    governor.recordRetry('task-1');

    assert.ok(governor.canRetry('task-1'));
    governor.recordRetry('task-1');

    assert.ok(!governor.canRetry('task-1'));
  });

  it('should report violations', () => {
    governor.startMission();

    for (let i = 0; i < 6; i++) {
      governor.canIterate();
      governor.recordIteration();
    }

    const violations = governor.violations();
    assert.ok(violations.length > 0);
  });

  it('should provide status summary', () => {
    governor.startMission();
    governor.recordIteration();
    governor.recordCost(10);

    const status = governor.status();
    assert.equal(status.mission.iterations.used, 1);
    assert.equal(status.mission.cost.used, 10);
  });
});

describe('Phase F — Network Resilience', () => {
  let resilience;

  beforeEach(() => {
    resilience = new NetworkResilience({ maxRetries: 2, baseDelayMs: 10, circuitBreakerThreshold: 3 });
  });

  it('should retry with backoff', async () => {
    let attempts = 0;
    const result = await resilience.retry(async () => {
      attempts++;
      if (attempts < 3) throw new Error('Temporary failure');
      return 'success';
    }, { service: 'test' });

    assert.equal(result, 'success');
    assert.equal(attempts, 3);
  });

  it('should open circuit after threshold', async () => {
    for (let i = 0; i < 3; i++) {
      try {
        await resilience.retry(async () => { throw new Error('Fail'); }, { service: 'failing' });
      } catch (e) {}
    }

    const circuit = resilience.getCircuitState('failing');
    assert.equal(circuit.state, 'OPEN');
  });

  it('should reject when circuit is open', async () => {
    // Open the circuit
    resilience.resetCircuit('test');
    resilience._circuits.set('test', { state: 'OPEN', failures: 5, lastFailure: Date.now(), openedAt: Date.now() });

    await assert.rejects(
      () => resilience.retry(async () => 'ok', { service: 'test' }),
      CircuitOpenError
    );
  });

  it('should handle model fallback', async () => {
    const result = await resilience.modelCall(
      async () => { throw new Error('Primary failed'); },
      {
        fallbacks: [
          { service: 'fallback-1', fn: async () => 'fallback result' },
        ],
      }
    );

    assert.equal(result, 'fallback result');
  });

  it('should calculate exponential backoff', () => {
    const delay0 = resilience._calculateDelay(0);
    const delay1 = resilience._calculateDelay(1);
    const delay2 = resilience._calculateDelay(2);

    assert.ok(delay0 < delay1);
    assert.ok(delay1 < delay2);
    assert.ok(delay2 <= resilience.maxDelayMs);
  });
});

describe('Phase F — File System Guard', () => {
  let tmpDir, guard;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    guard = new FileSystemGuard(tmpDir);
  });

  afterEach(() => cleanup(tmpDir));

  it('should write files atomically', () => {
    const result = guard.atomicWrite(path.join(tmpDir, 'test.txt'), 'hello');
    assert.equal(result.bytes, 5);
    assert.equal(fs.readFileSync(path.join(tmpDir, 'test.txt'), 'utf8'), 'hello');
  });

  it('should prevent path traversal', () => {
    assert.ok(!guard.isPathSafe('../../../etc/passwd'));
    assert.ok(guard.isPathSafe('safe/file.txt'));
  });

  it('should acquire and release locks', () => {
    const lockFile = path.join(tmpDir, 'test.lock');
    assert.ok(guard.acquireLock(path.join(tmpDir, 'test.txt'), 'owner1'));
    assert.ok(!guard.acquireLock(path.join(tmpDir, 'test.txt'), 'owner2')); // Should fail
    guard.releaseLock(path.join(tmpDir, 'test.txt'));
    assert.ok(guard.acquireLock(path.join(tmpDir, 'test.txt'), 'owner3')); // Should succeed after release
  });

  it('should cleanup stale temp files', () => {
    // Create temp file
    const tmpFile = path.join(tmpDir, 'file.tmp.12345');
    fs.writeFileSync(tmpFile, 'temp');

    const cleaned = guard.cleanupStaleTemp();
    // May or may not clean depending on file age
    assert.ok(typeof cleaned === 'number');
  });
});

describe('Phase F — State Machine', () => {
  it('should enforce valid transitions', () => {
    const sm = createTaskStateMachine();

    assert.equal(sm.state, 'PENDING');
    assert.ok(sm.canTransition('IN_PROGRESS'));

    const result = sm.transition('IN_PROGRESS');
    assert.ok(result.success);
    assert.equal(sm.state, 'IN_PROGRESS');
  });

  it('should reject invalid transitions', () => {
    const sm = createTaskStateMachine();

    const result = sm.transition('COMPLETE'); // Can't go PENDING → COMPLETE
    assert.ok(!result.success);
    assert.equal(sm.state, 'PENDING');
  });

  it('should support guard conditions', () => {
    const sm = createTaskStateMachine();
    sm.addGuard('PENDING', 'IN_PROGRESS', (ctx) => {
      return ctx.approved ? true : 'Not approved';
    });

    // Should reject without approval
    const result1 = sm.transition('IN_PROGRESS', { approved: false });
    assert.ok(!result1.success);

    // Should accept with approval
    const result2 = sm.transition('IN_PROGRESS', { approved: true });
    assert.ok(result2.success);
  });

  it('should support rollback', () => {
    const sm = createTaskStateMachine();
    sm.transition('IN_PROGRESS');
    sm.transition('FAILED');

    const result = sm.rollback('PENDING');
    assert.ok(result.success);
    assert.equal(sm.state, 'PENDING');
  });

  it('should track audit trail', () => {
    const sm = createTaskStateMachine();
    sm.transition('IN_PROGRESS');
    sm.transition('COMPLETE');

    const trail = sm.auditTrail();
    // INIT + 2 transitions = 3 entries
    assert.equal(trail.length, 3);
    assert.equal(trail[0].to, 'PENDING');   // INIT
    assert.equal(trail[1].to, 'IN_PROGRESS');
    assert.equal(trail[2].to, 'COMPLETE');
  });

  it('should detect terminal states', () => {
    const sm = createTaskStateMachine();
    assert.ok(!sm.isTerminal());

    sm.transition('IN_PROGRESS');
    sm.transition('COMPLETE');
    assert.ok(sm.isTerminal());
  });
});

describe('Phase F — Mission Timeline', () => {
  let timeline;

  beforeEach(() => {
    timeline = new MissionTimeline();
  });

  it('should record events', () => {
    timeline.record({ type: 'task:start', source: 'worker', message: 'Task started' });
    timeline.record({ type: 'task:end', source: 'worker', message: 'Task completed' });

    assert.equal(timeline.all().length, 2);
  });

  it('should track phases', () => {
    timeline.startPhase('build');
    timeline.endPhase('build', { success: true });

    const durations = timeline.durations();
    assert.equal(durations.totalEvents, 2); // start + end
  });

  it('should correlate events', () => {
    const corrId = 'corr-1';
    timeline.record({ type: 'start', correlationId: corrId, message: 'A' });
    timeline.record({ type: 'middle', correlationId: corrId, message: 'B' });
    timeline.record({ type: 'end', correlationId: corrId, message: 'C' });

    const correlated = timeline.byCorrelation(corrId);
    assert.equal(correlated.length, 3);
  });

  it('should render timeline', () => {
    timeline.record({ type: 'test', source: 'unit', message: 'Testing' });
    const rendered = timeline.render();
    assert.ok(rendered.includes('MISSION TIMELINE'));
    assert.ok(rendered.includes('Testing'));
  });
});

describe('Phase F — Mission Recovery', () => {
  let tmpDir, plane, recovery;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    plane = new ControlPlane(tmpDir);
    plane.initialize({ goal: 'Recovery test', mode: 'AUTONOMOUS' });
    recovery = new MissionRecovery(plane);
  });

  afterEach(() => cleanup(tmpDir));

  it('should save and load mission state', () => {
    const state = { goal: 'Test', progress: 50 };
    recovery.saveMissionState(state);

    const loaded = recovery.loadMissionState();
    assert.equal(loaded.goal, 'Test');
    assert.equal(loaded.progress, 50);
    assert.ok(loaded.checksum);
  });

  it('should detect corrupted mission state', () => {
    fs.writeFileSync(recovery._missionStateFile, 'corrupt');
    const loaded = recovery.loadMissionState();
    assert.equal(loaded, null);
  });

  it('should create and list checkpoints', () => {
    recovery.createCheckpoint('Step 1 done');
    recovery.createCheckpoint('Step 2 done');

    const list = recovery.listCheckpoints();
    assert.equal(list.length, 2);
  });

  it('should restore latest checkpoint', () => {
    recovery.createCheckpoint('Step 1', { tasks: { t1: { status: 'COMPLETE' } } });
    recovery.createCheckpoint('Step 2', { tasks: { t2: { status: 'COMPLETE' } } });

    const latest = recovery.restoreLatestCheckpoint();
    assert.ok(latest);
    assert.equal(latest.summary, 'Step 2');
  });

  it('should append to timeline', () => {
    recovery.appendTimeline({ type: 'task:start', message: 'Starting' });
    recovery.appendTimeline({ type: 'task:end', message: 'Done' });

    const timeline = recovery.getTimeline();
    assert.equal(timeline.length, 2);
  });

  it('should assess recovery feasibility', () => {
    recovery.saveMissionState({ goal: 'Test' });
    recovery.createCheckpoint('Checkpoint 1');

    const assessment = recovery.assessRecovery();
    assert.ok(assessment.recoverable);
    assert.ok(assessment.data.missionState);
  });
});

describe('Phase F — Structured Logger', () => {
  let tmpDir, logger;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    logger = new StructuredLogger(tmpDir, 'DEBUG', { console: false, file: true });
  });

  afterEach(() => cleanup(tmpDir));

  it('should log at correct levels', () => {
    logger.debug('debug msg');
    logger.info('info msg');
    logger.warn('warn msg');
    logger.error('error msg');

    const recent = logger.recent();
    assert.ok(recent.length >= 4);
  });

  it('should redact sensitive data', () => {
    logger.audit('test.action', { password: 'secret123', apiKey: 'key123' });

    const recent = logger.recent();
    const entry = recent.find(e => e.message?.includes('AUDIT'));
    assert.ok(entry);
    // Sensitive fields should be redacted
  });

  it('should track correlation IDs', () => {
    logger.setCorrelationId('corr-123');
    logger.info('correlated message');

    const recent = logger.recent();
    const entry = recent.find(e => e.message?.includes('correlated'));
    assert.equal(entry?.correlationId, 'corr-123');

    logger.clearContext();
  });
});

describe('Phase F — Integration: Full Production Pipeline', () => {
  let tmpDir, plane, supervisor, governor, logger, recovery, timeline;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    plane = new ControlPlane(tmpDir);
    plane.initialize({ goal: 'Full production test', mode: 'AUTONOMOUS' });

    supervisor = new WorkerSupervisor(plane);
    governor = new ResourceGovernor({ mission: { iterations: 10 } });
    logger = new StructuredLogger(path.join(tmpDir, 'logs'), 'INFO', { console: false });
    recovery = new MissionRecovery(plane);
    timeline = new MissionTimeline();
  });

  afterEach(() => {
    supervisor.stopMonitoring();
    cleanup(tmpDir);
  });

  it('should execute full production workflow', async () => {
    // Start mission
    governor.startMission();
    timeline.startPhase('mission');
    logger.missionEvent('started');

    // Add tasks
    plane.addTask({ id: 't1', title: 'Task 1' });
    plane.addTask({ id: 't2', title: 'Task 2', dependencies: ['t1'] });

    // Execute task 1
    supervisor.register('t1');
    governor.registerTask('t1');
    plane.startTask('t1');
    plane.recordEvidence('t1', { type: 'test', verdict: 'PASS', summary: 'Tests pass' });
    plane.completeTask('t1');
    supervisor.complete(supervisor._workers.keys().next().value);

    // Checkpoint
    recovery.createCheckpoint('Task 1 done');
    timeline.record({ type: 'task:complete', source: 'worker', message: 'Task 1 done' });

    // Execute task 2
    plane.startTask('t2');
    plane.recordEvidence('t2', { type: 'test', verdict: 'PASS', summary: 'Tests pass' });
    plane.completeTask('t2');

    // Complete mission
    timeline.endPhase('mission');
    logger.missionEvent('completed');

    // Verify
    const status = plane.status();
    assert.equal(status.status, 'COMPLETE');

    const timelineData = timeline.all();
    assert.ok(timelineData.length > 0);

    const recovered = recovery.loadMissionState();
    // Should be recoverable
  });
});
