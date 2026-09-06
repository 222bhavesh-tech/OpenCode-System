import { EventEmitter } from 'node:events';

const VERIFICATION_LEVEL = Object.freeze({
  MINIMAL: 'MINIMAL',
  STANDARD: 'STANDARD',
  THOROUGH: 'THOROUGH',
  COMPREHENSIVE: 'COMPREHENSIVE',
});

const MANDATORY_CHECKS = Object.freeze(['no-secrets', 'no-credentials']);

class AdaptiveVerification extends EventEmitter {
  constructor(options) {
    super();
    options = options || {};
    this.defaultLevel = options.defaultLevel || VERIFICATION_LEVEL.STANDARD;
    this.checkRegistry = new Map();
    this._registerDefaults();
  }

  _registerDefaults() {
    this.checkRegistry.set('lint', { name: 'lint', level: VERIFICATION_LEVEL.MINIMAL, appliesTo: ['all'] });
    this.checkRegistry.set('typecheck', { name: 'typecheck', level: VERIFICATION_LEVEL.STANDARD, appliesTo: ['backend', 'frontend', 'database'] });
    this.checkRegistry.set('unit-test', { name: 'unit-test', level: VERIFICATION_LEVEL.STANDARD, appliesTo: ['backend', 'frontend', 'database'] });
    this.checkRegistry.set('integration-test', { name: 'integration-test', level: VERIFICATION_LEVEL.THOROUGH, appliesTo: ['backend', 'database'] });
    this.checkRegistry.set('security-review', { name: 'security-review', level: VERIFICATION_LEVEL.THOROUGH, appliesTo: ['security', 'backend'] });
    this.checkRegistry.set('browser-verify', { name: 'browser-verify', level: VERIFICATION_LEVEL.THOROUGH, appliesTo: ['frontend'] });
    this.checkRegistry.set('migration-validate', { name: 'migration-validate', level: VERIFICATION_LEVEL.THOROUGH, appliesTo: ['database'] });
    this.checkRegistry.set('no-secrets', { name: 'no-secrets', level: VERIFICATION_LEVEL.MINIMAL, appliesTo: ['all'], mandatory: true });
    this.checkRegistry.set('no-credentials', { name: 'no-credentials', level: VERIFICATION_LEVEL.MINIMAL, appliesTo: ['all'], mandatory: true });
  }

  /**
   * Select verification checks for a task.
   */
  selectChecks(task, riskLevel) {
    const taskType = this._getTaskType(task);
    const level = this._determineLevel(taskType, riskLevel);
    const checks = [];
    for (const [name, check] of this.checkRegistry) {
      if (check.mandatory) { checks.push({ ...check, reason: 'Mandatory safety check' }); continue; }
      if (check.appliesTo.includes('all') || check.appliesTo.includes(taskType)) {
        if (this._shouldInclude(check.level, level)) {
          checks.push({ ...check, reason: 'Level ' + level + ' includes ' + check.level });
        }
      }
    }
    this.emit('verification:selected', { taskId: task.id, level: level, checkCount: checks.length });
    return { level: level, checks: checks, checkNames: checks.map(c => c.name), totalChecks: checks.length };
  }

  /**
   * Verify results against selected checks.
   */
  verify(taskId, checkResults) {
    const mandatoryFailed = checkResults.filter(r => r.mandatory && r.verdict !== 'PASS');
    const optionalFailed = checkResults.filter(r => !r.mandatory && r.verdict === 'FAIL');
    const mandatoryPass = checkResults.filter(r => r.mandatory && r.verdict === 'PASS');
    const optionalPass = checkResults.filter(r => !r.mandatory && r.verdict === 'PASS');
    return {
      overall: mandatoryFailed.length === 0 ? 'PASS' : 'FAIL',
      mandatoryPass: mandatoryPass.length,
      mandatoryFailed: mandatoryFailed.length,
      optionalPass: optionalPass.length,
      optionalFailed: optionalFailed.length,
      failedChecks: mandatoryFailed.concat(optionalFailed).map(r => r.name),
    };
  }

  _getTaskType(task) {
    const title = (task.title || task.description || '').toLowerCase();
    if (/frontend|ui|css|component|page/.test(title)) return 'frontend';
    if (/database|sql|schema|migration/.test(title)) return 'database';
    if (/secur|auth|permission/.test(title)) return 'security';
    return 'backend';
  }

  _determineLevel(taskType, riskLevel) {
    if (riskLevel === 'CRITICAL') return VERIFICATION_LEVEL.COMPREHENSIVE;
    if (riskLevel === 'HIGH') return VERIFICATION_LEVEL.THOROUGH;
    if (taskType === 'security' || taskType === 'database') return VERIFICATION_LEVEL.THOROUGH;
    return this.defaultLevel;
  }

  _shouldInclude(checkLevel, taskLevel) {
    const order = [VERIFICATION_LEVEL.MINIMAL, VERIFICATION_LEVEL.STANDARD, VERIFICATION_LEVEL.THOROUGH, VERIFICATION_LEVEL.COMPREHENSIVE];
    return order.indexOf(checkLevel) <= order.indexOf(taskLevel);
  }

  getCheckRegistry() {
    return [...this.checkRegistry.values()];
  }
}

export { VERIFICATION_LEVEL, MANDATORY_CHECKS, AdaptiveVerification };