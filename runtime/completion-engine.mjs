import { EventEmitter } from 'node:events';
import { TERMINAL_MISSION } from './mission-engine.mjs';

const COMPLETION_CHECK = Object.freeze({
  ALL_TASKS_COMPLETE: 'ALL_TASKS_COMPLETE',
  ALL_DEPENDENCIES_SATISFIED: 'ALL_DEPENDENCIES_SATISFIED',
  ALL_EVIDENCE_PASSES: 'ALL_EVIDENCE_PASSES',
  REQUIRED_TESTS_PASS: 'REQUIRED_TESTS_PASS',
  REQUIRED_REVIEWS_PASS: 'REQUIRED_REVIEWS_PASS',
  NO_UNRESOLVED_BLOCKERS: 'NO_UNRESOLVED_BLOCKERS',
  NO_ACTIVE_RECOVERY: 'NO_ACTIVE_RECOVERY',
  ACCEPTANCE_CRITERIA_MET: 'ACCEPTANCE_CRITERIA_MET',
  BUDGET_WITHIN_LIMITS: 'BUDGET_WITHIN_LIMITS',
});

const COMPLETION_RESULT = Object.freeze({
  COMPLETE: 'COMPLETE',
  INCOMPLETE: 'INCOMPLETE',
  BLOCKED: 'BLOCKED',
  BUDGET_EXCEEDED: 'BUDGET_EXCEEDED',
});

class CompletionEngine extends EventEmitter {
  constructor(options) {
    super();
    options = options || {};
    this.requiredChecks = options.requiredChecks || Object.values(COMPLETION_CHECK);
  }

  evaluate(mission, planeStatus) {
    var checks = {};
    var allTasks = Object.values(planeStatus.tasks || {});
    var taskCount = allTasks.length;
    var completedTasks = allTasks.filter(function(t) { return t.status === 'COMPLETE'; });
    checks[COMPLETION_CHECK.ALL_TASKS_COMPLETE] = { pass: taskCount > 0 && completedTasks.length === taskCount, detail: completedTasks.length + '/' + taskCount + ' complete' };

    var unmetDeps = 0;
    for (var i = 0; i < allTasks.length; i++) {
      var tk = allTasks[i];
      if (tk.status !== 'COMPLETE' && tk.dependencies) {
        for (var j = 0; j < tk.dependencies.length; j++) {
          var dep = planeStatus.tasks[tk.dependencies[j]];
          if (dep && dep.status !== 'COMPLETE') unmetDeps++;
        }
      }
    }
    checks[COMPLETION_CHECK.ALL_DEPENDENCIES_SATISFIED] = { pass: unmetDeps === 0, detail: unmetDeps + ' unmet dependencies' };

    var evidence = mission.evidence || [];
    var requiredEvidence = evidence.filter(function(e) { return e.verdict === 'PASS'; });
    checks[COMPLETION_CHECK.ALL_EVIDENCE_PASSES] = { pass: requiredEvidence.length >= evidence.length, detail: requiredEvidence.length + '/' + evidence.length + ' evidence passes' };

    var testReceipts = evidence.filter(function(e) { return e.type === 'test'; });
    checks[COMPLETION_CHECK.REQUIRED_TESTS_PASS] = { pass: testReceipts.length > 0 ? testReceipts.every(function(e) { return e.verdict === 'PASS'; }) : true, detail: testReceipts.filter(function(e) { return e.verdict === 'PASS'; }).length + '/' + testReceipts.length + ' tests pass' };

    var reviewReceipts = evidence.filter(function(e) { return e.type === 'code-review'; });
    checks[COMPLETION_CHECK.REQUIRED_REVIEWS_PASS] = { pass: reviewReceipts.length > 0 ? reviewReceipts.every(function(e) { return e.verdict === 'PASS' || e.verdict === 'WARN'; }) : true, detail: reviewReceipts.length + ' reviews' };

    var unresolvedBlockers = (mission.blockers || []).filter(function(b) { return !b.resolvedAt; });
    checks[COMPLETION_CHECK.NO_UNRESOLVED_BLOCKERS] = { pass: unresolvedBlockers.length === 0, detail: unresolvedBlockers.length + ' unresolved blockers' };

    var activeRecovery = (mission.failures || []).filter(function(f) { return !f.resolution; }).length > 0;
    checks[COMPLETION_CHECK.NO_ACTIVE_RECOVERY] = { pass: !activeRecovery, detail: activeRecovery ? 'Active failures unresolved' : 'No active recovery' };

    var criteria = mission.acceptanceCriteria || [];
    var criteriaMet = criteria.length === 0 || mission.evidence.some(function(e) { return e.type === 'acceptance' && e.verdict === 'PASS'; });
    checks[COMPLETION_CHECK.ACCEPTANCE_CRITERIA_MET] = { pass: criteriaMet, detail: criteria.length + ' criteria defined' };

    var budget = mission.spent || {};
    var budgetExceeded = false;
    if (mission.budget) {
      if (budget.timeMs && mission.budget.maxTimeMs && budget.timeMs >= mission.budget.maxTimeMs) budgetExceeded = true;
      if (budget.iterations && mission.budget.maxIterations && budget.iterations >= mission.budget.maxIterations) budgetExceeded = true;
    }
    checks[COMPLETION_CHECK.BUDGET_WITHIN_LIMITS] = { pass: !budgetExceeded, detail: budgetExceeded ? 'Budget exceeded' : 'Within budget' };

    var requiredChecks = this.requiredChecks;
    var passedChecks = requiredChecks.filter(function(c) { return checks[c] && checks[c].pass; });
    var failedChecks = requiredChecks.filter(function(c) { return checks[c] && !checks[c].pass; });

    var result;
    if (failedChecks.length === 0) result = COMPLETION_RESULT.COMPLETE;
    else if (checks[COMPLETION_CHECK.BUDGET_WITHIN_LIMITS] && !checks[COMPLETION_CHECK.BUDGET_WITHIN_LIMITS].pass) result = COMPLETION_RESULT.BUDGET_EXCEEDED;
    else if (checks[COMPLETION_CHECK.NO_UNRESOLVED_BLOCKERS] && !checks[COMPLETION_CHECK.NO_UNRESOLVED_BLOCKERS].pass) result = COMPLETION_RESULT.BLOCKED;
    else result = COMPLETION_RESULT.INCOMPLETE;

    var evaluation = { result: result, checks: checks, passedCount: passedChecks.length, failedCount: failedChecks.length, totalChecks: requiredChecks.length, passedChecks: passedChecks, failedChecks: failedChecks, timestamp: new Date().toISOString() };
    this.emit('completion:evaluated', { result: result, failedChecks: failedChecks });
    return evaluation;
  }
}

export { COMPLETION_CHECK, COMPLETION_RESULT, CompletionEngine };