import { VerificationAdapter, VERDICT, VERIFICATION_TYPE, createReceipt } from './verification-base.mjs';

class SpecificationAdapter extends VerificationAdapter {
  constructor(options) {
    super(VERIFICATION_TYPE.SPECIFICATION, 'specification-adapter');
    this.requiredFields = (options && options.requiredFields) || ['title', 'description', 'acceptanceCriteria'];
  }

  async verify(taskId, context) {
    var receipt = createReceipt(VERIFICATION_TYPE.SPECIFICATION, taskId, VERDICT.PASS, '');
    var issues = [];
    var task = context.task || null;
    if (!task) { receipt.verdict = VERDICT.SKIP; receipt.summary = 'No task to verify'; return receipt; }
    for (var i = 0; i < this.requiredFields.length; i++) {
      var field = this.requiredFields[i];
      if (!task[field] || (Array.isArray(task[field]) && task[field].length === 0)) { issues.push({ field: field, message: 'Missing or empty: ' + field }); }
    }
    if (issues.length > 0) {
      receipt.verdict = VERDICT.FAIL;
      receipt.summary = issues.length + ' specification issues';
    } else {
      receipt.summary = 'Specification verified';
    }
    receipt.details = { issues: issues, task: task.id || taskId };
    return receipt;
  }
}

export { SpecificationAdapter };