import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { VerificationAdapter, VERDICT, VERIFICATION_TYPE, createReceipt } from './verification-base.mjs';

class TypecheckAdapter extends VerificationAdapter {
  constructor(options) {
    super(VERIFICATION_TYPE.TYPECHECK, 'typecheck-adapter');
    options = options || {};
    this.typeCommand = options.typeCommand || null;
    this.timeout = options.timeout || 60000;
  }

  async verify(taskId, context) {
    var receipt = createReceipt(VERIFICATION_TYPE.TYPECHECK, taskId, VERDICT.PASS, '');
    var cmd = this.typeCommand || this._detectCommand(context);
    if (!cmd) { receipt.verdict = VERDICT.SKIP; receipt.summary = 'No type checker detected'; return receipt; }
    try {
      execSync(cmd, { cwd: context.projectRoot || process.cwd(), timeout: this.timeout, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      receipt.verdict = VERDICT.PASS;
      receipt.summary = 'Type check passed';
    } catch (error) {
      receipt.verdict = VERDICT.FAIL;
      receipt.summary = 'Type check failed';
      receipt.details = { command: cmd, output: error.stdout ? error.stdout.toString().substring(0, 2000) : '' };
    }
    return receipt;
  }

  _detectCommand(context) {
    var root = context.projectRoot || process.cwd();
    if (fs.existsSync(root + '/tsconfig.json')) return 'npx tsc --noEmit 2>&1';
    if (fs.existsSync(root + '/pyproject.toml')) return 'python -m mypy . 2>&1';
    return null;
  }
}

export { TypecheckAdapter };