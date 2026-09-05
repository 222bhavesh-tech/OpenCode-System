import { VERDICT, VERIFICATION_TYPE, createReceipt } from './verification-base.mjs';
import { TestAdapter } from './test-adapter.mjs';
import { BuildAdapter } from './build-adapter.mjs';
import { LintAdapter } from './lint-adapter.mjs';
import { TypecheckAdapter } from './typecheck-adapter.mjs';
import { CodeReviewAdapter } from './code-review-adapter.mjs';
import { SpecificationAdapter } from './specification-adapter.mjs';

class VerificationStack {
  constructor(options) {
    options = options || {};
    this.adapters = new Map();
    this.adapters.set('test', new TestAdapter(options.test || {}));
    this.adapters.set('build', new BuildAdapter(options.build || {}));
    this.adapters.set('lint', new LintAdapter(options.lint || {}));
    this.adapters.set('typecheck', new TypecheckAdapter(options.typecheck || {}));
    this.adapters.set('code-review', new CodeReviewAdapter(options.codeReview || {}));
    this.adapters.set('specification', new SpecificationAdapter(options.specification || {}));
  }

  async runAll(taskId, context, types) {
    var typesToRun = types || ['test', 'build', 'lint', 'typecheck', 'code-review', 'specification'];
    var receipts = [];
    for (var i = 0; i < typesToRun.length; i++) {
      var adapter = this.adapters.get(typesToRun[i]);
      if (adapter) {
        var receipt = await adapter.verify(taskId, context);
        receipts.push(receipt);
      }
    }
    return receipts;
  }

  async runSingle(type, taskId, context) {
    var adapter = this.adapters.get(type);
    if (!adapter) throw new Error('Unknown verification type: ' + type);
    return adapter.verify(taskId, context);
  }

  getAdapters() { return [...this.adapters.keys()]; }

  allPassed(receipts) {
    return receipts.every(function(r) { return r.verdict === 'PASS' || r.verdict === 'SKIP'; });
  }

  anyFailed(receipts) {
    return receipts.some(function(r) { return r.verdict === 'FAIL'; });
  }

  summary(receipts) {
    return { total: receipts.length, pass: receipts.filter(function(r) { return r.verdict === 'PASS'; }).length, fail: receipts.filter(function(r) { return r.verdict === 'FAIL'; }).length, warn: receipts.filter(function(r) { return r.verdict === 'WARN'; }).length, skip: receipts.filter(function(r) { return r.verdict === 'SKIP'; }).length };
  }
}

export { VerificationStack, VERDICT, VERIFICATION_TYPE, TestAdapter, BuildAdapter, LintAdapter, TypecheckAdapter, CodeReviewAdapter, SpecificationAdapter };