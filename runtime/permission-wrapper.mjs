export const PermissionLevel = { ALLOW: 'allow', DENY: 'deny', ASK: 'ask' };

export class PermissionDeniedError extends Error {
  constructor(toolName, permission, message) {
    super('Permission denied for tool ' + toolName + ': ' + permission + '. ' + (message || ''));
    this.toolName = toolName;
    this.permission = permission;
    this.code = 'PERMISSION_DENIED';
  }
}

export class PermissionService {
  constructor() {
    this._rules = new Map();
    this._auditLog = [];
    this._initializeDefaults();
  }
  _initializeDefaults() {
    this.addRule('shell:execute', PermissionLevel.ASK, 'Shell commands require approval');
    this.addRule('file:write', PermissionLevel.ASK, 'File writes require approval');
    this.addRule('file:edit', PermissionLevel.ASK, 'File edits require approval');
    this.addRule('file:read', PermissionLevel.ALLOW, 'File reads are safe');
    this.addRule('glob', PermissionLevel.ALLOW, 'Glob searches are safe');
    this.addRule('grep', PermissionLevel.ALLOW, 'Grep searches are safe');
  }
  addRule(permission, level, reason) { this._rules.set(permission, { level: level, reason: reason || '' }); }
  removeRule(permission) { this._rules.delete(permission); }
  checkPermission(toolName, requiredPermissions) {
    const results = [];
    for (const permission of (requiredPermissions || [])) {
      const rule = this._rules.get(permission);
      if (!rule) {
        results.push({ permission: permission, level: PermissionLevel.ASK, reason: 'No rule', allowed: false });
      } else {
        results.push({ permission: permission, level: rule.level, reason: rule.reason, allowed: rule.level === PermissionLevel.ALLOW });
      }
    }
    const allAllowed = results.every(function(r) { return r.allowed; });
    const anyDenied = results.some(function(r) { return r.level === PermissionLevel.DENY; });
    this._auditLog.push({ toolName: toolName, requiredPermissions: requiredPermissions, results: results, allAllowed: allAllowed, anyDenied: anyDenied, timestamp: Date.now() });
    return { allowed: allAllowed && !anyDenied, needsApproval: results.some(function(r) { return r.level === PermissionLevel.ASK; }), results: results };
  }
  async executeWithPermission(tool, toolCall, approvalFn) {
    const info = tool.info();
    const permissions = tool.getPermissions();
    const check = this.checkPermission(info.name, permissions);
    if (!check.allowed) {
      if (check.needsApproval && approvalFn) {
        const approved = await approvalFn({ toolName: info.name, toolCall: toolCall, permissions: check.results });
        if (!approved) throw new PermissionDeniedError(info.name, 'user-denied', 'User denied');
      } else if (check.needsApproval) {
        throw new PermissionDeniedError(info.name, 'no-approval', 'No approval function');
      } else {
        throw new PermissionDeniedError(info.name, 'denied', 'Permission denied');
      }
    }
    return tool.safeRun(toolCall);
  }
  getAuditLog() { return this._auditLog.slice(); }
  clearAuditLog() { this._auditLog = []; }
}

let _instance = null;
export function getPermissionService() { if (!_instance) _instance = new PermissionService(); return _instance; }