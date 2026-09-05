import crypto from 'node:crypto';

const VERDICT = Object.freeze({
  PASS: 'PASS',
  FAIL: 'FAIL',
  WARN: 'WARN',
  SKIP: 'SKIP',
  ERROR: 'ERROR',
});

const VERIFICATION_TYPE = Object.freeze({
  TEST: 'test',
  BUILD: 'build',
  LINT: 'lint',
  TYPECHECK: 'typecheck',
  SECURITY: 'security',
  BROWSER: 'browser',
  SPECIFICATION: 'specification',
  CODE_REVIEW: 'code-review',
});

function createReceipt(type, taskId, verdict, summary, details) {
  return {
    verificationId: 'verif-' + crypto.randomUUID().slice(0, 12),
    taskId: taskId || null,
    type: type,
    verdict: verdict,
    summary: summary || '',
    details: details || {},
    artifacts: [],
    logs: [],
    timestamp: new Date().toISOString(),
  };
}

class VerificationAdapter {
  constructor(type, name) {
    this._type = type;
    this._name = name;
  }
  get type() { return this._type; }
  get name() { return this._name; }
  async verify(taskId, context) { throw new Error('verify() must be implemented'); }
}

export { VERDICT, VERIFICATION_TYPE, createReceipt, VerificationAdapter };