import fs from 'node:fs';
import { VerificationAdapter, VERDICT, VERIFICATION_TYPE, createReceipt } from './verification-base.mjs';

class CodeReviewAdapter extends VerificationAdapter {
  constructor(options) {
    super(VERIFICATION_TYPE.CODE_REVIEW, 'code-review-adapter');
    options = options || {};
    this.checks = options.checks || ['no-secrets', 'no-console', 'no-todo', 'max-line-length'];
    this.maxLineLength = options.maxLineLength || 200;
  }

  async verify(taskId, context) {
    var receipt = createReceipt(VERIFICATION_TYPE.CODE_REVIEW, taskId, VERDICT.PASS, '');
    var issues = [];
    var root = context.projectRoot || process.cwd();
    var changedFiles = (context && context.changedFiles) || [];
    for (var i = 0; i < changedFiles.length; i++) {
      var fp = changedFiles[i];
      if (!fs.existsSync(fp)) continue;
      var content = fs.readFileSync(fp, 'utf8');
      var lines = content.split('\n');
      for (var j = 0; j < lines.length; j++) {
        var line = lines[j];
        var lineNum = j + 1;
        if (this.checks.includes('no-secrets') && /(api[_-]?key|secret|password|token)\s*[:=]/i.test(line)) { issues.push({ file: fp, line: lineNum, rule: 'no-secrets', message: 'Potential secret detected' }); }
        if (this.checks.includes('no-console') && /console\.(log|debug|info)\(/.test(line)) { issues.push({ file: fp, line: lineNum, rule: 'no-console', message: 'Console statement' }); }
        if (this.checks.includes('no-todo') && /TODO|FIXME|HACK/.test(line)) { issues.push({ file: fp, line: lineNum, rule: 'no-todo', message: 'TODO/FIXME found' }); }
        if (this.checks.includes('max-line-length') && line.length > this.maxLineLength) { issues.push({ file: fp, line: lineNum, rule: 'max-line-length', message: 'Line exceeds ' + this.maxLineLength + ' chars' }); }
      }
    }
    var critical = issues.filter(function(i) { return i.rule === 'no-secrets'; });
    if (critical.length > 0) {
      receipt.verdict = VERDICT.FAIL;
      receipt.summary = critical.length + ' critical issues found';
    } else if (issues.length > 0) {
      receipt.verdict = VERDICT.WARN;
      receipt.summary = issues.length + ' non-critical issues found';
    } else {
      receipt.summary = 'Code review passed';
    }
    receipt.details = { issues: issues, fileCount: changedFiles.length };
    return receipt;
  }
}

export { CodeReviewAdapter };