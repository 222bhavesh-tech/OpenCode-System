import { EventEmitter } from 'node:events';
import { TERMINAL_MISSION } from './mission-engine.mjs';

const STOP_REASON = Object.freeze({
  MISSION_COMPLETE: 'MISSION_COMPLETE',
  BUDGET_EXCEEDED: 'BUDGET_EXCEEDED',
  SAFETY_BOUNDARY: 'SAFETY_BOUNDARY',
  UNRECOVERABLE_FAILURE: 'UNRECOVERABLE_FAILURE',
  EXPLICIT_STOP: 'EXPLICIT_STOP',
  USER_INTERVENTION: 'USER_INTERVENTION',
});

class ContinuationEngine extends EventEmitter {
  constructor(missionEngine, completionEngine, options) {
    super();
    options = options || {};
    this.missionEngine = missionEngine;
    this.completionEngine = completionEngine;
    this.maxConsecutiveNoop = options.maxConsecutiveNoop || 5;
    this.noopCount = 0;
    this._continuing = false;
    this._stopped = false;
    this._stopReason = null;
  }

  shouldContinue(mission, planeStatus) {
    if (this._stopped) return { continue: false, reason: STOP_REASON.EXPLICIT_STOP };
    if (TERMINAL_MISSION.has(mission.status)) return { continue: false, reason: STOP_REASON.MISSION_COMPLETE };
    var budget = this.missionEngine.checkBudget(mission);
    if (!budget.withinBudget) return { continue: false, reason: STOP_REASON.BUDGET_EXCEEDED };
    var unresolvedBlockers = mission.blockers.filter(function(b) { return !b.resolvedAt; });
    if (unresolvedBlockers.length > 0) return { continue: false, reason: STOP_REASON.SAFETY_BOUNDARY };
    var unrecoverable = mission.failures.filter(function(f) { return f.category === 'SECURITY' || f.category === 'PERMISSION'; });
    if (unrecoverable.length > 0) return { continue: false, reason: STOP_REASON.UNRECOVERABLE_FAILURE };
    var completion = this.completionEngine.evaluate(mission, planeStatus);
    if (completion.result === 'COMPLETE') return { continue: false, reason: STOP_REASON.MISSION_COMPLETE };
    var readyTasks = planeStatus.readyTasks || [];
    if (readyTasks.length === 0 && mission.activeWorkers.length === 0) {
      this.noopCount++;
      if (this.noopCount >= this.maxConsecutiveNoop) return { continue: false, reason: STOP_REASON.UNRECOVERABLE_FAILURE };
    } else {
      this.noopCount = 0;
    }
    return { continue: true, reason: null, completion: completion };
  }

  getNextAction(mission, planeStatus) {
    var completion = this.completionEngine.evaluate(mission, planeStatus);
    if (completion.result === 'COMPLETE') return { action: 'COMPLETE', reason: 'All checks passed' };
    if (completion.result === 'BUDGET_EXCEEDED') return { action: 'STOP', reason: 'Budget exceeded' };
    if (completion.result === 'BLOCKED') return { action: 'ESCALATE', reason: 'Unresolved blockers' };
    var readyTasks = planeStatus.readyTasks || [];
    if (readyTasks.length > 0) return { action: 'EXECUTE', tasks: readyTasks, reason: readyTasks.length + ' tasks ready' };
    if (mission.activeWorkers.length > 0) return { action: 'WAIT', reason: 'Workers active' };
    return { action: 'REPLAN', reason: 'No ready tasks but not complete' };
  }

  stop(reason) { this._stopped = true; this._stopReason = reason || STOP_REASON.EXPLICIT_STOP; this.emit('continuation:stopped', { reason: this._stopReason }); }
  reset() { this._stopped = false; this._stopReason = null; this.noopCount = 0; }
  isStopped() { return this._stopped; }
  getStopReason() { return this._stopReason; }
}

export { STOP_REASON, ContinuationEngine };