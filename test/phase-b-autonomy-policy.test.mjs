import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { AutonomyPolicy, AUTONOMY_LEVEL, POLICY_RULE, ACTION_CATEGORY } from '../runtime/autonomy-policy.mjs';

describe('Autonomy Policy', function() {
  let policy;

  before(function() {
    policy = new AutonomyPolicy({ level: AUTONOMY_LEVEL.L1_ASSISTED });
  });

  it('should create an autonomy policy', function() {
    assert.ok(policy);
    assert.equal(policy.level, AUTONOMY_LEVEL.L1_ASSISTED);
  });

  it('should check L0 manual allows read only', function() {
    policy.setLevel(AUTONOMY_LEVEL.L0_MANUAL);
    const readCheck = policy.check(ACTION_CATEGORY.READ_FILES);
    assert.equal(readCheck.allowed, true);
    const writeCheck = policy.check(ACTION_CATEGORY.WRITE_FILES);
    assert.equal(writeCheck.allowed, false);
    assert.equal(writeCheck.requiresApproval, true);
  });

  it('should check L4 autonomous allows most actions', function() {
    policy.setLevel(AUTONOMY_LEVEL.L4_AUTONOMOUS);
    const writeCheck = policy.check(ACTION_CATEGORY.WRITE_FILES);
    assert.equal(writeCheck.allowed, true);
    assert.equal(writeCheck.rule, POLICY_RULE.ALLOW_WITH_LOG);
  });

  it('should block credentials at all levels', function() {
    policy.setLevel(AUTONOMY_LEVEL.L7_FULL);
    const check = policy.check(ACTION_CATEGORY.CREDENTIAL_ACCESS);
    assert.equal(check.blocked, true);
  });

  it('should block financial actions at L7', function() {
    policy.setLevel(AUTONOMY_LEVEL.L7_FULL);
    const check = policy.check(ACTION_CATEGORY.FINANCIAL_ACTION);
    assert.equal(check.requiresApproval, true);
  });

  it('should request approval for blocked actions', function() {
    policy.setLevel(AUTONOMY_LEVEL.L0_MANUAL);
    const result = policy.requestApproval(ACTION_CATEGORY.EXECUTE_SHELL, { command: 'echo test' });
    assert.equal(result.approved, false);
    assert.equal(result.method, 'approval-required');
  });

  it('should auto-allow at appropriate levels', function() {
    policy.setLevel(AUTONOMY_LEVEL.L4_AUTONOMOUS);
    const result = policy.requestApproval(ACTION_CATEGORY.RUN_TESTS, { command: 'npm test' });
    assert.equal(result.approved, true);
    assert.equal(result.method, 'auto');
  });

  it('should approve and track approvals', function() {
    policy.setLevel(AUTONOMY_LEVEL.L0_MANUAL);
    policy.approve(ACTION_CATEGORY.GIT_PUSH, 'push-001');
    assert.ok(policy.isApproved(ACTION_CATEGORY.GIT_PUSH, 'push-001'));
    assert.ok(!policy.isApproved(ACTION_CATEGORY.GIT_PUSH, 'push-002'));
    // Wildcard approval
    policy.approve(ACTION_CATEGORY.CREATE_BRANCH, '*');
    assert.ok(policy.isApproved(ACTION_CATEGORY.CREATE_BRANCH, 'any-branch'));
  });

  it('should get state', function() {
    const state = policy.getState();
    assert.ok(state.level);
    assert.ok(state.description);
    assert.equal(typeof state.auditCount, 'number');
  });

  it('should get audit log', function() {
    const log = policy.getAuditLog();
    assert.ok(Array.isArray(log));
    assert.ok(log.length > 0);
  });

  it('should get all levels', function() {
    const levels = policy.getLevels();
    assert.ok(Array.isArray(levels));
    assert.equal(levels.length, 8);
  });

  it('should emit level change event', function() {
    let emitted = false;
    policy.on('policy:level-changed', () => { emitted = true; });
    policy.setLevel(AUTONOMY_LEVEL.L3_GUIDED);
    assert.ok(emitted);
  });
});