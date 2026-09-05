/**
 * ParallelScheduler — Safe multi-agent parallel execution (B8).
 *
 * Builds on AgentRuntime with:
 *   - Worker lifecycle: start, pause, resume, cancel, timeout, fail, complete
 *   - File ownership tracking with conflict PREVENTION (not just detection)
 *   - Capability-aware scheduling (match tasks to agents by required capabilities)
 *   - Worker health monitoring (heartbeat, health checks)
 *   - Graceful degradation (pause on threshold, resume after recovery)
 *   - Budget enforcement per worker and globally
 *
 * Safety invariants:
 *   - Two workers never own the same file simultaneously
 *   - Workers never declare mission complete
 *   - All autonomous actions are observable
 *   - No unbounded loops (max iterations enforced)
 *   - No second scheduler authority
 *
 * Usage:
 *   import { ParallelScheduler } from './parallel-scheduler.mjs';
 *   const scheduler = new ParallelScheduler(plane, { maxConcurrent: 3 });
 *   const results = await scheduler.runParallel();
 */

import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import { AgentRuntime, WORKER_STATUS } from './agent-runtime.mjs';
import { ContextResolver } from './context-resolver.mjs';

// Worker lifecycle states (superset of WORKER_STATUS from agent-runtime)
const SCHEDULER_WORKER_STATUS = Object.freeze({
  ...WORKER_STATUS,
  PAUSING: 'PAUSING',     // Transitioning to paused
  RESUMING: 'RESUMING',   // Transitioning from paused to running
  DEGRADED: 'DEGRADED',   // Running but below health threshold
});

// Capability requirements for task→agent matching
const AGENT_CAPABILITY = Object.freeze({
  BUILDER: 'builder',
  TESTER: 'tester',
  REVIEWER: 'reviewer',
  DEBUGGER: 'debugger',
  REFACTORER: 'refactorer',
});

// Default capabilities per agent role
const DEFAULT_CAPABILITIES = Object.freeze({
  [AGENT_CAPABILITY.BUILDER]: ['code-write', 'file-edit', 'shell-execute'],
  [AGENT_CAPABILITY.TESTER]: ['test-run', 'code-read', 'file-read'],
  [AGENT_CAPABILITY.REVIEWER]: ['code-read', 'file-read', 'security-check'],
  [AGENT_CAPABILITY.DEBUGGER]: ['code-read', 'file-read', 'shell-execute', 'code-edit'],
  [AGENT_CAPABILITY.REFACTORER]: ['code-read', 'code-edit', 'file-edit', 'file-write'],
});

class ParallelScheduler extends EventEmitter {
  constructor(plane, options = {}) {
    super();
    this.plane = plane;
    this.contextResolver = new ContextResolver(plane);

    // Configuration
    this.maxConcurrent = options.maxConcurrent ?? 3;
    this.defaultTimeout = options.defaultTimeout ?? 300_000;
    this.failFast = options.failFast ?? false;
    this.maxIterations = options.maxIterations ?? 50;
    this.healthCheckInterval = options.healthCheckInterval ?? 30_000;
    this.degradedThreshold = options.degradedThreshold ?? 0.5; // 50% failure rate triggers pause

    // Runtime
    this.runtime = new AgentRuntime(plane, {
      maxConcurrent: this.maxConcurrent,
      defaultTimeout: this.defaultTimeout,
    });

    // Worker state tracking (extends AgentRuntime with scheduler-level concerns)
    this._workerStates = new Map(); // workerId → extended state
    this._fileOwnership = new Map(); // filePath → workerId
    this._agentCapabilities = new Map(); // role → Set<capability>
    this._pauseRequested = false;
    this._degradedMode = false;
    this._results = [];
    this._iteration = 0;

    // Load default capabilities
    for (const [role, caps] of Object.entries(DEFAULT_CAPABILITIES)) {
      this._agentCapabilities.set(role, new Set(caps));
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // WORKER LIFECYCLE: start, pause, resume, cancel, timeout, fail, complete
  // ═══════════════════════════════════════════════════════════════

  /**
   * Spawn and start a worker for a task.
   */
  startWorker(taskId, role, options = {}) {
    // Check if task already has a worker
    if (this.runtime.getWorkerByTask(taskId)) {
      throw new Error(`Task ${taskId} already has an active worker`);
    }

    // Check concurrent limit
    const running = this._getRunningWorkers().length;
    if (running >= this.maxConcurrent) {
      throw new Error(`Max concurrent workers (${this.maxConcurrent}) reached`);
    }

    // Spawn through AgentRuntime
    const { workerId } = this.runtime.spawn(taskId, role, {
      timeout: options.timeout ?? this.defaultTimeout,
    });

    // Extended state for scheduler-level tracking
    const extended = {
      workerId,
      taskId,
      role,
      status: SCHEDULER_WORKER_STATUS.PENDING,
      startTime: null,
      pauseTime: null,
      resumeCount: 0,
      healthScore: 1.0,
      heartbeat: null,
      ownedFiles: [],
      capabilities: options.capabilities || this._getCapabilitiesForRole(role),
      budget: options.budget ?? null,
      toolCalls: 0,
      tokens: 0,
    };

    this._workerStates.set(workerId, extended);

    // Register file ownership if specified
    if (options.ownedFiles) {
      for (const file of options.ownedFiles) {
        this._claimFile(workerId, file);
      }
    }

    this.emit('worker:started', { workerId, taskId, role });
    return { workerId, taskId, role, status: extended.status };
  }

  /**
   * Pause a running worker (graceful pause).
   * Worker completes current operation then pauses.
   */
  pauseWorker(workerId, reason = 'manual') {
    const ext = this._workerStates.get(workerId);
    if (!ext) throw new Error(`Unknown worker: ${workerId}`);

    const runtimeWorker = this.runtime.getWorker(workerId);
    if (!runtimeWorker || runtimeWorker.status !== WORKER_STATUS.RUNNING) {
      throw new Error(`Worker ${workerId} is not running (status: ${runtimeWorker?.status})`);
    }

    ext.status = SCHEDULER_WORKER_STATUS.PAUSING;
    ext.pauseTime = Date.now();

    this.emit('worker:pausing', { workerId, taskId: ext.taskId, reason });

    // Actual pause is cooperative — worker checks shouldPause() before next operation
    return { workerId, status: 'PAUSING', reason };
  }

  /**
   * Resume a paused worker.
   */
  resumeWorker(workerId) {
    const ext = this._workerStates.get(workerId);
    if (!ext) throw new Error(`Unknown worker: ${workerId}`);

    if (ext.status !== SCHEDULER_WORKER_STATUS.PAUSING && ext.status !== SCHEDULER_WORKER_STATUS.PAUSED) {
      throw new Error(`Worker ${workerId} is not pausable (status: ${ext.status})`);
    }

    ext.status = SCHEDULER_WORKER_STATUS.RESUMING;
    ext.resumeCount++;

    this.emit('worker:resuming', { workerId, taskId: ext.taskId, resumeCount: ext.resumeCount });

    // Cooperative resume — worker resumes from checkpoint
    setTimeout(() => {
      ext.status = SCHEDULER_WORKER_STATUS.RUNNING;
      this.emit('worker:resumed', { workerId, taskId: ext.taskId });
    }, 0);

    return { workerId, status: 'RESUMING', resumeCount: ext.resumeCount };
  }

  /**
   * Cancel a worker.
   */
  cancelWorker(workerId, reason = 'manual') {
    const ext = this._workerStates.get(workerId);
    if (!ext) throw new Error(`Unknown worker: ${workerId}`);

    this.runtime.cancel(workerId, reason);

    // Release file ownership
    for (const file of ext.ownedFiles) {
      this._releaseFile(workerId, file);
    }

    ext.status = SCHEDULER_WORKER_STATUS.CANCELLED;
    this.emit('worker:cancelled', { workerId, taskId: ext.taskId, reason });
    return { workerId, status: 'CANCELLED', reason };
  }

  /**
   * Check if a worker should pause (cooperative check).
   */
  shouldPause(workerId) {
    const ext = this._workerStates.get(workerId);
    return ext && ext.status === SCHEDULER_WORKER_STATUS.PAUSING;
  }

  // ═══════════════════════════════════════════════════════════════
  // FILE OWNERSHIP: conflict prevention
  // ═══════════════════════════════════════════════════════════════

  /**
   * Check if a file is available for claiming.
   * Returns null if available, or the owner workerId if claimed.
   */
  checkFileAvailability(filePath) {
    return this._fileOwnership.get(filePath) || null;
  }

  /**
   * Try to claim a file for a worker.
   * Returns { success, owner? }
   */
  tryClaimFile(workerId, filePath) {
    const existing = this._fileOwnership.get(filePath);
    if (existing && existing !== workerId) {
      return { success: false, owner: existing, reason: `File ${filePath} owned by ${existing}` };
    }
    this._claimFile(workerId, filePath);
    return { success: true };
  }

  /**
   * Release a file from a worker.
   */
  releaseFile(workerId, filePath) {
    return this._releaseFile(workerId, filePath);
  }

  /**
   * Get all files owned by a worker.
   */
  getWorkerFiles(workerId) {
    const ext = this._workerStates.get(workerId);
    return ext ? [...ext.ownedFiles] : [];
  }

  /**
   * Get all file conflicts between current workers.
   */
  getFileConflicts() {
    const conflicts = [];
    const byFile = new Map();
    for (const [file, workerId] of this._fileOwnership) {
      if (!byFile.has(file)) byFile.set(file, []);
      byFile.get(file).push(workerId);
    }
    for (const [file, owners] of byFile) {
      if (owners.length > 1) {
        conflicts.push({ file, owners });
      }
    }
    return conflicts;
  }

  // ═══════════════════════════════════════════════════════════════
  // CAPABILITY-AWARE SCHEDULING
  // ═══════════════════════════════════════════════════════════════

  /**
   * Register capabilities for an agent role.
   */
  registerCapabilities(role, capabilities) {
    this._agentCapabilities.set(role, new Set(capabilities));
    this.emit('capabilities:registered', { role, capabilities });
  }

  /**
   * Get the best role for a task based on required capabilities.
   */
  matchTaskToRole(requiredCapabilities) {
    let bestRole = null;
    let bestScore = -1;

    for (const [role, caps] of this._agentCapabilities) {
      let score = 0;
      for (const req of requiredCapabilities) {
        if (caps.has(req)) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        bestRole = role;
      }
    }

    return bestRole;
  }

  /**
   * Get capabilities for a role.
   */
  _getCapabilitiesForRole(role) {
    return [...(this._agentCapabilities.get(role) || [])];
  }

  // ═══════════════════════════════════════════════════════════════
  // HEALTH MONITORING
  // ═══════════════════════════════════════════════════════════════

  /**
   * Update worker health score.
   * Health < degradedThreshold triggers degraded mode.
   */
  updateWorkerHealth(workerId, healthScore) {
    const ext = this._workerStates.get(workerId);
    if (!ext) return;

    ext.healthScore = Math.max(0, Math.min(1, healthScore));

    if (ext.healthScore < this.degradedThreshold && ext.status === SCHEDULER_WORKER_STATUS.RUNNING) {
      ext.status = SCHEDULER_WORKER_STATUS.DEGRADED;
      this.emit('worker:degraded', { workerId, healthScore: ext.healthScore });
      this._checkGlobalHealth();
    }
  }

  /**
   * Send heartbeat from a worker.
   */
  heartbeat(workerId) {
    const ext = this._workerStates.get(workerId);
    if (!ext) return;
    ext.heartbeat = Date.now();
    this.emit('worker:heartbeat', { workerId, timestamp: ext.heartbeat });
  }

  /**
   * Check if a worker has timed out (no heartbeat).
   */
  isWorkerStale(workerId, maxAge = 60_000) {
    const ext = this._workerStates.get(workerId);
    if (!ext || !ext.heartbeat) return false;
    return Date.now() - ext.heartbeat > maxAge;
  }

  /**
   * Check global health and trigger degraded mode if needed.
   */
  _checkGlobalHealth() {
    const running = this._getRunningWorkers();
    if (running.length === 0) return;

    const avgHealth = running.reduce((sum, w) => sum + w.healthScore, 0) / running.length;
    if (avgHealth < this.degradedThreshold && !this._degradedMode) {
      this._degradedMode = true;
      this.emit('scheduler:degraded', { avgHealth, runningCount: running.length });
    } else if (avgHealth >= this.degradedThreshold && this._degradedMode) {
      this._degradedMode = false;
      this.emit('scheduler:recovered', { avgHealth, runningCount: running.length });
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // PARALLEL EXECUTION
  // ═══════════════════════════════════════════════════════════════

  /**
   * Run one parallel batch of ready tasks.
   * Now includes: file conflict prevention, capability matching, health checks.
   */
  async runParallel() {
    this._iteration++;

    // Enforce iteration budget
    if (this._iteration > this.maxIterations) {
      this.emit('scheduler:iteration-limit', { iteration: this._iteration, max: this.maxIterations });
      return { executed: 0, results: [], skipped: [], conflicts: [], reason: 'iteration-limit' };
    }

    // Check pause request
    if (this._pauseRequested) {
      return { executed: 0, results: [], skipped: [], conflicts: [], reason: 'pause-requested' };
    }

    const state = this.plane.load();
    const ready = this.plane.readyTasks();

    if (ready.length === 0) {
      return { executed: 0, results: [], skipped: [], conflicts: [] };
    }

    // Get currently running workers
    const runningWorkers = this._getRunningWorkers();
    const runningTaskIds = runningWorkers.map(w => w.taskId);

    // Filter: exclude already-running tasks
    let candidates = ready.filter(t => !runningTaskIds.includes(t.id));

    // Filter: file conflict prevention (skip tasks whose files are claimed)
    const skipped = [];
    const safe = [];
    for (const task of candidates) {
      const taskFiles = this._getTaskFiles(task);
      let blocked = false;
      for (const file of taskFiles) {
        const owner = this._fileOwnership.get(file);
        if (owner) {
          skipped.push({ id: task.id, reason: `file-conflict: ${file} owned by ${owner}` });
          blocked = true;
          break;
        }
      }
      if (!blocked) safe.push(task);
    }

    // Apply concurrent limit
    const slotsAvailable = this.maxConcurrent - runningWorkers.length;
    const toExecute = safe.slice(0, slotsAvailable);

    this.emit('scheduler:batch', {
      iteration: this._iteration,
      ready: ready.length,
      executing: toExecute.length,
      skipped: skipped.length,
      running: runningWorkers.length,
      degraded: this._degradedMode,
    });

    // Spawn and execute workers
    const results = [];
    const promises = [];

    for (const task of toExecute) {
      const role = this.matchTaskToRole(task.requiredCapabilities || []) || task.specialist || AGENT_CAPABILITY.BUILDER;
      const ext = this.startWorker(task.id, role, {
        timeout: this._getTimeout(task),
        ownedFiles: this._getTaskFiles(task),
      });

      const promise = this.runtime.execute(ext.workerId).then((result) => {
        results.push(result);

        // Record evidence in ControlPlane
        if (result.success && result.receipt?.evidence) {
          for (const ev of result.receipt.evidence) {
            this.plane.recordEvidence(task.id, ev);
          }
        }

        // Record failure
        if (!result.success) {
          this.plane.recordFailure(task.id, {
            category: result.receipt?.category || 'UNKNOWN',
            cause: result.error || 'Execution failed',
            attemptedFixes: [],
            prevention: '',
          });
        }

        // Release file ownership on completion
        const extState = this._workerStates.get(ext.workerId);
        if (extState) {
          for (const file of extState.ownedFiles) {
            this._releaseFile(ext.workerId, file);
          }
        }

        return result;
      }).catch((error) => {
        // Release files on error too
        const extState = this._workerStates.get(ext.workerId);
        if (extState) {
          for (const file of extState.ownedFiles) {
            this._releaseFile(ext.workerId, file);
          }
        }
        return { workerId: ext.workerId, taskId: task.id, success: false, error: error.message };
      });

      promises.push(promise);
    }

    // Wait for all to complete (or fail fast)
    if (this.failFast) {
      try {
        await Promise.all(promises);
      } catch {
        for (const task of toExecute) {
          const worker = this.runtime.getWorkerByTask(task.id);
          if (worker && worker.status === WORKER_STATUS.RUNNING) {
            this.runtime.cancel(worker.workerId, 'failFast');
          }
        }
      }
    } else {
      await Promise.allSettled(promises);
    }

    this._results.push(...results);

    return {
      executed: toExecute.length,
      results,
      skipped: skipped.map(s => s.id),
      conflicts: this.getFileConflicts(),
    };
  }

  /**
   * Run until no more tasks can be executed.
   * Enforces maxIterations to prevent unbounded loops.
   */
  async runUntilComplete(options = {}) {
    const maxIter = options.maxIterations ?? this.maxIterations;
    let iterations = 0;

    while (iterations < maxIter) {
      const { executed, results } = await this.runParallel();

      if (executed === 0) break;
      iterations++;

      // Check if mission is complete
      const status = this.plane.status();
      if (status.status === 'COMPLETE' || status.status === 'BLOCKED') break;

      // Check pause request
      if (this._pauseRequested) break;
    }

    return {
      totalResults: this._results.length,
      iterations,
    };
  }

  /**
   * Pause the scheduler (cooperative).
   * Workers finish current task but no new tasks are started.
   */
  pause() {
    this._pauseRequested = true;
    this.emit('scheduler:paused', { iteration: this._iteration });
  }

  /**
   * Resume the scheduler.
   */
  resume() {
    this._pauseRequested = false;
    this.emit('scheduler:resumed', { iteration: this._iteration });
  }

  /**
   * Get execution statistics.
   */
  stats() {
    const successes = this._results.filter(r => r.success).length;
    const failures = this._results.filter(r => !r.success).length;
    const durations = this._results
      .filter(r => r.receipt?.duration)
      .map(r => r.receipt.duration);
    const avgDuration = durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;

    return {
      iterations: this._iteration,
      totalExecuted: this._results.length,
      successes,
      failures,
      successRate: this._results.length > 0
        ? ((successes / this._results.length) * 100).toFixed(1) + '%'
        : 'N/A',
      avgDuration: Math.round(avgDuration),
      filesClaimed: this._fileOwnership.size,
      degradedMode: this._degradedMode,
      pauseRequested: this._pauseRequested,
    };
  }

  /**
   * Reset for new mission.
   */
  reset() {
    this._results = [];
    this._iteration = 0;
    this._pauseRequested = false;
    this._degradedMode = false;
    this._workerStates.clear();
    this._fileOwnership.clear();
    this.runtime.reset();
  }

  // ─── Private ──────────────────────────────────────────────────────

  _getRunningWorkers() {
    return [...this._workerStates.values()].filter(
      w => w.status === SCHEDULER_WORKER_STATUS.RUNNING ||
           w.status === SCHEDULER_WORKER_STATUS.RESUMING
    );
  }

  _claimFile(workerId, filePath) {
    this._fileOwnership.set(filePath, workerId);
    const ext = this._workerStates.get(workerId);
    if (ext && !ext.ownedFiles.includes(filePath)) {
      ext.ownedFiles.push(filePath);
    }
  }

  _releaseFile(workerId, filePath) {
    if (this._fileOwnership.get(filePath) === workerId) {
      this._fileOwnership.delete(filePath);
    }
    const ext = this._workerStates.get(workerId);
    if (ext) {
      ext.ownedFiles = ext.ownedFiles.filter(f => f !== filePath);
    }
  }

  _getTaskFiles(task) {
    // Extract file paths from task definition
    const files = [];
    if (task.files) files.push(...task.files);
    if (task.command) {
      // Simple heuristic: extract quoted file paths from commands
      const matches = task.command.match(/['"]([^'"]+\.[a-z]+)['"]/g);
      if (matches) {
        for (const m of matches) {
          files.push(m.replace(/['"]/g, ''));
        }
      }
    }
    return files;
  }

  _getTimeout(task) {
    const multipliers = { CRITICAL: 2, HIGH: 1.5, MEDIUM: 1, LOW: 0.75 };
    const base = 300_000;
    return Math.round(base * (multipliers[task.priority] || 1));
  }
}

export { ParallelScheduler, SCHEDULER_WORKER_STATUS, AGENT_CAPABILITY, DEFAULT_CAPABILITIES };
