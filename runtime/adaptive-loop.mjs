import { EventEmitter } from 'node:events';
import { StrategyEngine } from './strategy-engine.mjs';
import { FailurePredictor } from './failure-predictor.mjs';
import { TaskDecomposer } from './task-decomposer.mjs';
import { StallDetector } from './stall-detector.mjs';
import { OscillationGuard } from './oscillation-guard.mjs';
import { MissionEconomics } from './mission-economics.mjs';
import { TelemetryCollector } from './telemetry.mjs';
import { AutonomyGovernor } from './autonomy-governor.mjs';
import { ContextOptimizer } from './context-optimizer.mjs';
import { AdaptiveVerification } from './adaptive-verification.mjs';
import { ExperienceStore } from './experience-store.mjs';
import { MissionMemory } from './mission-memory.mjs';
import { WorkerAdapter } from './worker.mjs';

const LOOP_STATE = Object.freeze({
  IDLE: 'IDLE',
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
});

class AdaptiveLoop extends EventEmitter {
  constructor(plane, options) {
    super();
    options = options || {};
    this.plane = plane;
    this.maxIterations = options.maxIterations || 50;
    this.maxConcurrent = options.maxConcurrent || 3;
    this.defaultTimeout = options.taskTimeoutMs || options.defaultTimeout || 300000;
    this.maxRetriesPerTask = options.maxRetriesPerTask || 3;
    this.maxFailures = options.maxFailures || 10;
    this.state = LOOP_STATE.IDLE;
    this.iteration = 0;
    this.results = [];
    this.succeeded = 0;
    this.failed = 0;
    this.projectRoot = options.projectRoot || plane.projectRoot;

    // Phase C modules
    this.experienceStore = new ExperienceStore(this.projectRoot);
    this.strategyEngine = new StrategyEngine(this.experienceStore);
    this.failurePredictor = new FailurePredictor(this.experienceStore);
    this.taskDecomposer = new TaskDecomposer();
    this.stallDetector = new StallDetector();
    this.oscillationGuard = new OscillationGuard();
    this.economics = new MissionEconomics();
    this.telemetry = new TelemetryCollector();
    this.governor = new AutonomyGovernor(this.experienceStore);
    this.contextOptimizer = new ContextOptimizer(this.experienceStore);
    this.verification = new AdaptiveVerification();
    this.memory = new MissionMemory(this.projectRoot);
    this.worker = new WorkerAdapter(plane, { timeout: this.defaultTimeout });
  }

  /**
   * Run the adaptive loop.
   */
  async run() {
    const startTime = Date.now();
    this.state = LOOP_STATE.RUNNING;
    this.iteration = 0;
    this.results = [];
    this.economics.startSession('mission-' + Date.now());
    this.telemetry.setGauge('loop:started', 1);

    this.emit('loop:start', { maxIterations: this.maxIterations });

    while (this.state === LOOP_STATE.RUNNING && this.iteration < this.maxIterations) {
      this.iteration++;
      const iterStart = Date.now();
      try {
        const iterResult = await this._runIteration();
        this.results.push(iterResult);
        this.telemetry.incrementCounter('loop:iterations');
        this.telemetry.recordMetric('loop:iteration_duration', Date.now() - iterStart);
        this.emit('loop:iteration', { iteration: this.iteration, result: iterResult });

        if (iterResult.phase === 'COMPLETE') {
          this.state = LOOP_STATE.COMPLETED;
          break;
        }
      } catch (error) {
        this.telemetry.incrementCounter('loop:errors');
        this.emit('loop:error', { iteration: this.iteration, error: error.message });
        this.results.push({ phase: 'ERROR', error: error.message, timestamp: Date.now() });
        if (this.iteration >= this.maxIterations) {
          this.state = LOOP_STATE.FAILED;
          break;
        }
      }
    }

    if (this.iteration >= this.maxIterations && this.state === LOOP_STATE.RUNNING) {
      this.state = LOOP_STATE.FAILED;
    }

    const duration = Date.now() - startTime;
    this.economics.endSession('mission-' + (startTime));
    this.telemetry.setGauge('loop:completed', 1);
    this.telemetry.recordMetric('loop:total_duration', duration);
    this.telemetry.recordMetric('loop:total_iterations', this.iteration);

    const summary = this._buildSummary(duration);
    this.memory.save({
      id: 'mission-' + startTime,
      objective: this.plane.load().goal || 'Unknown',
      outcome: this.state === LOOP_STATE.COMPLETED ? 'SUCCESS' : 'FAILURE',
      totalDuration: duration,
      qualityScore: this._calculateQualityScore(),
    });

    this.emit('loop:end', summary);
    return summary;
  }

  /**
   * Run a single iteration.
   */
  async _runIteration() {
    const state = this.plane.load();
    const tasks = Object.values(state.tasks);
    const pending = tasks.filter(t => t.status === 'PENDING');
    const inProgress = tasks.filter(t => t.status === 'IN_PROGRESS');

    // Check for stalls
    for (const task of inProgress) {
      const stallStatus = this.stallDetector.getStallStatus(task.id);
      if (stallStatus.stalled) {
        this.emit('loop:stall', { taskId: task.id, type: stallStatus.stallType });
        this.telemetry.incrementCounter('loop:stalls');
        return { phase: 'STALL_DETECTED', taskId: task.id, stallType: stallStatus.stallType };
      }
    }

    // Check for oscillation
    for (const task of inProgress) {
      const history = this.oscillationGuard.getHistory(task.id);
      if (history.length > 2) {
        const last = history[history.length - 1];
        const osc = this.oscillationGuard.recordChange(task.id, { value: task.status });
        if (osc) {
          this.emit('loop:oscillation', { taskId: task.id });
          this.telemetry.incrementCounter('loop:oscillations');
          return { phase: 'OSCILLATION_DETECTED', taskId: task.id };
        }
      }
    }

    // Check if all complete
    const completed = tasks.filter(t => t.status === 'COMPLETE');
    const failed = tasks.filter(t => t.status === 'FAILED');
    if (completed.length === tasks.length) {
      return { phase: 'COMPLETE', completed: completed.length, total: tasks.length };
    }
    if (tasks.length > 0 && completed.length + failed.length === tasks.length && failed.length > 0) {
      return { phase: 'FAILED', completed: completed.length, failed: failed.length, total: tasks.length };
    }

    // Ready tasks: decompose if complex
    const ready = this.plane.readyTasks();
    if (ready.length === 0 && inProgress.length === 0 && pending.length > 0) {
      return { phase: 'BLOCKED', pending: pending.length, blocked: pending.filter(t => !t.dependencies.every(d => state.tasks[d] && state.tasks[d].status === 'COMPLETE')).length };
    }
    if (ready.length === 0) {
      return { phase: 'IDLE', pending: pending.length, inProgress: inProgress.length };
    }

    // Predict failures for ready tasks
    for (const task of ready) {
      const prediction = this.failurePredictor.predict(task, { contextSize: JSON.stringify(state).length });
      if (prediction.risks.length > 0) {
        this.emit('loop:prediction', { taskId: task.id, risks: prediction.risks });
        this.telemetry.recordMetric('loop:risks_per_task', prediction.risks.length);
      }
    }

    // Select strategy for first ready task
    const task = ready[0];
    const strategy = this.strategyEngine.selectStrategy(task);
    this.emit('loop:strategy', { taskId: task.id, strategy: strategy.selectedStrategy });

    // Check autonomy
    const govCheck = this.governor.check('file-write', { taskId: task.id });
    if (!govCheck.allowed) {
      this.emit('loop:approval_required', { taskId: task.id, action: 'file-write' });
      return { phase: 'APPROVAL_REQUIRED', taskId: task.id, action: govCheck.action };
    }

    // Track stall detection for this task
    this.stallDetector.trackTask(task.id, { status: 'STARTED', progress: true });
    this.telemetry.incrementCounter('loop:tasks_started');

    // Start the task in ControlPlane
    this.plane.startTask(task.id);

    // Execute via worker
    try {
      const result = await this.worker.execute(task.id);
      if (result.success) {
        this.succeeded++;
        this.telemetry.incrementCounter('loop:tasks_succeeded');
        this.emit('loop:task-done', { taskId: task.id, duration: result.duration });
        this.experienceStore.record({ taskId: task.id, outcome: 'SUCCESS', strategy: strategy.selectedStrategy, duration: result.duration });
      } else {
        this.failed++;
        this.telemetry.incrementCounter('loop:tasks_failed');
        this.emit('loop:task-fail', { taskId: task.id, reason: result.category, strategy: strategy.selectedStrategy });
        this.experienceStore.record({ taskId: task.id, outcome: 'FAILURE', strategy: strategy.selectedStrategy, reason: result.category });
      }
      return { phase: 'EXECUTED', taskId: task.id, success: result.success, category: result.category, strategy: strategy.selectedStrategy };
    } catch (error) {
      this.failed++;
      this.telemetry.incrementCounter('loop:tasks_failed');
      this.emit('loop:task-fail', { taskId: task.id, reason: error.message, strategy: strategy.selectedStrategy });
      return { phase: 'EXECUTION_ERROR', taskId: task.id, error: error.message, strategy: strategy.selectedStrategy };
    }
  }

  /**
   * Pause the loop.
   */
  pause() {
    if (this.state === LOOP_STATE.RUNNING) {
      this.state = LOOP_STATE.PAUSED;
      this.emit('loop:paused', { iteration: this.iteration });
    }
  }

  /**
   * Resume the loop.
   */
  resume() {
    if (this.state === LOOP_STATE.PAUSED) {
      this.state = LOOP_STATE.RUNNING;
      this.emit('loop:resumed', { iteration: this.iteration });
    }
  }

  /**
   * Stop the loop.
   */
  stop(reason) {
    this.state = LOOP_STATE.FAILED;
    this.emit('loop:stopped', { reason: reason || 'manual', iteration: this.iteration });
  }

  /**
   * Get full status.
   */
  getStatus() {
    const state = this.plane.load();
    const tasks = Object.values(state.tasks);
    return {
      state: this.state,
      iteration: this.iteration,
      maxIterations: this.maxIterations,
      tasks: {
        total: tasks.length,
        pending: tasks.filter(t => t.status === 'PENDING').length,
        inProgress: tasks.filter(t => t.status === 'IN_PROGRESS').length,
        completed: tasks.filter(t => t.status === 'COMPLETE').length,
        failed: tasks.filter(t => t.status === 'FAILED').length,
      },
      economics: this.economics.stats(),
      telemetry: this.telemetry.summary(),
      stalledTasks: this.stallDetector.getStalledTasks(),
    };
  }

  _buildSummary(duration) {
    const state = this.plane.load();
    const tasks = Object.values(state.tasks);
    return {
      state: this.state,
      iterations: this.iteration,
      duration,
      completed: tasks.filter(t => t.status === 'COMPLETE').length,
      failed: tasks.filter(t => t.status === 'FAILED').length,
      total: tasks.length,
      economics: this.economics.stats(),
      telemetry: this.telemetry.summary(),
      qualityScore: this._calculateQualityScore(),
    };
  }

  _calculateQualityScore() {
    const state = this.plane.load();
    const tasks = Object.values(state.tasks);
    if (tasks.length === 0) return 0.5;
    const completed = tasks.filter(t => t.status === 'COMPLETE').length;
    return Math.round((completed / tasks.length) * 1000) / 1000;
  }
}

export { LOOP_STATE, AdaptiveLoop };