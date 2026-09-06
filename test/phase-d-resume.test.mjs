import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ControlPlane } from '../runtime/control-plane.mjs';
import { ContextCheckpoint } from '../runtime/context-checkpoint.mjs';
import { StateSnapshot } from '../runtime/state-snapshot.mjs';
import { MissionMemory } from '../runtime/mission-memory.mjs';
import { Dashboard } from '../runtime/dashboard.mjs';

const RESUME_DIR = path.join(process.cwd(), 'test-resume-project');

function cleanResume() {
  const dir = path.join(RESUME_DIR, '.opencode-system');
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function initResume() {
  cleanResume();
  const plane = new ControlPlane(RESUME_DIR);
  plane.initialize({ goal: 'Resume test mission', mode: 'ASSISTED', budgets: { iterations: 50, retriesPerTask: 2, parallelAgents: 1 } });
  return plane;
}

// ═══ Fresh-process resume ═══

describe('RESUME: Fresh process recovers mission state', () => {
  it('should reconstruct state from durable storage', () => {
    // Process 1: Start mission, complete some tasks
    const plane1 = initResume();
    plane1.addTask({ id: 't1', title: 'Task 1', kind: 'shell', command: 'echo ok', requiredEvidence: [] });
    plane1.addTask({ id: 't2', title: 'Task 2', kind: 'shell', command: 'echo ok', dependencies: ['t1'], requiredEvidence: [] });
    plane1.addTask({ id: 't3', title: 'Task 3', kind: 'shell', command: 'echo ok', dependencies: ['t2'], requiredEvidence: [] });
    plane1.startTask('t1');
    plane1.completeTask('t1');
    plane1.startTask('t2');
    // Save checkpoint
    const checkpoint = new ContextCheckpoint(plane1);
    checkpoint.save({ workers: [], decisions: [], mutations: [] });

    // Process 2: New ControlPlane instance (simulates fresh process)
    const plane2 = new ControlPlane(RESUME_DIR);
    const state = plane2.load();

    // Verify state was reconstructed
    assert.equal(state.tasks['t1'].status, 'COMPLETE', 'Task 1 completed');
    assert.equal(state.tasks['t2'].status, 'IN_PROGRESS', 'Task 2 in progress');
    assert.equal(state.tasks['t3'].status, 'PENDING', 'Task 3 pending');
    assert.equal(state.goal, 'Resume test mission', 'Goal preserved');
    assert.ok(state.events.length > 0, 'Events preserved');

    // Continue mission in new process
    plane2.completeTask('t2');
    plane2.startTask('t3');
    plane2.completeTask('t3');
    const finalStatus = plane2.status();
    assert.equal(finalStatus.status, 'COMPLETE', 'Mission completed after resume');
    cleanResume();
  });
});

// ═══ State snapshot resume ═══

describe('RESUME: State snapshot enables point-in-time recovery', () => {
  it('should restore from snapshot', () => {
    const plane = initResume();
    plane.addTask({ id: 't1', title: 'Task 1', kind: 'shell', command: 'echo ok', requiredEvidence: [] });
    plane.addTask({ id: 't2', title: 'Task 2', kind: 'shell', command: 'echo ok', requiredEvidence: [] });
    plane.startTask('t1');
    plane.completeTask('t1');

    // Save snapshot
    const snap = new StateSnapshot(RESUME_DIR);
    const saved = snap.save('mid-mission');

    // Continue and fail
    plane.startTask('t2');
    plane.failTask('t2', { category: 'CODE', cause: 'broken' });

    // Restore from snapshot
    snap.restore(saved.id);
    const restored = new ControlPlane(RESUME_DIR);
    const state = restored.load();
    assert.equal(state.tasks['t1'].status, 'COMPLETE', 'Task 1 restored as complete');
    assert.equal(state.tasks['t2'].status, 'PENDING', 'Task 2 restored as pending (not failed)');
    cleanResume();
  });
});

// ═══ Memory persists across sessions ═══

describe('RESUME: Mission memory persists across sessions', () => {
  it('should recall missions from previous sessions', () => {
    const memory1 = new MissionMemory(RESUME_DIR);
    memory1.save({ id: 'm1', objective: 'Previous mission', outcome: 'SUCCESS', qualityScore: 0.9 });

    // New "session" — new memory instance
    const memory2 = new MissionMemory(RESUME_DIR);
    const recalled = memory2.recall('Previous mission');
    assert.ok(recalled.length > 0, 'Recalled mission from previous session');
    assert.equal(recalled[0].outcome, 'SUCCESS');
    memory1.clear();
  });
});

// ═══ Dashboard shows current state ═══

describe('RESUME: Dashboard reflects current state', () => {
  it('should show accurate task counts after resume', () => {
    const plane = initResume();
    plane.addTask({ id: 't1', title: 'Task 1', kind: 'shell', command: 'echo ok', requiredEvidence: [] });
    plane.addTask({ id: 't2', title: 'Task 2', kind: 'shell', command: 'echo ok', requiredEvidence: [] });
    plane.startTask('t1');
    plane.completeTask('t1');

    const dash = new Dashboard(RESUME_DIR);
    const report = dash.generate();
    assert.equal(report.totalTasks, 2);
    assert.equal(report.taskCounts.COMPLETE, 1);
    assert.equal(report.taskCounts.PENDING, 1);
    assert.equal(report.completionRate, 50);
    cleanResume();
  });
});