import { getCapabilityRegistry } from './capability-registry.mjs';

export const ConflictType = { SECOND_ORCHESTRATOR: 'second-orchestrator', SECOND_SCHEDULER: 'second-scheduler', SECOND_STATE_STORE: 'second-state-store', SECOND_MEMORY: 'second-memory', MISSION_AUTHORITY: 'mission-authority' };
export const ConflictSeverity = { CRITICAL: 'critical', HIGH: 'high', MEDIUM: 'medium', LOW: 'low' };

export class ConflictDetectionSystem {
  constructor() {
    this._registry = getCapabilityRegistry();
    this._rules = new Map();
    this._violations = [];
    this._initializeRules();
  }
  _initializeRules() {
    this.addRule({ id: 'no-second-orchestrator', type: ConflictType.SECOND_ORCHESTRATOR, severity: ConflictSeverity.CRITICAL, description: 'No second orchestrator', check: function(c) { return (c.name || '').toLowerCase().indexOf('orchestrator') >= 0 || (c.description || '').toLowerCase().indexOf('orchestrator') >= 0; }, message: 'Creates second orchestrator' });
    this.addRule({ id: 'no-second-scheduler', type: ConflictType.SECOND_SCHEDULER, severity: ConflictSeverity.CRITICAL, description: 'No second scheduler', check: function(c) { return (c.name || '').toLowerCase().indexOf('scheduler') >= 0 || (c.description || '').toLowerCase().indexOf('scheduler') >= 0; }, message: 'Creates second scheduler' });
    this.addRule({ id: 'no-second-state-store', type: ConflictType.SECOND_STATE_STORE, severity: ConflictSeverity.CRITICAL, description: 'No second state store', check: function(c) { return (c.name || '').toLowerCase().indexOf('state-store') >= 0 || (c.description || '').toLowerCase().indexOf('state-machine') >= 0; }, message: 'Creates second state store' });
    this.addRule({ id: 'no-second-memory', type: ConflictType.SECOND_MEMORY, severity: ConflictSeverity.CRITICAL, description: 'No second memory', check: function(c) { return (c.name || '').toLowerCase().indexOf('knowledge-base') >= 0 || (c.description || '').toLowerCase().indexOf('vector-store') >= 0; }, message: 'Creates second memory authority' });
  }
  addRule(rule) { this._rules.set(rule.id, rule); }
  removeRule(ruleId) { this._rules.delete(ruleId); }
  checkCapability(capability) {
    var violations = [];
    for (var entry of this._rules) {
      var ruleId = entry[0]; var rule = entry[1];
      try {
        if (rule.check(capability)) {
          var violation = { ruleId: ruleId, capabilityId: capability.id, type: rule.type, severity: rule.severity, message: rule.message, capability: capability.name, timestamp: Date.now() };
          violations.push(violation);
          this._violations.push(violation);
        }
      } catch (e) { /* ignore */ }
    }
    return { hasConflict: violations.length > 0, violations: violations, capabilityId: capability.id, capabilityName: capability.name };
  }
  checkAll() {
    var capabilities = this._registry.query({});
    var allViolations = [];
    for (var i = 0; i < capabilities.length; i++) {
      var result = this.checkCapability(capabilities[i]);
      if (result.hasConflict) allViolations = allViolations.concat(result.violations);
    }
    var critical = allViolations.filter(function(v) { return v.severity === ConflictSeverity.CRITICAL; });
    var high = allViolations.filter(function(v) { return v.severity === ConflictSeverity.HIGH; });
    return { safe: critical.length === 0 && high.length === 0, totalViolations: allViolations.length, critical: critical.length, high: high.length, violations: allViolations };
  }
  getViolations() { return this._violations.slice(); }
  clearViolations() { this._violations = []; }
  getRules() { return [...this._rules.values()]; }
}

let _instance = null;
export function getConflictDetectionSystem() { if (!_instance) _instance = new ConflictDetectionSystem(); return _instance; }