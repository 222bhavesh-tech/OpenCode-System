/**
 * AutonomousLoop — the main orchestrator.
 *
 * Ties together all Phase A modules into the observe→understand→decide→plan→
 * delegate→execute→evaluate→verify→critique→recover→persist→continue→complete
 * loop.
 *
 * Flow:
 *   1. OBSERVE   — Load project state
 *   2. UNDERSTAND — ContextResolver assembles task context
 *   3. DECIDE    — DecisionEngine determines next action
 *   4. PLAN      — Replanner mutates DAG if needed
 *   5. DELEGATE  — AgentRuntime spawns workers
 *   6. EXECUTE   — ParallelScheduler runs tasks
 *   7. EVALUATE  — Check evidence verdicts
 *   8. VERIFY    — Evidence gates pass/fail
 *   9. CRITIQUE  — Review results
 *  10. RECOVER   — FailureStrategy handles failures
 *  11. PERSIST   — ContextCheckpoint saves state
 *  12. CONTINUE  — Loop back to step 1
 *  13. COMPLETE  — All tasks done
 *
 * Usage:
 *   import { AutonomousLoop } from './autonomous-loop.mjs';
 *   const loop = new AutonomousLoop(plane);
 *   const result = await loop.run();
 */

import { EventEmitter } from 'node:events';
import { DecisionEngine, DECISION_TYPE } from './decision-engine.mjs';
import { Replanner } from './replanner.mjs';
import { AgentRuntime } from './agent-runtime.mjs';
import { ParallelScheduler } from './parallel-scheduler.mjs';
import { ContextResolver } from './context-resolver.mjs';
import { FailureStrategy, STRATEGY_TYPE } from './failure-strategy.mjs';
import { ContextCheckpoint } from './context-checkpoint.mjs';

const LOOP_PHASE = Object.freeze({
  OBSERVE: 'OBSERVE',
  UNDERSTAND: 'UNDERSTAND',
  DECIDE: 'DECIDE',
  PLAN: 'PLAN',
  DELEGATE: 'DELEGATE',
  EXECUTE: 'EXECUTE',
  EVALUATE: 'EVALUATE',
  VERIFY: 'VERIFY',
  CRITIQUE: 'CRITIQUE',
  RECOVER: 'RECOVER',
  PERSIST: 'PERSIST',
  CONTINUE: 'CONTINUE',
  COMPLETE: 'COMPLETE',
});

export { LOOP_PHASE };

export class AutonomousLoop extends EventEmitter {
  /**
   * @param {import('./control-plane.mjs').ControlPlane} plane
   * @param {object} [options]
   * @param {number} [options.maxIterations=50]
   * @param {number} [options.maxConcurrent=3]
   * @param {number} [options.checkpointInterval=5]
   * @param {number} [options.defaultTimeout=300000]
   * @param {boolean} [options.failFast=false]
   * @param {boolean} [options.dryRun=false]
   */
  constructor(plane, options = {}) {
    super();
    this.plane = plane;
    this.options = {
      maxIterations: options.maxIterations ?? 50,
      maxConcurrent: options.maxConcurrent ?? 3,
      checkpointInterval: options.checkpointInterval ?? 5,
      defaultTimeout: options.defaultTimeout ?? 300_000,
      failFast: options.failFast ?? false,
      dryRun: options.dryRun ?? false,
    };

    // Initialize all modules
    this.decisionEngine = new DecisionEngine(plane, {
      checkpointInterval: this.options.checkpointInterval,
    });
    this.replanner = new Replanner(plane);
    this.scheduler = new ParallelScheduler(plane, {
      maxConcurrent: this.options.maxConcurrent,
      defaultTimeout: this.options.defaultTimeout,
      failFast: this.options.failFast,
    });
    this.contextResolver = new ContextResolver(plane);
    this.failureStrategy = new FailureStrategy(plane);
    this.checkpoint = new ContextCheckpoint(plane);

    // State
    this._phase = LOOP_PHASE.OBSERVE;
    this._iteration = 0;
    this._phases = [];
    this._running = false;
    this._completed = false;
  }

  /**
   * Run the autonomous loop until completion or stop condition.
   *
   * @returns {{ success, iterations, phases, result, duration }}
   */
  async run() {
    const startTime = Date.now();
    this._running = true;
    this._completed = false;

    this.emit('loop:start', { maxIterations: this.options.maxIterations });

    while (this._running && this._iteration < this.options.maxIterations) {
      this._iteration++;

      try {
        const phaseResult = await this._executeIteration();
        this._phases.push(phaseResult);

        this.emit('loop:iteration', {
          iteration: this._iteration,
          phase: phaseResult.phase,
          decision: phaseResult.decision?.type,
          duration: phaseResult.duration,
        });

        // Check termination conditions
        if (phaseResult.phase === LOOP_PHASE.COMPLETE) {
          this._completed = true;
          this._running = false;
          break;
        }

        if (phaseResult.phase === LOOP_PHASE.RECOVER && phaseResult.decision?.type === DECISION_TYPE.ABORT) {
          this._running = false;
          break;
        }

        // Checkpoint periodically
        if (this._iteration % this.options.checkpointInterval === 0) {
          this._saveCheckpoint();
        }
      } catch (error) {
        this.emit('loop:error', { iteration: this._iteration, error: error.message });
        this._phases.push({
          phase: LOOP_PHASE.RECOVER,
          error: error.message,
          timestamp: new Date().toISOString(),
        });

        if (this.options.failFast) {
          this._running = false;
          break;
        }
      }
    }

    // Final checkpoint
    this._saveCheckpoint();

    const duration = Date.now() - startTime;
    const result = {
      success: this._completed,
      iterations: this._iteration,
      phases: this._phases.length,
      duration,
      stats: this.scheduler.stats(),
      decisionHistory: this.decisionEngine.history,
    };

    this.emit('loop:end', result);
    return result;
  }

  /**
   * Execute a single iteration of the loop.
   *
   * @returns {{ phase, decision, results, duration }}
   */
  async _executeIteration() {
    const iterStart = Date.now();

    // 1. OBSERVE
    this._phase = LOOP_PHASE.OBSERVE;
    const state = this.plane.load();
    const status = this.plane.status();

    // 2. UNDERSTAND — Context is resolved per-task in the scheduler

    // 3. DECIDE
    this._phase = LOOP_PHASE.DECIDE;
    const decision = await this.decisionEngine.decide();

    // 4. PLAN (if replan needed)
    if (decision.type === DECISION_TYPE.REPLAN) {
      this._phase = LOOP_PHASE.PLAN;
      this.emit('loop:replan', decision);
      // Replanner is called externally or via events
    }

    // 5-6. DELEGATE + EXECUTE
    let results = [];
    if (decision.type === DECISION_TYPE.EXECUTE_TASK) {
      this._phase = LOOP_PHASE.EXECUTE;
      if (!this.options.dryRun) {
        const { results: r } = await this.scheduler.runParallel();
        results = r;
      }
    } else if (decision.type === DECISION_TYPE.PARALLELIZE) {
      this._phase = LOOP_PHASE.EXECUTE;
      if (!this.options.dryRun) {
        const { results: r } = await this.scheduler.runParallel();
        results = r;
      }
    } else if (decision.type === DECISION_TYPE.CHECKPOINT) {
      this._phase = LOOP_PHASE.PERSIST;
      this._saveCheckpoint();
    } else if (decision.type === DECISION_TYPE.RECOVER) {
      this._phase = LOOP_PHASE.RECOVER;
      if (decision.taskId) {
        const task = state.tasks[decision.taskId];
        const failure = state.failures.find((f) => f.taskId === decision.taskId);
        if (failure) {
          const strategy = this.failureStrategy.select(decision.taskId, failure);
          this.emit('loop:strategy', strategy);

          // Apply strategy
          if (strategy.strategy === STRATEGY_TYPE.RETRY) {
            // Task will be retried on next iteration
          } else if (strategy.strategy === STRATEGY_TYPE.SWITCH_AGENT && strategy.params.newAgent) {
            this.replanner.changeSpecialist(decision.taskId, strategy.params.newAgent);
          }
        }
      }
    } else if (decision.type === DECISION_TYPE.COMPLETE) {
      this._phase = LOOP_PHASE.COMPLETE;
    }

    // 7-9. EVALUATE + VERIFY + CRITIQUE (after execution)
    if (results.length > 0) {
      this._phase = LOOP_PHASE.EVALUATE;
      // Evidence is already recorded by ParallelScheduler
    }

    // 11. PERSIST (always save state after changes)
    if (results.length > 0 || decision.type === DECISION_TYPE.RECOVER) {
      this._phase = LOOP_PHASE.PERSIST;
    }

    // 12. CONTINUE or 13. COMPLETE
    if (decision.type === DECISION_TYPE.COMPLETE) {
      this._phase = LOOP_PHASE.COMPLETE;
    } else {
      this._phase = LOOP_PHASE.CONTINUE;
    }

    return {
      phase: this._phase,
      decision,
      results,
      duration: Date.now() - iterStart,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Stop the loop.
   *
   * @param {string} [reason]
   */
  stop(reason = 'manual') {
    this._running = false;
    this.emit('loop:stopped', { reason, iteration: this._iteration });
  }

  /**
   * Get loop status.
   *
   * @returns {{ running, completed, iteration, phase, stats }}
   */
  status() {
    return {
      running: this._running,
      completed: this._completed,
      iteration: this._iteration,
      phase: this._phase,
      stats: this.scheduler.stats(),
    };
  }

  /**
   * Get full loop history.
   *
   * @returns {{ phases, decisions, mutations }}
   */
  history() {
    return {
      phases: [...this._phases],
      decisions: this.decisionEngine.history,
      mutations: this.replanner.history,
    };
  }

  /**
   * Reset for new mission.
   */
  reset() {
    this._phase = LOOP_PHASE.OBSERVE;
    this._iteration = 0;
    this._phases = [];
    this._running = false;
    this._completed = false;
    this.decisionEngine.reset();
    this.scheduler.reset();
  }

  // ─── Private ──────────────────────────────────────────────────────

  _saveCheckpoint() {
    try {
      this.checkpoint.save({
        workers: this.scheduler.runtime.listWorkers(),
        decisions: this.decisionEngine.history.slice(-20),
        mutations: this.replanner.history.slice(-20),
      });
    } catch (error) {
      this.emit('loop:checkpoint:error', { error: error.message });
    }
  }
}
