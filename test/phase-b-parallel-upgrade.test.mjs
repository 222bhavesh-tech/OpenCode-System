import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { ParallelScheduler, SCHEDULER_WORKER_STATUS, AGENT_CAPABILITY, DEFAULT_CAPABILITIES } from '../runtime/parallel-scheduler.mjs';

describe('B8: Parallel Scheduler Upgrade', function() {
  it('should export new constants', function() {
    assert.ok(SCHEDULER_WORKER_STATUS);
    assert.ok(SCHEDULER_WORKER_STATUS.PAUSING);
    assert.ok(SCHEDULER_WORKER_STATUS.RESUMING);
    assert.ok(SCHEDULER_WORKER_STATUS.DEGRADED);
    assert.ok(AGENT_CAPABILITY);
    assert.ok(AGENT_CAPABILITY.BUILDER);
    assert.ok(DEFAULT_CAPABILITIES);
  });

  it('should create a scheduler with new options', function() {
    const mockPlane = {
      load: () => ({ tasks: {} }),
      readyTasks: () => [],
      recordEvidence: () => {},
      recordFailure: () => {},
      status: () => ({ status: 'IN_PROGRESS' }),
    };
    const scheduler = new ParallelScheduler(mockPlane, {
      maxConcurrent: 5,
      maxIterations: 100,
      healthCheckInterval: 60000,
      degradedThreshold: 0.3,
    });
    assert.equal(scheduler.maxConcurrent, 5);
    assert.equal(scheduler.maxIterations, 100);
    assert.equal(scheduler.degradedThreshold, 0.3);
  });

  it('should track file ownership', function() {
    const mockPlane = {
      load: () => ({ tasks: {} }),
      readyTasks: () => [],
      recordEvidence: () => {},
      recordFailure: () => {},
      status: () => ({ status: 'IN_PROGRESS' }),
    };
    const scheduler = new ParallelScheduler(mockPlane);
    const claim1 = scheduler.tryClaimFile('worker-1', 'src/app.js');
    assert.equal(claim1.success, true);
    const claim2 = scheduler.tryClaimFile('worker-2', 'src/app.js');
    assert.equal(claim2.success, false);
    assert.equal(claim2.owner, 'worker-1');
    scheduler.releaseFile('worker-1', 'src/app.js');
    const claim3 = scheduler.tryClaimFile('worker-2', 'src/app.js');
    assert.equal(claim3.success, true);
  });

  it('should detect file conflicts', function() {
    const mockPlane = {
      load: () => ({ tasks: {} }),
      readyTasks: () => [],
      recordEvidence: () => {},
      recordFailure: () => {},
      status: () => ({ status: 'IN_PROGRESS' }),
    };
    const scheduler = new ParallelScheduler(mockPlane);
    // No conflicts when files are owned by different workers
    scheduler._fileOwnership.set('src/app.js', 'worker-1');
    scheduler._fileOwnership.set('src/utils.js', 'worker-2');
    const conflicts = scheduler.getFileConflicts();
    assert.equal(conflicts.length, 0);
    // Conflicts are prevented by tryClaimFile (Map enforces single ownership)
    const result = scheduler.tryClaimFile('worker-2', 'src/app.js');
    assert.equal(result.success, false);
    assert.equal(result.owner, 'worker-1');
  });

  it('should register and match capabilities', function() {
    const mockPlane = {
      load: () => ({ tasks: {} }),
      readyTasks: () => [],
      recordEvidence: () => {},
      recordFailure: () => {},
      status: () => ({ status: 'IN_PROGRESS' }),
    };
    const scheduler = new ParallelScheduler(mockPlane);
    const role = scheduler.matchTaskToRole(['code-write', 'file-edit']);
    assert.equal(role, AGENT_CAPABILITY.BUILDER);
    const role2 = scheduler.matchTaskToRole(['test-run', 'code-read']);
    assert.equal(role2, AGENT_CAPABILITY.TESTER);
  });

  it('should track worker health', function() {
    const mockPlane = {
      load: () => ({ tasks: {} }),
      readyTasks: () => [],
      recordEvidence: () => {},
      recordFailure: () => {},
      status: () => ({ status: 'IN_PROGRESS' }),
    };
    const scheduler = new ParallelScheduler(mockPlane);
    scheduler._workerStates.set('w1', { workerId: 'w1', status: 'RUNNING', healthScore: 1.0, ownedFiles: [] });
    scheduler.updateWorkerHealth('w1', 0.2);
    const ext = scheduler._workerStates.get('w1');
    assert.equal(ext.healthScore, 0.2);
    assert.equal(ext.status, SCHEDULER_WORKER_STATUS.DEGRADED);
  });

  it('should pause and resume scheduler', function() {
    const mockPlane = {
      load: () => ({ tasks: {} }),
      readyTasks: () => [],
      recordEvidence: () => {},
      recordFailure: () => {},
      status: () => ({ status: 'IN_PROGRESS' }),
    };
    const scheduler = new ParallelScheduler(mockPlane);
    scheduler.pause();
    assert.equal(scheduler._pauseRequested, true);
    scheduler.resume();
    assert.equal(scheduler._pauseRequested, false);
  });

  it('should run parallel with iteration limit', async function() {
    const mockPlane = {
      load: () => ({ tasks: {} }),
      readyTasks: () => [],
      recordEvidence: () => {},
      recordFailure: () => {},
      status: () => ({ status: 'IN_PROGRESS' }),
    };
    const scheduler = new ParallelScheduler(mockPlane, { maxIterations: 2 });
    scheduler._iteration = 3; // Exceed limit
    const result = await scheduler.runParallel();
    assert.equal(result.executed, 0);
    assert.equal(result.reason, 'iteration-limit');
  });

  it('should get stats with new fields', function() {
    const mockPlane = {
      load: () => ({ tasks: {} }),
      readyTasks: () => [],
      recordEvidence: () => {},
      recordFailure: () => {},
      status: () => ({ status: 'IN_PROGRESS' }),
    };
    const scheduler = new ParallelScheduler(mockPlane);
    const stats = scheduler.stats();
    assert.equal(typeof stats.filesClaimed, 'number');
    assert.equal(typeof stats.degradedMode, 'boolean');
    assert.equal(typeof stats.pauseRequested, 'boolean');
  });
});