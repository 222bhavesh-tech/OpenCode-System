import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { AdaptiveLoop, LOOP_STATE } from '../runtime/adaptive-loop.mjs';
import { StateSnapshot } from '../runtime/state-snapshot.mjs';
import { Dashboard } from '../runtime/dashboard.mjs';
import { ControlPlane } from '../runtime/control-plane.mjs';

const TEST_DIR = 'C:/Users/bhavesh jeengar/OpenCode-System/test-project-d';

function cleanState() {
  const dir = path.join(TEST_DIR, '.opencode-system');
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function setupPlane() {
  cleanState();
  const plane = new ControlPlane(TEST_DIR);
  plane.initialize({ goal: 'Test mission D', mode: 'ASSISTED' });
  return plane;
}

// ═══ AdaptiveLoop ═══

describe('AdaptiveLoop: initialization', () => {
  it('should create loop with default options', () => {
    const plane = setupPlane();
    const loop = new AdaptiveLoop(plane);
    assert.equal(loop.state, LOOP_STATE.IDLE);
    assert.equal(loop.iteration, 0);
    assert.ok(loop.strategyEngine, 'Has strategy engine');
    assert.ok(loop.failurePredictor, 'Has failure predictor');
    assert.ok(loop.telemetry, 'Has telemetry');
    assert.ok(loop.governor, 'Has governor');
    assert.ok(loop.memory, 'Has memory');
  });

  it('should create loop with custom options', () => {
    const plane = setupPlane();
    const loop = new AdaptiveLoop(plane, { maxIterations: 10, maxConcurrent: 2 });
    assert.equal(loop.maxIterations, 10);
    assert.equal(loop.maxConcurrent, 2);
  });
});

describe('AdaptiveLoop: run empty mission', () => {
  it('should complete immediately with no tasks', async () => {
    const plane = setupPlane();
    const loop = new AdaptiveLoop(plane, { maxIterations: 5 });
    const result = await loop.run();
    assert.equal(result.state, LOOP_STATE.COMPLETED);
    assert.equal(result.total, 0);
    assert.ok(result.duration >= 0);
  });
});

describe('AdaptiveLoop: run with tasks', () => {
  it('should process tasks through the loop', async () => {
    const plane = setupPlane();
    plane.addTask({ id: 't1', title: 'Task 1', requiredEvidence: [] });
    plane.addTask({ id: 't2', title: 'Task 2', dependencies: [], requiredEvidence: [] });
    const loop = new AdaptiveLoop(plane, { maxIterations: 5 });
    const events = [];
    loop.on('loop:iteration', (e) => events.push(e));
    const result = await loop.run();
    assert.ok(result.iterations >= 1, 'Ran at least 1 iteration');
    assert.ok(events.length > 0, 'Emitted iteration events');
  });
});

describe('AdaptiveLoop: pause and resume', () => {
  it('should pause and resume', () => {
    const plane = setupPlane();
    const loop = new AdaptiveLoop(plane);
    loop.state = LOOP_STATE.RUNNING;
    loop.pause();
    assert.equal(loop.state, LOOP_STATE.PAUSED);
    loop.resume();
    assert.equal(loop.state, LOOP_STATE.RUNNING);
  });
});

describe('AdaptiveLoop: stop', () => {
  it('should stop with reason', () => {
    const plane = setupPlane();
    const loop = new AdaptiveLoop(plane);
    loop.state = LOOP_STATE.RUNNING;
    loop.stop('user cancelled');
    assert.equal(loop.state, LOOP_STATE.FAILED);
  });
});

describe('AdaptiveLoop: getStatus', () => {
  it('should return full status', () => {
    const plane = setupPlane();
    plane.addTask({ id: 't1', title: 'Task 1', requiredEvidence: [] });
    const loop = new AdaptiveLoop(plane);
    const status = loop.getStatus();
    assert.equal(status.state, LOOP_STATE.IDLE);
    assert.equal(status.tasks.total, 1);
    assert.ok(status.economics, 'Has economics');
    assert.ok(status.telemetry, 'Has telemetry');
  });
});

// ═══ StateSnapshot ═══

describe('StateSnapshot: save and list', () => {
  it('should save and list snapshots', () => {
    const plane = setupPlane();
    const snap = new StateSnapshot(TEST_DIR);
    const result = snap.save('test-snapshot');
    assert.ok(result.id, 'Has ID');
    assert.equal(result.label, 'test-snapshot');
    const list = snap.list();
    assert.ok(list.length >= 1, 'Has at least 1 snapshot');
    assert.equal(list[0].label, 'test-snapshot');
  });
});

describe('StateSnapshot: restore', () => {
  it('should restore from snapshot', () => {
    const plane = setupPlane();
    const snap = new StateSnapshot(TEST_DIR);
    const saved = snap.save('before-change');
    const restored = snap.restore(saved.id);
    assert.ok(restored.restored, 'Restored');
  });
});

describe('StateSnapshot: delete', () => {
  it('should delete a snapshot', () => {
    const plane = setupPlane();
    const snap = new StateSnapshot(TEST_DIR);
    const saved = snap.save('to-delete');
    const deleted = snap.delete(saved.id);
    assert.ok(deleted.deleted, 'Deleted');
    const list = snap.list();
    assert.ok(!list.find(s => s.id === saved.id), 'Snapshot removed');
  });
});

describe('StateSnapshot: cleanup', () => {
  it('should enforce max snapshots', () => {
    const plane = setupPlane();
    const snap = new StateSnapshot(TEST_DIR);
    snap.maxSnapshots = 3;
    for (let i = 0; i < 5; i++) snap.save('snap-' + i);
    const list = snap.list();
    assert.ok(list.length <= 3, 'Max snapshots enforced');
  });
});

// ═══ Dashboard ═══

describe('Dashboard: generate', () => {
  it('should generate dashboard for initialized project', () => {
    const plane = setupPlane();
    const dash = new Dashboard(TEST_DIR);
    const report = dash.generate();
    assert.equal(report.initialized, true);
    assert.equal(report.goal, 'Test mission D');
    assert.equal(report.totalTasks, 0);
  });

  it('should report uninitialized for missing project', () => {
    const dash = new Dashboard('C:/nonexistent/path');
    const report = dash.generate();
    assert.equal(report.initialized, false);
  });
});

describe('Dashboard: toText', () => {
  it('should produce text output', () => {
    const plane = setupPlane();
    const dash = new Dashboard(TEST_DIR);
    const text = dash.toText();
    assert.ok(text.includes('Dashboard'), 'Contains Dashboard header');
    assert.ok(text.includes('Test mission D'), 'Contains goal');
  });
});

describe('Dashboard: with tasks', () => {
  it('should show task counts correctly', () => {
    const plane = setupPlane();
    plane.addTask({ id: 't1', title: 'Task 1', requiredEvidence: [] });
    plane.addTask({ id: 't2', title: 'Task 2', requiredEvidence: [] });
    const dash = new Dashboard(TEST_DIR);
    const report = dash.generate();
    assert.equal(report.totalTasks, 2);
    assert.equal(report.taskCounts.PENDING, 2);
    assert.equal(report.taskCounts.COMPLETE, 0);
  });
});