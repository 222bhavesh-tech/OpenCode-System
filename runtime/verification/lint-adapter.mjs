import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { VerificationAdapter, VERDICT, VERIFICATION_TYPE, createReceipt } from './verification-base.mjs';

class LintAdapter extends VerificationAdapter {
  constructor(options) {
    super(VERIFICATION_TYPE.LINT, 'lint-adapter');
    options = options || {};
    this.lintCommand = options.lintCommand || null;
    this.timeout = options.timeout || 60000;
  }

  async verify(taskId, context) {
    var receipt = createReceipt(VERIFICATION_TYPE.LINT, taskId, VERDICT.PASS, '');
    var cmd = this.lintCommand || this._detectLintCommand(context);
    if (!cmd) { receipt.verdict = VERDICT.SKIP; receipt.summary = 'No linter detected'; return receipt; }
    try {
      var output = execSync(cmd, { cwd: context.projectRoot || process.cwd(), timeout: this.timeout, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      receipt.verdict = VERDICT.PASS;
      receipt.summary = 'Lint passed';
      receipt.details = { command: cmd };
    } catch (error) {
      receipt.verdict = VERDICT.FAIL;
      receipt.summary = 'Lint failed';
      receipt.details = { command: cmd, error: error.message, output: error.stdout ? error.stdout.toString().substring(0, 2000) : '' };
    }
    return receipt;
  }

  _detectLintCommand(context) {
    var root = context.projectRoot || process.cwd();
    if (fs.existsSync(root + '/.eslintrc') || fs.existsSync(root + '/.eslintrc.js') || fs.existsSync(root + '/.eslintrc.json')) return 'npx eslint . 2>&1';
    if (fs.existsSync(root + '/.pylintrc') || fs.existsSync(root + '/pylintrc')) return 'pylint **/*.py 2>&1';
    return null;
  }
}

export { LintAdapter };