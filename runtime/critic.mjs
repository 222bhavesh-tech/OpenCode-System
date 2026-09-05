import { EventEmitter } from 'node:events';

const CRITIC_ROLE = Object.freeze({
  TESTER: 'tester',
  SECURITY_REVIEWER: 'security-reviewer',
  SPEC_REVIEWER: 'spec-reviewer',
  CODE_REVIEWER: 'code-reviewer',
  JUDGE: 'judge',
});

const CRITIC_VERDICT = Object.freeze({
  APPROVE: 'APPROVE',
  REJECT: 'REJECT',
  CONDITIONAL: 'CONDITIONAL',
  ABSTAIN: 'ABSTAIN',
});

class CriticReceipt {
  constructor(role, taskId, verdict, findings, recommendation) {
    this.criticRole = role;
    this.taskId = taskId;
    this.verdict = verdict;
    this.findings = findings || [];
    this.recommendation = recommendation || '';
    this.timestamp = new Date().toISOString();
    this.inventedEvidence = false;
  }
}

class CriticSystem extends EventEmitter {
  constructor(options) {
    super();
    options = options || {};
    this.requireIndependentReview = options.requireIndependentReview !== false;
    this.minReviews = options.minReviews || 2;
    this.receipts = new Map();
  }

  submitReceipt(receipt) {
    var key = receipt.taskId;
    if (!this.receipts.has(key)) this.receipts.set(key, []);
    this.receipts.get(key).push(receipt);
    this.emit('critic:receipt', { taskId: receipt.taskId, role: receipt.criticRole, verdict: receipt.verdict });
  }

  evaluate(taskId, verificationReceipts) {
    var criticReceipts = this.receipts.get(taskId) || [];
    var allApproved = criticReceipts.filter(function(r) { return r.verdict === CRITIC_VERDICT.APPROVE; });
    var anyRejected = criticReceipts.some(function(r) { return r.verdict === CRITIC_VERDICT.REJECT; });
    var anyConditional = criticReceipts.some(function(r) { return r.verdict === CRITIC_VERDICT.CONDITIONAL; });
    var allInvented = criticReceipts.every(function(r) { return !r.inventedEvidence; });

    var overall;
    if (anyRejected) overall = CRITIC_VERDICT.REJECT;
    else if (allApproved.length >= this.minReviews && allInvented) overall = CRITIC_VERDICT.APPROVE;
    else if (anyConditional) overall = CRITIC_VERDICT.CONDITIONAL;
    else overall = CRITIC_VERDICT.ABSTAIN;

    return {
      taskId: taskId,
      overall: overall,
      criticReceipts: criticReceipts,
      verificationReceipts: verificationReceipts || [],
      independentReviews: allApproved.length,
      requiredReviews: this.minReviews,
      allEvidenceValid: allInvented,
      timestamp: new Date().toISOString(),
    };
  }

  checkBuilderCannotApproveSelf(builderId, receipts) {
    var violations = [];
    for (var i = 0; i < receipts.length; i++) {
      var r = receipts[i];
      if (r.criticRole === CRITIC_ROLE.JUDGE && r.builderId === builderId) {
        violations.push({ receipt: r, reason: 'Builder cannot serve as judge for own work' });
      }
    }
    return { valid: violations.length === 0, violations: violations };
  }

  getReceipts(taskId) {
    return this.receipts.get(taskId) || [];
  }

  clear() {
    this.receipts.clear();
  }
}

export { CRITIC_ROLE, CRITIC_VERDICT, CriticReceipt, CriticSystem };