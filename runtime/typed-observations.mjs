export const ObservationType = { SHELL_OUTPUT: 'shell-output', ERROR: 'error', TIMEOUT: 'timeout', SUCCESS: 'success' };

export class Observation {
  constructor(type, content, metadata) {
    this.type = type;
    this.content = content;
    this.metadata = metadata || {};
    this.timestamp = Date.now();
    this.exitCode = (metadata && metadata.exitCode !== undefined) ? metadata.exitCode : null;
    this.success = (metadata && metadata.success !== undefined) ? metadata.success : true;
  }
}

export class ShellOutputObservation extends Observation {
  constructor(content, exitCode, metadata) {
    super(ObservationType.SHELL_OUTPUT, content, Object.assign({}, metadata || {}, { exitCode: exitCode }));
    this.exitCode = exitCode;
    this.success = exitCode === 0;
  }
}

export class ErrorObservation extends Observation {
  constructor(content, errorType, metadata) {
    super(ObservationType.ERROR, content, Object.assign({}, metadata || {}, { errorType: errorType, success: false }));
    this.errorType = errorType;
  }
}

export class TimeoutObservation extends Observation {
  constructor(content, metadata) {
    super(ObservationType.TIMEOUT, content || 'Operation timed out', Object.assign({}, metadata || {}, { success: false }));
  }
}

export class PermissionDeniedObservation extends Observation {
  constructor(content, metadata) {
    super(ObservationType.PERMISSION_DENIED, content || 'Permission denied', Object.assign({}, metadata || {}, { success: false }));
  }
}

export function wrapAsObservation(result) {
  if (result.error) {
    if (result.error.indexOf('timeout') >= 0) return new TimeoutObservation(result.error, result);
    if (result.error.indexOf('permission') >= 0) return new PermissionDeniedObservation(result.error, result);
    return new ErrorObservation(result.error, 'execution-error', result);
  }
  if (result.exitCode !== undefined) return new ShellOutputObservation(result.content || result.stdout || '', result.exitCode, result);
  return new Observation(ObservationType.SUCCESS, result.content || JSON.stringify(result), result);
}

export class ObservationCollector {
  constructor() { this._observations = []; }
  add(observation) { this._observations.push(observation); }
  getAll() { return this._observations.slice(); }
  getByType(type) { return this._observations.filter(function(o) { return o.type === type; }); }
  getFailed() { return this._observations.filter(function(o) { return !o.success; }); }
  getSuccessful() { return this._observations.filter(function(o) { return o.success; }); }
  getStats() {
    var total = this._observations.length;
    var failed = this.getFailed().length;
    var byType = {};
    for (var i = 0; i < this._observations.length; i++) { var o = this._observations[i]; byType[o.type] = (byType[o.type] || 0) + 1; }
    return { total: total, successful: total - failed, failed: failed, byType: byType };
  }
  clear() { this._observations = []; }
}