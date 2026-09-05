import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

const FAILURE_CATEGORY = Object.freeze({
  CODE: 'CODE',
  TEST: 'TEST',
  BUILD: 'BUILD',
  DEPENDENCY: 'DEPENDENCY',
  NETWORK: 'NETWORK',
  TIMEOUT: 'TIMEOUT',
  SECURITY: 'SECURITY',
  PERMISSION: 'PERMISSION',
  BROWSER: 'BROWSER',
  AGENT: 'AGENT',
  CONTEXT: 'CONTEXT',
  RESOURCE: 'RESOURCE',
  UNKNOWN: 'UNKNOWN',
});

const RECOVERY_ACTION = Object.freeze({
  RETRY: 'RETRY',
  CHANGE_STRATEGY: 'CHANGE_STRATEGY',
  ROLLBACK: 'ROLLBACK',
  REPLAN: 'REPLAN',
  DELEGATE: 'DELEGATE',
  ISOLATE: 'ISOLATE',
  RESEARCH: 'RESEARCH',
  ESCALATE: 'ESCALATE',
  ABORT: 'ABORT',
});

const RECOVERY_MATRIX = {};
RECOVERY_MATRIX[FAILURE_CATEGORY.CODE] = [RECOVERY_ACTION.RETRY, RECOVERY_ACTION.CHANGE_STRATEGY, RECOVERY_ACTION.DELEGATE, RECOVERY_ACTION.REPLAN, RECOVERY_ACTION.ESCALATE];
RECOVERY_MATRIX[FAILURE_CATEGORY.TEST] = [RECOVERY_ACTION.RETRY, RECOVERY_ACTION.CHANGE_STRATEGY, RECOVERY_ACTION.DELEGATE, RECOVERY_ACTION.ESCALATE];
RECOVERY_MATRIX[FAILURE_CATEGORY.BUILD] = [RECOVERY_ACTION.RETRY, RECOVERY_ACTION.CHANGE_STRATEGY, RECOVERY_ACTION.RESEARCH, RECOVERY_ACTION.ESCALATE];
RECOVERY_MATRIX[FAILURE_CATEGORY.DEPENDENCY] = [RECOVERY_ACTION.CHANGE_STRATEGY, RECOVERY_ACTION.RETRY, RECOVERY_ACTION.RESEARCH, RECOVERY_ACTION.ESCALATE];
RECOVERY_MATRIX[FAILURE_CATEGORY.NETWORK] = [RECOVERY_ACTION.RETRY, RECOVERY_ACTION.RETRY, RECOVERY_ACTION.ESCALATE];
RECOVERY_MATRIX[FAILURE_CATEGORY.TIMEOUT] = [RECOVERY_ACTION.RETRY, RECOVERY_ACTION.CHANGE_STRATEGY, RECOVERY_ACTION.DELEGATE, RECOVERY_ACTION.ESCALATE];
RECOVERY_MATRIX[FAILURE_CATEGORY.SECURITY] = [RECOVERY_ACTION.ESCALATE, RECOVERY_ACTION.ABORT];
RECOVERY_MATRIX[FAILURE_CATEGORY.PERMISSION] = [RECOVERY_ACTION.ESCALATE, RECOVERY_ACTION.ABORT];
RECOVERY_MATRIX[FAILURE_CATEGORY.BROWSER] = [RECOVERY_ACTION.RETRY, RECOVERY_ACTION.CHANGE_STRATEGY, RECOVERY_ACTION.SKIP_IF_POSSIBLE, RECOVERY_ACTION.ESCALATE];
RECOVERY_MATRIX[FAILURE_CATEGORY.AGENT] = [RECOVERY_ACTION.DELEGATE, RECOVERY_ACTION.CHANGE_STRATEGY, RECOVERY_ACTION.ESCALATE];
RECOVERY_MATRIX[FAILURE_CATEGORY.CONTEXT] = [RECOVERY_ACTION.REPLAN, RECOVERY_ACTION.ROLLBACK, RECOVERY_ACTION.ESCALATE];
RECOVERY_MATRIX[FAILURE_CATEGORY.RESOURCE] = [RECOVERY_ACTION.RETRY, RECOVERY_ACTION.ISOLATE, RECOVERY_ACTION.ESCALATE];
RECOVERY_MATRIX[FAILURE_CATEGORY.UNKNOWN] = [RECOVERY_ACTION.RESEARCH, RECOVERY_ACTION.ESCALATE];

class FailureIntelligence extends EventEmitter {
  constructor(options) {
    super();
    options = options || {};
    this.history = [];
    this.maxHistory = options.maxHistory || 200;
    this.maxRetriesPerStrategy = options.maxRetriesPerStrategy || 2;
  }

  record(record) {
    var entry = {
      id: 'fail-' + crypto.randomUUID().slice(0, 12),
      taskId: record.taskId,
      category: record.category || FAILURE_CATEGORY.UNKNOWN,
      rootCause: record.rootCause || '',
      strategy: record.strategy || '',
      attempt: record.attempt || 1,
      affectedFiles: record.affectedFiles || [],
      affectedTests: record.affectedTests || [],
      evidence: record.evidence || '',
      resolution: '',
      prevention: '',
      timestamp: new Date().toISOString(),
    };
    this.history.push(entry);
    if (this.history.length > this.maxHistory) this.history.shift();
    this.emit('failure:recorded', { id: entry.id, category: entry.category });
    return entry;
  }

  classify(error, context) {
    var msg = (error.message || error.toString()).toLowerCase();
    if (msg.indexOf('timeout') >= 0 || msg.indexOf('timed out') >= 0) return FAILURE_CATEGORY.TIMEOUT;
    if (msg.indexOf('econnrefused') >= 0 || msg.indexOf('enotfound') >= 0 || msg.indexOf('network') >= 0) return FAILURE_CATEGORY.NETWORK;
    if (msg.indexOf('eperm') >= 0 || msg.indexOf('eacces') >= 0 || msg.indexOf('permission denied') >= 0) return FAILURE_CATEGORY.PERMISSION;
    if (msg.indexOf('syntaxerror') >= 0 || msg.indexOf('referenceerror') >= 0 || msg.indexOf('typeerror') >= 0) return FAILURE_CATEGORY.CODE;
    if (msg.indexOf('test') >= 0 && (msg.indexOf('fail') >= 0 || msg.indexOf('assert') >= 0)) return FAILURE_CATEGORY.TEST;
    if (msg.indexOf('build') >= 0 && msg.indexOf('fail') >= 0) return FAILURE_CATEGORY.BUILD;
    if (msg.indexOf('module') >= 0 && msg.indexOf('not found') >= 0) return FAILURE_CATEGORY.DEPENDENCY;
    if (msg.indexOf('browser') >= 0 || msg.indexOf('page') >= 0) return FAILURE_CATEGORY.BROWSER;
    return FAILURE_CATEGORY.UNKNOWN;
  }

  analyzeRepetition(taskId, strategy) {
    var relevant = this.history.filter(function(h) { return h.taskId === taskId && h.strategy === strategy; });
    return { count: relevant.length, exceeds: relevant.length >= this.maxRetriesPerStrategy, attempts: relevant.map(function(r) { return r.attempt; }) };
  }

  suggestRecovery(taskId, category) {
    var matrix = RECOVERY_MATRIX[category] || RECOVERY_MATRIX[FAILURE_CATEGORY.UNKNOWN];
    var pastStrategies = this.history.filter(function(h) { return h.taskId === taskId; }).map(function(h) { return h.strategy; });
    var available = matrix.filter(function(s) { return pastStrategies.indexOf(s) === -1; });
    if (available.length === 0) return RECOVERY_ACTION.ESCALATE;
    return available[0];
  }

  resolve(failureId, resolution, prevention) {
    var entry = this.history.find(function(h) { return h.id === failureId; });
    if (entry) { entry.resolution = resolution; entry.prevention = prevention || ''; }
    return entry;
  }

  getHistory(taskId) {
    if (taskId) return this.history.filter(function(h) { return h.taskId === taskId; });
    return this.history.slice();
  }

  getStats() {
    var byCategory = {};
    var byResolution = {};
    for (var i = 0; i < this.history.length; i++) {
      var h = this.history[i];
      byCategory[h.category] = (byCategory[h.category] || 0) + 1;
      if (h.resolution) byResolution[h.resolution] = (byResolution[h.resolution] || 0) + 1;
    }
    return { total: this.history.length, byCategory: byCategory, byResolution: byResolution, unresolved: this.history.filter(function(h) { return !h.resolution; }).length };
  }

  getRecoveryHistory(taskId) {
    return this.history.filter(function(h) { return h.taskId === taskId; }).map(function(h) { return { strategy: h.strategy, attempt: h.attempt, resolution: h.resolution }; });
  }
}

export { FAILURE_CATEGORY, RECOVERY_ACTION, RECOVERY_MATRIX, FailureIntelligence };