import { EventEmitter } from 'node:events';

const AUTONOMY_LEVEL = Object.freeze({
  L0_SUPERVISED: 'L0_SUPERVISED',
  L1_ASSISTED: 'L1_ASSISTED',
  L2_AUTONOMOUS: 'L2_AUTONOMOUS',
  L3_FULL: 'L3_FULL',
});

const GOVERNOR_ACTION = Object.freeze({
  ALLOW: 'ALLOW',
  REQUIRE_APPROVAL: 'REQUIRE_APPROVAL',
  BLOCK: 'BLOCK',
  ESCALATE: 'ESCALATE',
});

class AutonomyGovernor extends EventEmitter {
  constructor(experienceStore, options) {
    super();
    this.experienceStore = experienceStore;
    this.currentLevel = (options && options.initialLevel) || AUTONOMY_LEVEL.L1_ASSISTED;
    this.policies = new Map();
    this.auditLog = [];
    this.maxAuditEntries = (options && options.maxAuditEntries) || 500;
    this._registerDefaults();
  }

  _registerDefaults() {
    this.policies.set('file-write', { action: GOVERNOR_ACTION.ALLOW, requiresApproval: false });
    this.policies.set('file-delete', { action: GOVERNOR_ACTION.REQUIRE_APPROVAL, requiresApproval: true });
    this.policies.set('git-commit', { action: GOVERNOR_ACTION.ALLOW, requiresApproval: false });
    this.policies.set('git-push', { action: GOVERNOR_ACTION.REQUIRE_APPROVAL, requiresApproval: true });
    this.policies.set('git-merge', { action: GOVERNOR_ACTION.REQUIRE_APPROVAL, requiresApproval: true });
    this.policies.set('npm-install', { action: GOVERNOR_ACTION.ALLOW, requiresApproval: false });
    this.policies.set('npm-publish', { action: GOVERNOR_ACTION.BLOCK, requiresApproval: true });
    this.policies.set('database-write', { action: GOVERNOR_ACTION.REQUIRE_APPROVAL, requiresApproval: true });
    this.policies.set('deploy', { action: GOVERNOR_ACTION.BLOCK, requiresApproval: true });
    this.policies.set('credential-change', { action: GOVERNOR_ACTION.BLOCK, requiresApproval: true });
    this.policies.set('paid-operation', { action: GOVERNOR_ACTION.BLOCK, requiresApproval: true });
    this.policies.set('file-edit', { action: GOVERNOR_ACTION.ALLOW, requiresApproval: false });
    this.policies.set('test-run', { action: GOVERNOR_ACTION.ALLOW, requiresApproval: false });
    this.policies.set('shell-execute', { action: GOVERNOR_ACTION.REQUIRE_APPROVAL, requiresApproval: true });
    this.policies.set('browser-navigate', { action: GOVERNOR_ACTION.ALLOW, requiresApproval: false });
  }

  /**
   * Check if an action is allowed.
   */
  check(actionType, context) {
    const policy = this.policies.get(actionType);
    if (!policy) return { allowed: false, action: GOVERNOR_ACTION.ESCALATE, reason: 'Unknown action: ' + actionType };
    let effectiveAction = policy.action;
    if (this.currentLevel === AUTONOMY_LEVEL.L0_SUPERVISED) {
      if (policy.action === GOVERNOR_ACTION.ALLOW) effectiveAction = GOVERNOR_ACTION.REQUIRE_APPROVAL;
    } else if (this.currentLevel === AUTONOMY_LEVEL.L3_FULL) {
      if (policy.action === GOVERNOR_ACTION.REQUIRE_APPROVAL && !policy.requiresApproval) effectiveAction = GOVERNOR_ACTION.ALLOW;
    }
    const record = {
      actionType,
      effectiveAction,
      originalPolicy: policy.action,
      autonomyLevel: this.currentLevel,
      context: context || {},
      timestamp: Date.now(),
    };
    this.auditLog.push(record);
    if (this.auditLog.length > this.maxAuditEntries) this.auditLog = this.auditLog.slice(-this.maxAuditEntries);
    return { allowed: effectiveAction === GOVERNOR_ACTION.ALLOW, action: effectiveAction, reason: effectiveAction === GOVERNOR_ACTION.ALLOW ? 'Policy allows at level ' + this.currentLevel : 'Requires approval at level ' + this.currentLevel };
  }

  /**
   * Set autonomy level.
   */
  setLevel(level) {
    const previous = this.currentLevel;
    this.currentLevel = level;
    this.emit('level:changed', { previous, current: level });
    return { previous, current: level };
  }

  /**
   * Get audit log.
   */
  getAuditLog(limit) {
    return this.auditLog.slice(-(limit || 50));
  }

  /**
   * Get current level.
   */
  getLevel() { return this.currentLevel; }

  /**
   * Get all policies.
   */
  getPolicies() {
    return [...this.policies.entries()].map(([action, policy]) => ({ action, ...policy }));
  }
}

export { AUTONOMY_LEVEL, GOVERNOR_ACTION, AutonomyGovernor };