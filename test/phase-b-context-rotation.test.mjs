import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ContextRotation, ROTATION_REASON, ROTATION_ACTION } from '../runtime/context-rotation.mjs';

describe('B3: Context Rotation', function() {
  let tmpDir, rotation;

  before(function() {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rotation-test-'));
    rotation = new ContextRotation(tmpDir, { maxTokens: 1000, staleAfterMs: 1000 });
  });

  after(function() { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('should create a context rotation instance', function() {
    assert.ok(rotation);
    assert.equal(rotation.maxTokens, 1000);
  });

  it('should evaluate when rotation is needed', function() {
    // _estimateTokens uses JSON.stringify length / 4, so we need enough content
    const largeContent = 'x'.repeat(5000); // ~1250 tokens > 1000 maxTokens
    const context = { data: largeContent, lastUpdated: new Date().toISOString() };
    const eval_ = rotation.evaluate(context);
    assert.equal(eval_.needsRotation, true);
    assert.ok(eval_.reasons.length > 0);
  });

  it('should evaluate when rotation is NOT needed', function() {
    const context = { tokens: 100, lastUpdated: new Date().toISOString() };
    const eval_ = rotation.evaluate(context);
    assert.equal(eval_.needsRotation, false);
  });

  it('should detect stale context', function() {
    const oldTime = new Date(Date.now() - 5000).toISOString();
    const context = { tokens: 100, lastUpdated: oldTime };
    const eval_ = rotation.evaluate(context);
    assert.equal(eval_.needsRotation, true);
    assert.equal(eval_.reasons[0].reason, ROTATION_REASON.STALE_CONTEXT);
  });

  it('should prune context', function() {
    const context = { history: Array(100).fill('event'), findings: Array(50).fill('finding'), errors: Array(20).fill('error') };
    const result = rotation.rotate(context, ROTATION_ACTION.PRUNE, ROTATION_REASON.TOKEN_BUDGET);
    assert.ok(result.snapshotId);
    assert.equal(result.result.pruned, true);
  });

  it('should summarize context', function() {
    const context = { objective: 'Test', phase: 'EXECUTING', findings: ['f1', 'f2'], errors: ['e1'] };
    const result = rotation.rotate(context, ROTATION_ACTION.SUMMARIZE, ROTATION_REASON.STALE_CONTEXT);
    assert.equal(result.result.summarized, true);
  });

  it('should create and restore snapshots', function() {
    const context = { data: 'test-context' };
    const snap = rotation.snapshot(context, 'test');
    assert.ok(snap.id.startsWith('snap-'));
    const { context: restored } = rotation.restore(snap.id);
    assert.deepEqual(restored, context);
  });

  it('should suggest correct action for token budget', function() {
    const eval_ = { needsRotation: true, reasons: [{ reason: ROTATION_REASON.TOKEN_BUDGET, current: 3000, max: 1000 }], estimatedTokens: 3000 };
    const action = rotation.suggestAction(eval_);
    assert.equal(action, ROTATION_ACTION.RESET);
  });

  it('should suggest prune for moderate token budget', function() {
    const eval_ = { needsRotation: true, reasons: [{ reason: ROTATION_REASON.TOKEN_BUDGET, current: 1500, max: 1000 }], estimatedTokens: 1500 };
    const action = rotation.suggestAction(eval_);
    assert.equal(action, ROTATION_ACTION.PRUNE);
  });

  it('should get rotation history', function() {
    const history = rotation.getHistory();
    assert.ok(Array.isArray(history));
    assert.ok(history.length > 0);
  });
});