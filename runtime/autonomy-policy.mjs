import { EventEmitter } from 'node:events';

const AUTONOMY_LEVEL = Object.freeze({
  L0_MANUAL: 'L0_MANUAL',
  L1_ASSISTED: 'L1_ASSISTED',
  L2_SUPERVISED: 'L2_SUPERVISED',
  L3_GUIDED: 'L3_GUIDED',
  L4_AUTONOMOUS: 'L4_AUTONOMOUS',
  L5_SELF_DIRECTING: 'L5_SELF_DIRECTING',
  L6_ADAPTIVE: 'L6_ADAPTIVE',
  L7_FULL: 'L7_FULL',
});

const POLICY_RULE = Object.freeze({
  REQUIRES_APPROVAL: 'REQUIRES_APPROVAL',
  ALLOW_WITH_LOG: 'ALLOW_WITH_LOG',
  ALLOW_AUTONOMOUS: 'ALLOW_AUTONOMOUS',
  BLOCKED: 'BLOCKED',
  ESCALATE: 'ESCALATE',
});

const ACTION_CATEGORY = Object.freeze({
  READ_FILES: 'READ_FILES',
  WRITE_FILES: 'WRITE_FILES',
  EXECUTE_SHELL: 'EXECUTE_SHELL',
  INSTALL_DEPS: 'INSTALL_DEPS',
  RUN_TESTS: 'RUN_TESTS',
  GIT_COMMIT: 'GIT_COMMIT',
  GIT_PUSH: 'GIT_PUSH',
  CREATE_PR: 'CREATE_PR',
  MERGE_PR: 'MERGE_PR',
  DEPLOY: 'DEPLOY',
  MODIFY_CONFIG: 'MODIFY_CONFIG',
  ADD_DEPENDENCY: 'ADD_DEPENDENCY',
  DELETE_FILES: 'DELETE_FILES',
  CREATE_BRANCH: 'CREATE_BRANCH',
  DATABASE_WRITE: 'DATABASE_WRITE',
  API_CALL: 'API_CALL',
  CREDENTIAL_ACCESS: 'CREDENTIAL_ACCESS',
  FINANCIAL_ACTION: 'FINANCIAL_ACTION',
});

// Default policies per autonomy level
const DEFAULT_POLICIES = Object.freeze({
  [AUTONOMY_LEVEL.L0_MANUAL]: {
    level: AUTONOMY_LEVEL.L0_MANUAL,
    description: 'All actions require user approval',
    maxConcurrentTasks: 0,
    rules: {
      [ACTION_CATEGORY.READ_FILES]: POLICY_RULE.ALLOW_AUTONOMOUS,
      [ACTION_CATEGORY.WRITE_FILES]: POLICY_RULE.REQUIRES_APPROVAL,
      [ACTION_CATEGORY.EXECUTE_SHELL]: POLICY_RULE.REQUIRES_APPROVAL,
      [ACTION_CATEGORY.INSTALL_DEPS]: POLICY_RULE.REQUIRES_APPROVAL,
      [ACTION_CATEGORY.RUN_TESTS]: POLICY_RULE.REQUIRES_APPROVAL,
      [ACTION_CATEGORY.GIT_COMMIT]: POLICY_RULE.REQUIRES_APPROVAL,
      [ACTION_CATEGORY.GIT_PUSH]: POLICY_RULE.REQUIRES_APPROVAL,
      [ACTION_CATEGORY.CREATE_PR]: POLICY_RULE.REQUIRES_APPROVAL,
      [ACTION_CATEGORY.MERGE_PR]: POLICY_RULE.BLOCKED,
      [ACTION_CATEGORY.DEPLOY]: POLICY_RULE.BLOCKED,
      [ACTION_CATEGORY.MODIFY_CONFIG]: POLICY_RULE.REQUIRES_APPROVAL,
      [ACTION_CATEGORY.ADD_DEPENDENCY]: POLICY_RULE.REQUIRES_APPROVAL,
      [ACTION_CATEGORY.DELETE_FILES]: POLICY_RULE.REQUIRES_APPROVAL,
      [ACTION_CATEGORY.CREATE_BRANCH]: POLICY_RULE.REQUIRES_APPROVAL,
      [ACTION_CATEGORY.DATABASE_WRITE]: POLICY_RULE.BLOCKED,
      [ACTION_CATEGORY.API_CALL]: POLICY_RULE.REQUIRES_APPROVAL,
      [ACTION_CATEGORY.CREDENTIAL_ACCESS]: POLICY_RULE.BLOCKED,
      [ACTION_CATEGORY.FINANCIAL_ACTION]: POLICY_RULE.BLOCKED,
    },
  },
  [AUTONOMY_LEVEL.L4_AUTONOMOUS]: {
    level: AUTONOMY_LEVEL.L4_AUTONOMOUS,
    description: 'Agent operates autonomously within defined boundaries',
    maxConcurrentTasks: 3,
    rules: {
      [ACTION_CATEGORY.READ_FILES]: POLICY_RULE.ALLOW_AUTONOMOUS,
      [ACTION_CATEGORY.WRITE_FILES]: POLICY_RULE.ALLOW_WITH_LOG,
      [ACTION_CATEGORY.EXECUTE_SHELL]: POLICY_RULE.ALLOW_WITH_LOG,
      [ACTION_CATEGORY.INSTALL_DEPS]: POLICY_RULE.ALLOW_WITH_LOG,
      [ACTION_CATEGORY.RUN_TESTS]: POLICY_RULE.ALLOW_AUTONOMOUS,
      [ACTION_CATEGORY.GIT_COMMIT]: POLICY_RULE.ALLOW_WITH_LOG,
      [ACTION_CATEGORY.GIT_PUSH]: POLICY_RULE.REQUIRES_APPROVAL,
      [ACTION_CATEGORY.CREATE_PR]: POLICY_RULE.ALLOW_WITH_LOG,
      [ACTION_CATEGORY.MERGE_PR]: POLICY_RULE.REQUIRES_APPROVAL,
      [ACTION_CATEGORY.DEPLOY]: POLICY_RULE.ESCALATE,
      [ACTION_CATEGORY.MODIFY_CONFIG]: POLICY_RULE.ALLOW_WITH_LOG,
      [ACTION_CATEGORY.ADD_DEPENDENCY]: POLICY_RULE.ALLOW_WITH_LOG,
      [ACTION_CATEGORY.DELETE_FILES]: POLICY_RULE.ALLOW_WITH_LOG,
      [ACTION_CATEGORY.CREATE_BRANCH]: POLICY_RULE.ALLOW_WITH_LOG,
      [ACTION_CATEGORY.DATABASE_WRITE]: POLICY_RULE.REQUIRES_APPROVAL,
      [ACTION_CATEGORY.API_CALL]: POLICY_RULE.ALLOW_WITH_LOG,
      [ACTION_CATEGORY.CREDENTIAL_ACCESS]: POLICY_RULE.BLOCKED,
      [ACTION_CATEGORY.FINANCIAL_ACTION]: POLICY_RULE.ESCALATE,
    },
  },
  [AUTONOMY_LEVEL.L7_FULL]: {
    level: AUTONOMY_LEVEL.L7_FULL,
    description: 'Full autonomy with safety guardrails',
    maxConcurrentTasks: 5,
    rules: {
      [ACTION_CATEGORY.READ_FILES]: POLICY_RULE.ALLOW_AUTONOMOUS,
      [ACTION_CATEGORY.WRITE_FILES]: POLICY_RULE.ALLOW_AUTONOMOUS,
      [ACTION_CATEGORY.EXECUTE_SHELL]: POLICY_RULE.ALLOW_AUTONOMOUS,
      [ACTION_CATEGORY.INSTALL_DEPS]: POLICY_RULE.ALLOW_AUTONOMOUS,
      [ACTION_CATEGORY.RUN_TESTS]: POLICY_RULE.ALLOW_AUTONOMOUS,
      [ACTION_CATEGORY.GIT_COMMIT]: POLICY_RULE.ALLOW_AUTONOMOUS,
      [ACTION_CATEGORY.GIT_PUSH]: POLICY_RULE.ALLOW_WITH_LOG,
      [ACTION_CATEGORY.CREATE_PR]: POLICY_RULE.ALLOW_AUTONOMOUS,
      [ACTION_CATEGORY.MERGE_PR]: POLICY_RULE.ALLOW_WITH_LOG,
      [ACTION_CATEGORY.DEPLOY]: POLICY_RULE.REQUIRES_APPROVAL,
      [ACTION_CATEGORY.MODIFY_CONFIG]: POLICY_RULE.ALLOW_AUTONOMOUS,
      [ACTION_CATEGORY.ADD_DEPENDENCY]: POLICY_RULE.ALLOW_AUTONOMOUS,
      [ACTION_CATEGORY.DELETE_FILES]: POLICY_RULE.ALLOW_WITH_LOG,
      [ACTION_CATEGORY.CREATE_BRANCH]: POLICY_RULE.ALLOW_AUTONOMOUS,
      [ACTION_CATEGORY.DATABASE_WRITE]: POLICY_RULE.ALLOW_WITH_LOG,
      [ACTION_CATEGORY.API_CALL]: POLICY_RULE.ALLOW_AUTONOMOUS,
      [ACTION_CATEGORY.CREDENTIAL_ACCESS]: POLICY_RULE.BLOCKED,
      [ACTION_CATEGORY.FINANCIAL_ACTION]: POLICY_RULE.REQUIRES_APPROVAL,
    },
  },
});

class AutonomyPolicy extends EventEmitter {
  constructor(options) {
    super();
    options = options || {};
    this.level = options.level || AUTONOMY_LEVEL.L1_ASSISTED;
    this.policies = { ...DEFAULT_POLICIES };
    this.auditLog = [];
    this.maxAuditSize = options.maxAuditSize || 1000;
    this.approvedActions = new Set();
  }

  /**
   * Check if an action is allowed at the current autonomy level.
   */
  check(actionCategory) {
    const policy = this.policies[this.level];
    if (!policy) return { allowed: false, rule: POLICY_RULE.BLOCKED, reason: 'Unknown autonomy level' };
    const rule = policy.rules[actionCategory] || POLICY_RULE.REQUIRES_APPROVAL;
    const allowed = rule === POLICY_RULE.ALLOW_AUTONOMOUS || rule === POLICY_RULE.ALLOW_WITH_LOG;
    return { allowed: allowed, rule: rule, level: this.level, requiresApproval: rule === POLICY_RULE.REQUIRES_APPROVAL, requiresEscalation: rule === POLICY_RULE.ESCALATE, blocked: rule === POLICY_RULE.BLOCKED };
  }

  /**
   * Request approval for an action.
   */
  requestApproval(actionCategory, context) {
    const check = this.check(actionCategory);
    if (check.allowed) {
      this._audit(actionCategory, 'AUTO_ALLOWED', context);
      return { approved: true, method: 'auto', rule: check.rule };
    }
    if (check.blocked) {
      this._audit(actionCategory, 'BLOCKED', context);
      return { approved: false, method: 'blocked', rule: check.rule, reason: 'Action blocked at ' + this.level };
    }
    if (check.requiresEscalation) {
      this._audit(actionCategory, 'ESCALATED', context);
      this.emit('policy:escalation', { actionCategory: actionCategory, context: context });
      return { approved: false, method: 'escalation-required', rule: check.rule };
    }
    this._audit(actionCategory, 'PENDING_APPROVAL', context);
    this.emit('policy:approval-requested', { actionCategory: actionCategory, context: context });
    return { approved: false, method: 'approval-required', rule: check.rule };
  }

  /**
   * Grant approval for an action.
   */
  approve(actionCategory, actionId) {
    this.approvedActions.add(actionCategory + ':' + (actionId || '*'));
    this._audit(actionCategory, 'APPROVED', { actionId: actionId });
    this.emit('policy:approved', { actionCategory: actionCategory, actionId: actionId });
  }

  /**
   * Check if an action has been pre-approved.
   */
  isApproved(actionCategory, actionId) {
    return this.approvedActions.has(actionCategory + ':' + (actionId || '*')) ||
           this.approvedActions.has(actionCategory + ':*');
  }

  /**
   * Set autonomy level.
   */
  setLevel(level) {
    const oldLevel = this.level;
    this.level = level;
    this._audit('SYSTEM', 'LEVEL_CHANGED', { from: oldLevel, to: level });
    this.emit('policy:level-changed', { from: oldLevel, to: level });
  }

  /**
   * Get current policy state.
   */
  getState() {
    return { level: this.level, description: this.policies[this.level]?.description || '', maxConcurrentTasks: this.policies[this.level]?.maxConcurrentTasks || 0, auditCount: this.auditLog.length, approvedCount: this.approvedActions.size };
  }

  /**
   * Get audit log (last N entries).
   */
  getAuditLog(limit) {
    return this.auditLog.slice(-(limit || 50));
  }

  /**
   * Get all available autonomy levels.
   */
  getLevels() {
    return Object.values(AUTONOMY_LEVEL).map(l => ({ level: l, description: this.policies[l]?.description || '' }));
  }

  // ─── Private ──────────────────────────────────────────────────────

  _audit(category, action, context) {
    const entry = { timestamp: new Date().toISOString(), category: category, action: action, level: this.level, context: context || {} };
    this.auditLog.push(entry);
    if (this.auditLog.length > this.maxAuditSize) {
      this.auditLog = this.auditLog.slice(-this.maxAuditSize);
    }
    this.emit('policy:audit', entry);
  }
}

export { AUTONOMY_LEVEL, POLICY_RULE, ACTION_CATEGORY, AutonomyPolicy };