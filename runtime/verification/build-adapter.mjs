import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { VerificationAdapter, VERDICT, VERIFICATION_TYPE, createReceipt } from './verification-base.mjs';

class BuildAdapter extends VerificationAdapter {
  constructor(options) {
    super(VERIFICATION_TYPE.BUILD, 'build-adapter');
    options = options || {};
    this.buildCommand = options.buildCommand || null;
    this.timeout = options.timeout || 120000;
  }

  async verify(taskId, context) {
    var receipt = createReceipt(VERIFICATION_TYPE.BUILD, taskId, VERDICT.PASS, '');
    var cmd = this.buildCommand || this._detectBuildCommand(context);
    if (!cmd) {
      receipt.verdict = VERDICT.SKIP;
      receipt.summary = 'No build command detected';
      return receipt;
    }
    try {
      var output = execSync(cmd, { cwd: context.projectRoot || process.cwd(), timeout: this.timeout, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      receipt.verdict = VERDICT.PASS;
      receipt.summary = 'Build succeeded';
      receipt.details = { command: cmd, outputLength: output.length };
    } catch (error) {
      receipt.verdict = VERDICT.FAIL;
      receipt.summary = 'Build failed: ' + error.message;
      receipt.details = { command: cmd, error: error.message, stderr: error.stderr ? error.stderr.toString().substring(0, 2000) : '' };
    }
    return receipt;
  }

  _detectBuildCommand(context) {
    var root = context.projectRoot || process.cwd();
    if (fs.existsSync(root + '/package.json')) return 'npm run build 2>&1';
    if (fs.existsSync(root + '/Makefile')) return 'make build';
    if (fs.existsSync(root + '/Cargo.toml')) return 'cargo build 2>&1';
    if (fs.existsSync(root + '/go.mod')) return 'go build ./... 2>&1';
    return null;
  }
}

export { BuildAdapter };