import { execSync } from 'node:child_process';
import { VerificationAdapter, VERDICT, VERIFICATION_TYPE, createReceipt } from './verification-base.mjs';

class TestAdapter extends VerificationAdapter {
  constructor(options) {
    super(VERIFICATION_TYPE.TEST, 'test-adapter');
    options = options || {};
    this.testCommand = options.testCommand || 'node --test test/';
    this.timeout = options.timeout || 60000;
  }

  async verify(taskId, context) {
    var receipt = createReceipt(VERIFICATION_TYPE.TEST, taskId, VERDICT.PASS, '');
    try {
      var output = execSync(this.testCommand, { cwd: context.projectRoot || process.cwd(), timeout: this.timeout, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      var lines = output.split('\n');
      var passMatch = output.match(/pass\s+(\d+)/);
      var failMatch = output.match(/fail\s+(\d+)/);
      var passCount = passMatch ? parseInt(passMatch[1], 10) : 0;
      var failCount = failMatch ? parseInt(failMatch[1], 10) : 0;
      receipt.verdict = failCount === 0 ? VERDICT.PASS : VERDICT.FAIL;
      receipt.summary = passCount + ' passed, ' + failCount + ' failed';
      receipt.details = { pass: passCount, fail: failCount, output: lines.slice(-20).join('\n') };
      receipt.logs = lines;
    } catch (error) {
      receipt.verdict = VERDICT.FAIL;
      receipt.summary = error.message;
      receipt.details = { error: error.message, stderr: error.stderr ? error.stderr.toString().substring(0, 2000) : '' };
    }
    return receipt;
  }
}

export { TestAdapter };