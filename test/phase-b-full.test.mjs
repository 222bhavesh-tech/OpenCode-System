import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// ============================================================
// B1: MISSION ENGINE
// ============================================================
import { MissionEngine, MISSION_STATUS, TERMINAL_MISSION } from '../runtime/mission-engine.mjs';

describe('B1: Mission Engine', function() {
  let tmpDir, engine;
  
  before(function() {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mission-test-'));
    engine = new MissionEngine(tmpDir);
  });
  
  after(function() { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('should create a mission with all required fields', function() {
    const m = engine.createMission({ objective: 'Build feature X', requirements: ['R1', 'R2'], acceptanceCriteria: ['AC1'] });
    assert.ok(m.missionId.startsWith('mission-'));
    assert.equal(m.objective, 'Build feature X');
    assert.equal(m.status, MISSION_STATUS.CREATED);
    assert.deepEqual(m.requirements, ['R1', 'R2']);
    assert.deepEqual(m.acceptanceCriteria, ['AC1']);
    assert.ok(m.budget);
    assert.ok(m.spent);
    assert.ok(m.createdAt);
  });

  it('should load a saved mission', function() {
    const m = engine.createMission({ objective: 'Test load' });
    const loaded = engine.loadMission();
    assert.ok(loaded);
    assert.equal(loaded.missionId, m.missionId);
    assert.equal(loaded.objective, 'Test load');
  });

  it('should transition through lifecycle states', function() {
    const m = engine.createMission({ objective: 'Lifecycle test' });
    engine.transition(m, MISSION_STATUS.DISCOVERING);
    assert.equal(m.status, MISSION_STATUS.DISCOVERING);
    assert.equal(m.startedAt, null);
    engine.transition(m, MISSION_STATUS.EXECUTING);
    assert.equal(m.status, MISSION_STATUS.EXECUTING);
    assert.ok(m.startedAt);
    engine.transition(m, MISSION_STATUS.COMPLETED);
    assert.equal(m.status, MISSION_STATUS.COMPLETED);
    assert.ok(m.completedAt);
    assert.ok(TERMINAL_MISSION.has(m.status));
  });

  it('should add tasks to mission', function() {
    const m = engine.createMission({ objective: 'Task test' });
    const plane = engine.plane;
    plane.initialize({ goal: 'Task test' });
    const task = engine.addTask(m, { id: 't1', title: 'Task 1', kind: 'shell', command: 'echo hi', requiredEvidence: ['test'] });
    assert.equal(task.id, 't1');
    assert.equal(task.title, 'Task 1');
    assert.ok(m.tasks['t1']);
  });

  it('should add and complete milestones', function() {
    const m = engine.createMission({ objective: 'Milestone test' });
    const ms = engine.addMilestone(m, { title: 'Phase 1', criteria: ['C1'] });
    assert.ok(ms.id.startsWith('ms-'));
    assert.equal(ms.completed, false);
    engine.completeMilestone(m, ms.id);
    assert.equal(ms.completed, true);
    assert.ok(ms.completedAt);
  });

  it('should check budget correctly', function() {
    const m = engine.createMission({ objective: 'Budget test', budgets: { maxTimeMs: 1000, maxTokens: 100 } });
    try { engine.plane.initialize({ goal: 'Budget test' }); } catch(e) { /* ok */ }
    assert.ok(engine.checkBudget(m).withinBudget);
    m.spent.timeMs = 2000;
    const check = engine.checkBudget(m);
    assert.equal(check.withinBudget, false);
    assert.ok(check.violations.includes('TIME'));
  });

  it('should record failures and track retries', function() {
    const m = engine.createMission({ objective: 'Failure test' });
    const f = engine.recordFailure(m, { taskId: 't1', category: 'CODE', rootCause: 'Syntax error' });
    assert.ok(f.id.startsWith('fail-'));
    assert.equal(f.category, 'CODE');
    assert.equal(m.failures.length, 1);
    assert.equal(m.spent.retries, 1);
  });

  it('should record decisions', function() {
    const m = engine.createMission({ objective: 'Decision test' });
    const d = engine.recordDecision(m, { type: 'EXECUTE_TASK', reason: 'Task ready', taskId: 't1' });
    assert.ok(d.id.startsWith('dec-'));
    assert.equal(d.type, 'EXECUTE_TASK');
  });

  it('should add and resolve blockers', function() {
    const m = engine.createMission({ objective: 'Blocker test' });
    const b = engine.addBlocker(m, { description: 'Waiting for API key', severity: 'CRITICAL' });
    assert.ok(b.id.startsWith('blk-'));
    assert.equal(b.resolvedAt, null);
    engine.resolveBlocker(m, b.id);
    assert.ok(b.resolvedAt);
  });

  it('should record evidence', function() {
    const m = engine.createMission({ objective: 'Evidence test' });
    const e = engine.recordEvidence(m, { taskId: 't1', type: 'test', verdict: 'PASS', summary: 'All tests pass' });
    assert.ok(e.id.startsWith('ev-'));
    assert.equal(e.verdict, 'PASS');
  });

  it('should compute stats', function() {
    const m = engine.createMission({ objective: 'Stats test' });
    const plane = engine.plane;
    try { plane.initialize({ goal: 'Stats test' }); } catch(e) { /* already initialized */ }
    try {
      engine.addTask(m, { id: 't1stats', title: 'T1', kind: 'shell', command: 'echo 1', requiredEvidence: ['test'] });
      engine.addTask(m, { id: 't2stats', title: 'T2', kind: 'shell', command: 'echo 2', dependencies: ['t1stats'], requiredEvidence: ['test'] });
    } catch(e) { /* tasks may already exist */ }
    const stats = engine.getStats(m);
    assert.equal(stats.tasks.total, 2);
    assert.equal(stats.tasks.completed, 0);
    assert.ok(stats.budget);
  });

  it('should detect when mission can continue', function() {
    try { engine.plane.initialize({ goal: 'Continue test' }); } catch(e) { /* ok */ }
    const m = engine.createMission({ objective: 'Continue test' });
    assert.ok(engine.canContinue(m));
    m.status = MISSION_STATUS.COMPLETED;
    assert.equal(engine.canContinue(m), false);
  });
});

// ============================================================
// B2: CONTEXT ENGINE
// ============================================================
import { ContextEngine, CONTEXT_TYPE } from '../runtime/context-engine.mjs';

describe('B2: Context Engine', function() {
  let tmpDir, ctx;
  
  before(function() {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-test-'));
    fs.mkdirSync(path.join(tmpDir, '.opencode-system'), { recursive: true });
    ctx = new ContextEngine(tmpDir);
  });
  
  after(function() { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('should assemble task context with all sections', function() {
    const task = { id: 't1', title: 'Build API', description: 'REST API', acceptanceCriteria: ['Works'], specialist: 'backend', dependencies: [] };
    const state = { goal: 'Ship feature', status: 'EXECUTING', mode: 'ASSISTED', tasks: {}, decisions: [], evidence: [] };
    const context = ctx.assembleTaskContext(task, state, null);
    assert.ok(context.taskId === 't1');
    assert.ok(context.sections.requirements);
    assert.ok(context.sections.projectState);
    assert.ok(context.sections.conventions);
    assert.ok(context.tokenEstimate > 0);
  });

  it('should include dependencies in context', function() {
    const dep = { id: 'dep1', title: 'Dep task', status: 'COMPLETE', result: 'ok' };
    const task = { id: 't2', title: 'After dep', description: '', acceptanceCriteria: [], specialist: 'builder', dependencies: ['dep1'] };
    const state = { goal: 'Test', status: 'PLANNING', mode: 'ASSISTED', tasks: { dep1: dep }, decisions: [], evidence: [] };
    const context = ctx.assembleTaskContext(task, state, null);
    assert.ok(context.sections.dependencies);
    assert.equal(context.sections.dependencies.content[0].id, 'dep1');
  });

  it('should include failure history', function() {
    const failedTask = { id: 'f1', title: 'Failed', status: 'FAILED', attempts: 3 };
    const task = { id: 't3', title: 'Next', description: '', acceptanceCriteria: [], specialist: 'builder', dependencies: [] };
    const state = { goal: 'Test', status: 'EXECUTING', mode: 'ASSISTED', tasks: { f1: failedTask }, decisions: [], evidence: [] };
    const context = ctx.assembleTaskContext(task, state, null);
    assert.ok(context.sections.previousFailures);
    assert.equal(context.sections.previousFailures.content[0].taskId, 'f1');
  });

  it('should save and load context snapshots', function() {
    const context = { taskId: 'snap1', sections: { test: true } };
    const filepath = ctx.saveContextSnapshot(context, 'test-snap');
    assert.ok(fs.existsSync(filepath));
    const loaded = ctx.loadContextSnapshot('test-snap');
    assert.ok(loaded.taskId === 'snap1');
  });

  it('should detect when rotation is needed', function() {
    const small = { tokenEstimate: 100 };
    assert.equal(ctx.needsRotation(small), false);
    const large = { tokenEstimate: 50000 };
    assert.equal(ctx.needsRotation(large), true);
  });

  it('should prune oversized context', function() {
    const context = { sections: { big: { content: 'x'.repeat(5000) } }, tokenEstimate: 5000 };
    const pruned = ctx.pruneContext(context);
    assert.ok(pruned.sections.big.content.length < 5000);
    assert.ok(pruned.sections.big.content.includes('[pruned]'));
  });
});

// ============================================================
// B4: VERIFICATION STACK
// ============================================================
import { VerificationStack, VERDICT, VERIFICATION_TYPE, TestAdapter, CodeReviewAdapter, SpecificationAdapter, BuildAdapter, LintAdapter, TypecheckAdapter } from '../runtime/verification/index.mjs';

describe('B4: Verification Stack', function() {
  it('should create verification stack with all adapters', function() {
    const stack = new VerificationStack();
    const adapters = stack.getAdapters();
    assert.ok(adapters.includes('test'));
    assert.ok(adapters.includes('build'));
    assert.ok(adapters.includes('lint'));
    assert.ok(adapters.includes('typecheck'));
    assert.ok(adapters.includes('code-review'));
    assert.ok(adapters.includes('specification'));
  });

  it('should run code review adapter', async function() {
    const adapter = new CodeReviewAdapter();
    const receipt = await adapter.verify('t1', { projectRoot: process.cwd(), changedFiles: ['runtime/control-plane.mjs'] });
    assert.ok(receipt.verificationId);
    assert.ok([VERDICT.PASS, VERDICT.WARN].includes(receipt.verdict));
    assert.ok(receipt.timestamp);
  });

  it('should detect secrets in code review', async function() {
    const tmpFile = path.join(os.tmpdir(), 'secret-test-' + Date.now() + '.js');
    fs.writeFileSync(tmpFile, 'const api_key = "sk-test123";\nconst x = 1;');
    const adapter = new CodeReviewAdapter();
    const receipt = await adapter.verify('t1', { projectRoot: process.cwd(), changedFiles: [tmpFile] });
    assert.equal(receipt.verdict, VERDICT.FAIL);
    assert.ok(receipt.summary.includes('critical'));
    fs.unlinkSync(tmpFile);
  });

  it('should run specification adapter', async function() {
    const adapter = new SpecificationAdapter();
    const receipt = await adapter.verify('t1', { task: { id: 't1', title: 'Build', description: 'Build it', acceptanceCriteria: ['Works'] } });
    assert.equal(receipt.verdict, VERDICT.PASS);
  });

  it('should fail specification for missing fields', async function() {
    const adapter = new SpecificationAdapter();
    const receipt = await adapter.verify('t1', { task: { id: 't1' } });
    assert.equal(receipt.verdict, VERDICT.FAIL);
    assert.ok(receipt.details.issues.length > 0);
  });

  it('should run all verifications in stack', async function() {
    const stack = new VerificationStack();
    const receipts = await stack.runAll('t1', { projectRoot: process.cwd(), changedFiles: [], task: { id: 't1', title: 'T', description: 'D', acceptanceCriteria: ['C'] } }, ['code-review', 'specification']);
    assert.ok(receipts.length === 2);
    const summary = stack.summary(receipts);
    assert.equal(summary.total, 2);
  });

  it('should report allPassed correctly', function() {
    const stack = new VerificationStack();
    assert.ok(stack.allPassed([{ verdict: 'PASS' }, { verdict: 'SKIP' }]));
    assert.equal(stack.allPassed([{ verdict: 'PASS' }, { verdict: 'FAIL' }]), false);
  });

  it('should report anyFailed correctly', function() {
    const stack = new VerificationStack();
    assert.equal(stack.anyFailed([{ verdict: 'PASS' }, { verdict: 'WARN' }]), false);
    assert.ok(stack.anyFailed([{ verdict: 'PASS' }, { verdict: 'FAIL' }]));
  });
});

// ============================================================
// B5: INDEPENDENT CRITIC SYSTEM
// ============================================================
import { CriticSystem, CriticReceipt, CRITIC_ROLE, CRITIC_VERDICT } from '../runtime/critic.mjs';

describe('B5: Critic System', function() {
  it('should create critic system', function() {
    const critic = new CriticSystem();
    assert.ok(critic);
  });

  it('should submit and retrieve receipts', function() {
    const critic = new CriticSystem();
    const r = new CriticReceipt(CRITIC_ROLE.CODE_REVIEWER, 't1', CRITIC_VERDICT.APPROVE, ['Looks good'], 'Ship it');
    critic.submitReceipt(r);
    const receipts = critic.getReceipts('t1');
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].verdict, CRITIC_VERDICT.APPROVE);
  });

  it('should evaluate task with multiple reviews', function() {
    const critic = new CriticSystem({ minReviews: 2 });
    critic.submitReceipt(new CriticReceipt(CRITIC_ROLE.TESTER, 't1', CRITIC_VERDICT.APPROVE, [], 'Tests pass'));
    critic.submitReceipt(new CriticReceipt(CRITIC_ROLE.CODE_REVIEWER, 't1', CRITIC_VERDICT.APPROVE, [], 'Code looks good'));
    const evaluation = critic.evaluate('t1', []);
    assert.equal(evaluation.overall, CRITIC_VERDICT.APPROVE);
    assert.equal(evaluation.independentReviews, 2);
    assert.ok(evaluation.allEvidenceValid);
  });

  it('should reject when any critic rejects', function() {
    const critic = new CriticSystem({ minReviews: 1 });
    critic.submitReceipt(new CriticReceipt(CRITIC_ROLE.SECURITY_REVIEWER, 't1', CRITIC_VERDICT.REJECT, ['Vulnerability found'], 'Fix first'));
    const evaluation = critic.evaluate('t1', []);
    assert.equal(evaluation.overall, CRITIC_VERDICT.REJECT);
  });

  it('should detect builder cannot approve own work', function() {
    const critic = new CriticSystem();
    const r = new CriticReceipt(CRITIC_ROLE.JUDGE, 't1', CRITIC_VERDICT.APPROVE, [], 'Looks good');
    r.builderId = 'builder-1';
    const check = critic.checkBuilderCannotApproveSelf('builder-1', [r]);
    assert.equal(check.valid, false);
    assert.ok(check.violations.length > 0);
  });

  it('should report conditional when not enough reviews', function() {
    const critic = new CriticSystem({ minReviews: 3 });
    critic.submitReceipt(new CriticReceipt(CRITIC_ROLE.TESTER, 't1', CRITIC_VERDICT.APPROVE, [], 'OK'));
    const evaluation = critic.evaluate('t1', []);
    assert.equal(evaluation.overall, CRITIC_VERDICT.ABSTAIN);
  });

  it('should clear all receipts', function() {
    const critic = new CriticSystem();
    critic.submitReceipt(new CriticReceipt(CRITIC_ROLE.TESTER, 't1', CRITIC_VERDICT.APPROVE, [], 'OK'));
    critic.clear();
    assert.equal(critic.getReceipts('t1').length, 0);
  });
});

// ============================================================
// B6: FAILURE INTELLIGENCE
// ============================================================
import { FailureIntelligence, FAILURE_CATEGORY, RECOVERY_ACTION, RECOVERY_MATRIX } from '../runtime/failure-intelligence.mjs';

describe('B6: Failure Intelligence', function() {
  it('should create failure intelligence', function() {
    const fi = new FailureIntelligence();
    assert.ok(fi);
  });

  it('should classify errors correctly', function() {
    const fi = new FailureIntelligence();
    assert.equal(fi.classify(new Error('Timeout exceeded')), FAILURE_CATEGORY.TIMEOUT);
    assert.equal(fi.classify(new Error('ECONNREFUSED localhost:3000')), FAILURE_CATEGORY.NETWORK);
    assert.equal(fi.classify(new Error('Permission denied')), FAILURE_CATEGORY.PERMISSION);
    assert.equal(fi.classify(new Error('SyntaxError: unexpected token')), FAILURE_CATEGORY.CODE);
    assert.equal(fi.classify(new Error('Test failed: assert.equal')), FAILURE_CATEGORY.TEST);
    assert.equal(fi.classify(new Error('Build failed')), FAILURE_CATEGORY.BUILD);
    assert.equal(fi.classify(new Error('Module not found')), FAILURE_CATEGORY.DEPENDENCY);
  });

  it('should record and retrieve failures', function() {
    const fi = new FailureIntelligence();
    const f = fi.record({ taskId: 't1', category: FAILURE_CATEGORY.CODE, rootCause: 'Null reference' });
    assert.ok(f.id.startsWith('fail-'));
    assert.equal(f.taskId, 't1');
    const history = fi.getHistory('t1');
    assert.equal(history.length, 1);
  });

  it('should detect repeated strategy failures', function() {
    const fi = new FailureIntelligence({ maxRetriesPerStrategy: 2 });
    fi.record({ taskId: 't1', strategy: 'RETRY', attempt: 1 });
    fi.record({ taskId: 't1', strategy: 'RETRY', attempt: 2 });
    const rep = fi.analyzeRepetition('t1', 'RETRY');
    assert.equal(rep.count, 2);
    assert.equal(rep.exceeds, true);
  });

  it('should suggest recovery avoiding past strategies', function() {
    const fi = new FailureIntelligence();
    fi.record({ taskId: 't1', strategy: 'RETRY', attempt: 1 });
    fi.record({ taskId: 't1', strategy: 'RETRY', attempt: 2 });
    const suggestion = fi.suggestRecovery('t1', FAILURE_CATEGORY.CODE);
    assert.notEqual(suggestion, RECOVERY_ACTION.RETRY);
  });

  it('should resolve failures', function() {
    const fi = new FailureIntelligence();
    const f = fi.record({ taskId: 't1', category: FAILURE_CATEGORY.TEST, rootCause: 'Assert' });
    fi.resolve(f.id, 'Fixed test', 'Add regression test');
    const resolved = fi.getHistory('t1')[0];
    assert.equal(resolved.resolution, 'Fixed test');
    assert.equal(resolved.prevention, 'Add regression test');
  });

  it('should compute stats', function() {
    const fi = new FailureIntelligence();
    fi.record({ taskId: 't1', category: FAILURE_CATEGORY.CODE });
    fi.record({ taskId: 't2', category: FAILURE_CATEGORY.TEST });
    const stats = fi.getStats();
    assert.equal(stats.total, 2);
    assert.equal(stats.byCategory[FAILURE_CATEGORY.CODE], 1);
  });

  it('should return RECOVERY_MATRIX entries for all categories', function() {
    for (const cat of Object.values(FAILURE_CATEGORY)) {
      if (RECOVERY_MATRIX[cat]) {
        assert.ok(RECOVERY_MATRIX[cat].length > 0, 'Matrix for ' + cat);
      }
    }
  });
});

// ============================================================
// B7: WORKTREE MANAGER
// ============================================================
import { WorktreeManager, WORKTREE_STATUS } from '../runtime/worktree-manager.mjs';

describe('B7: Worktree Manager', function() {
  let tmpDir, wm;
  
  before(function() {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-test-'));
    fs.mkdirSync(path.join(tmpDir, '.opencode-system'), { recursive: true });
    wm = new WorktreeManager(tmpDir);
  });
  
  after(function() { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('should create a worktree', function() {
    const wt = wm.create('t1', 'worker-1', 'task/t1');
    assert.ok(wt.id.startsWith('wt-'));
    assert.equal(wt.taskId, 't1');
    assert.equal(wt.status, WORKTREE_STATUS.CREATING);
  });

  it('should activate a worktree', function() {
    const wt = wm.create('t2', 'worker-2', 'task/t2');
    wm.activate(wt.id);
    const loaded = wm.worktrees[wt.id];
    assert.equal(loaded.status, WORKTREE_STATUS.ACTIVE);
  });

  it('should track owned files', function() {
    const wt = wm.create('t3', 'worker-3');
    wm.activate(wt.id);
    wm.addOwnedFile(wt.id, 'src/api.js');
    wm.addOwnedFile(wt.id, 'src/routes.js');
    assert.equal(wm.worktrees[wt.id].ownedFiles.length, 2);
  });

  it('should detect file conflicts between worktrees', function() {
    const wt1 = wm.create('t4', 'w4');
    const wt2 = wm.create('t5', 'w5');
    wm.activate(wt1.id);
    wm.activate(wt2.id);
    wm.addOwnedFile(wt1.id, 'shared.js');
    wm.addOwnedFile(wt2.id, 'shared.js');
    const conflict = wm.detectConflict('t4', 't5');
    assert.ok(conflict.hasConflict);
    assert.ok(conflict.overlappingFiles.includes('shared.js'));
  });

  it('should report no conflict when files do not overlap', function() {
    const wt1 = wm.create('t6', 'w6');
    const wt2 = wm.create('t7', 'w7');
    wm.activate(wt1.id);
    wm.activate(wt2.id);
    wm.addOwnedFile(wt1.id, 'a.js');
    wm.addOwnedFile(wt2.id, 'b.js');
    const conflict = wm.detectConflict('t6', 't7');
    assert.equal(conflict.hasConflict, false);
  });

  it('should get active worktrees', function() {
    const active = wm.getActiveWorktrees();
    assert.ok(active.length > 0);
  });

  it('should get stats', function() {
    const stats = wm.getStats();
    assert.ok(stats.total > 0);
    assert.ok(typeof stats.active === 'number');
  });

  it('should abandon a worktree', function() {
    const wt = wm.create('t8', 'w8');
    wm.abandon(wt.id);
    assert.equal(wm.worktrees[wt.id].status, WORKTREE_STATUS.ABANDONED);
  });
});

// ============================================================
// B9: BROWSER ADAPTER
// ============================================================
import { BrowserAdapter, BROWSER_ACTION } from '../runtime/browser-adapter.mjs';

describe('B9: Browser Adapter', function() {
  it('should create browser adapter', function() {
    const adapter = new BrowserAdapter();
    assert.ok(adapter);
    assert.equal(adapter.isAvailable(), false);
  });

  it('should take screenshots with iteration tracking', async function() {
    const adapter = new BrowserAdapter({ maxIterations: 3 });
    const result = await adapter.screenshot({ url: 'http://localhost:3000' });
    assert.equal(result.iteration, 1);
    assert.equal(result.action, BROWSER_ACTION.SCREENSHOT);
    const result2 = await adapter.screenshot({ url: 'http://localhost:3000' });
    assert.equal(result2.iteration, 2);
  });

  it('should throw when iteration budget exceeded', async function() {
    const adapter = new BrowserAdapter({ maxIterations: 2 });
    await adapter.screenshot({});
    await adapter.screenshot({});
    try {
      await adapter.screenshot({});
      assert.fail('Should have thrown');
    } catch(e) {
      assert.ok(e.message.includes('budget'));
    }
  });

  it('should create fix tasks from issues', function() {
    const adapter = new BrowserAdapter();
    const task = adapter.createFixTask({ type: 'CONSOLE_ERROR', description: 'JS error' });
    assert.ok(task.id.startsWith('browser-fix-'));
    assert.equal(task.specialist, 'frontend');
  });

  it('should reset state', async function() {
    const adapter = new BrowserAdapter();
    await adapter.screenshot({});
    adapter.reset();
    assert.equal(adapter.getResults().length, 0);
  });
});

// ============================================================
// B10: MISSION COMPLETION ENGINE
// ============================================================
import { CompletionEngine, COMPLETION_CHECK, COMPLETION_RESULT } from '../runtime/completion-engine.mjs';

describe('B10: Completion Engine', function() {
  it('should create completion engine', function() {
    const engine = new CompletionEngine();
    assert.ok(engine);
  });

  it('should evaluate incomplete mission', function() {
    const engine = new CompletionEngine();
    const mission = { evidence: [], blockers: [], failures: [], acceptanceCriteria: ['AC1'], spent: {}, budget: {} };
    const planeStatus = { tasks: { t1: { status: 'PENDING', dependencies: [] } } };
    const result = engine.evaluate(mission, planeStatus);
    assert.equal(result.result, COMPLETION_RESULT.INCOMPLETE);
    assert.ok(result.failedChecks.length > 0);
  });

  it('should evaluate complete mission', function() {
    const engine = new CompletionEngine();
    const mission = {
      evidence: [{ type: 'test', verdict: 'PASS' }, { type: 'code-review', verdict: 'PASS' }],
      blockers: [],
      failures: [{ resolution: 'fixed' }],
      acceptanceCriteria: [],
      spent: { timeMs: 100, iterations: 5 },
      budget: { maxTimeMs: 10000, maxIterations: 100 },
    };
    const planeStatus = { tasks: { t1: { status: 'COMPLETE', dependencies: [] } } };
    const result = engine.evaluate(mission, planeStatus);
    assert.equal(result.result, COMPLETION_RESULT.COMPLETE);
    assert.equal(result.failedChecks.length, 0);
  });

  it('should detect budget exceeded', function() {
    const engine = new CompletionEngine();
    const mission = {
      evidence: [{ type: 'test', verdict: 'PASS' }],
      blockers: [],
      failures: [],
      acceptanceCriteria: [],
      spent: { timeMs: 10000, iterations: 200 },
      budget: { maxTimeMs: 5000, maxIterations: 100 },
    };
    const planeStatus = { tasks: { t1: { status: 'COMPLETE', dependencies: [] } } };
    const result = engine.evaluate(mission, planeStatus);
    assert.equal(result.result, COMPLETION_RESULT.BUDGET_EXCEEDED);
  });

  it('should detect blocked mission', function() {
    const engine = new CompletionEngine();
    const mission = {
      evidence: [],
      blockers: [{ id: 'b1', description: 'Need access' }],
      failures: [],
      acceptanceCriteria: [],
      spent: {},
      budget: {},
    };
    const planeStatus = { tasks: { t1: { status: 'PENDING', dependencies: [] } } };
    const result = engine.evaluate(mission, planeStatus);
    assert.equal(result.result, COMPLETION_RESULT.BLOCKED);
  });

  it('should check all completion types exist', function() {
    const checks = Object.values(COMPLETION_CHECK);
    assert.ok(checks.length >= 8);
  });
});

// ============================================================
// B11: CONTINUATION ENGINE
// ============================================================
import { ContinuationEngine, STOP_REASON } from '../runtime/continuation-engine.mjs';

describe('B11: Continuation Engine', function() {
  let tmpDir;
  
  before(function() { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cont-test-')); });
  after(function() { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('should create continuation engine', function() {
    const me = new MissionEngine(tmpDir);
    const ce = new CompletionEngine();
    const cont = new ContinuationEngine(me, ce);
    assert.ok(cont);
  });

  it('should decide to continue on active mission', function() {
    const me = new MissionEngine(tmpDir);
    const ce = new CompletionEngine();
    const cont = new ContinuationEngine(me, ce);
    const m = me.createMission({ objective: 'Test' });
    const plane = me.plane;
    plane.initialize({ goal: 'Test' });
    plane.addTask({ id: 't1', title: 'T1', kind: 'shell', command: 'echo 1', requiredEvidence: ['test'] });
    const planeStatus = plane.status();
    planeStatus.readyTasks = plane.readyTasks();
    const decision = cont.shouldContinue(m, planeStatus);
    assert.equal(decision.continue, true);
  });

  it('should stop on completed mission', function() {
    const me = new MissionEngine(tmpDir);
    const ce = new CompletionEngine();
    const cont = new ContinuationEngine(me, ce);
    const m = me.createMission({ objective: 'Done' });
    m.status = 'COMPLETED';
    const decision = cont.shouldContinue(m, { tasks: {} });
    assert.equal(decision.continue, false);
    assert.equal(decision.reason, STOP_REASON.MISSION_COMPLETE);
  });

  it('should stop on explicit stop', function() {
    const me = new MissionEngine(tmpDir);
    const ce = new CompletionEngine();
    const cont = new ContinuationEngine(me, ce);
    const m = me.createMission({ objective: 'Stop' });
    cont.stop('Manual stop');
    assert.ok(cont.isStopped());
    const decision = cont.shouldContinue(m, { tasks: {} });
    assert.equal(decision.continue, false);
    assert.equal(decision.reason, STOP_REASON.EXPLICIT_STOP);
  });

  it('should get next action', function() {
    const me = new MissionEngine(tmpDir);
    const ce = new CompletionEngine();
    const cont = new ContinuationEngine(me, ce);
    const m = me.createMission({ objective: 'Next' });
    const plane = me.plane;
    try { plane.initialize({ goal: 'Next' }); } catch(e) { /* already initialized */ }
    try { plane.addTask({ id: 't1-next-action', title: 'T1', kind: 'shell', command: 'echo 1', requiredEvidence: ['test'] }); } catch(e) { /* ok */ }
    const planeStatus = plane.status();
    planeStatus.readyTasks = plane.readyTasks();
    const action = cont.getNextAction(m, planeStatus);
    assert.equal(action.action, 'EXECUTE');
    assert.ok(action.tasks.length > 0);
  });

  it('should reset state', function() {
    const me = new MissionEngine(tmpDir);
    const ce = new CompletionEngine();
    const cont = new ContinuationEngine(me, ce);
    cont.stop('test');
    cont.reset();
    assert.equal(cont.isStopped(), false);
  });
});