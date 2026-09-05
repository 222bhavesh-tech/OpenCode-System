/**
 * WorkerAdapter — executes tasks from the ControlPlane.
 *
 * Each task type routes to an executor:
 *   shell  → spawns a child process (cmd /bin/sh -c)
 *   file   → reads/writes project files
 *   test   → runs test command and parses output
 *   manual → records a placeholder for human action
 *
 * Adapters must (per CONTROL-PLANE-CONTRACT.md):
 *   1. Read project state before work.
 *   2. Register start/observation/result/failure events.
 *   3. Store inspectable evidence before requesting task completion.
 *   4. Respect task status, retries, and budgets.
 *   5. Remain cancellable.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// ─── Executor interface ────────────────────────────────────────────────
// Every executor implements: async execute(task, projectRoot) → { result, evidence[] }

class ShellExecutor {
  async execute(task, projectRoot) {
    const command = task.command || task.description;
    if (!command) throw new Error('Shell task requires a command or description');

    const result = await runCommand(command, {
      cwd: projectRoot,
      timeout: task.timeout ?? 120_000,
    });

    return {
      result: {
        command,
        exitCode: result.exitCode,
        stdout: result.stdout.slice(-10_000),   // keep last 10 KB
        stderr: result.stderr.slice(-10_000),
        duration: result.duration,
      },
      evidence: [{
        type: 'test',
        summary: result.exitCode === 0
          ? `Command succeeded: ${command}`
          : `Command failed (exit ${result.exitCode}): ${command}`,
        location: '',
        verdict: result.exitCode === 0 ? 'PASS' : 'FAIL',
      }],
    };
  }
}

class FileExecutor {
  async execute(task, projectRoot) {
    const filePath = path.resolve(projectRoot, task.path || '');
    const content = task.content || '';

    if (!fs.existsSync(path.dirname(filePath))) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
    }
    fs.writeFileSync(filePath, content, 'utf8');

    return {
      result: { path: filePath, written: content.length },
      evidence: [{
        type: 'build',
        summary: `File written: ${task.path} (${content.length} bytes)`,
        location: filePath,
        verdict: 'PASS',
      }],
    };
  }
}

class TestExecutor {
  async execute(task, projectRoot) {
    const command = task.command || 'node --test';
    const result = await runCommand(command, {
      cwd: projectRoot,
      timeout: task.timeout ?? 180_000,
    });

    const passed = result.exitCode === 0 && !result.stdout.includes('FAIL');
    return {
      result: {
        command,
        exitCode: result.exitCode,
        output: result.stdout.slice(-20_000),
        duration: result.duration,
      },
      evidence: [{
        type: 'test',
        summary: passed
          ? `Tests passed: ${command}`
          : `Tests failed (exit ${result.exitCode})`,
        location: '',
        verdict: passed ? 'PASS' : 'FAIL',
      }],
    };
  }
}

class ManualExecutor {
  async execute(task) {
    return {
      result: { status: 'AWAITING_HUMAN', message: task.description || 'Manual task' },
      evidence: [{
        type: 'review',
        summary: `Manual task pending: ${task.title}`,
        location: '',
        verdict: 'PENDING',
      }],
    };
  }
}

const EXECUTORS = {
  shell: new ShellExecutor(),
  file: new FileExecutor(),
  test: new TestExecutor(),
  manual: new ManualExecutor(),
};

// ─── WorkerAdapter ────────────────────────────────────────────────────

export class WorkerAdapter {
  /**
   * @param {import('./control-plane.mjs').ControlPlane} plane
   * @param {object} [options]
   * @param {number} [options.timeout=300000]   Default per-task timeout (ms)
   * @param {number} [options.maxConcurrent=1]   Reserved for future parallelism
   */
  constructor(plane, options = {}) {
    this.plane = plane;
    this.timeout = options.timeout ?? 300_000;
    this.maxConcurrent = options.maxConcurrent ?? 1;
  }

  /**
   * Execute a single task end-to-end.
   *
   * 1. Start the task in the control plane (validates deps + status).
   * 2. Run the appropriate executor.
   * 3. Record evidence.
   * 4. Complete or fail the task.
   *
   * @param {string} taskId
   * @param {object} [overrides]  e.g. { command: 'npm test', timeout: 60000 }
   * @returns {{ taskId, success, result, evidence }}
   */
  async execute(taskId, overrides = {}) {
    const task = this.plane.startTask(taskId, overrides.agent || 'worker');

    const taskData = this.plane.load().tasks[taskId];
    const kind = overrides.kind || taskData.kind || 'shell';
    const executor = EXECUTORS[kind] || EXECUTORS.shell;

    const mergedTask = { ...taskData, ...overrides };
    const projectRoot = this.plane.projectRoot;

    try {
      const { result, evidence } = await Promise.race([
        executor.execute(mergedTask, projectRoot),
        timeoutAfter(overrides.timeout ?? this.timeout, `Task ${taskId} timed out`),
      ]);

      // Record all evidence
      for (const item of evidence) {
        this.plane.recordEvidence(taskId, item);
      }

      // If any evidence has FAIL verdict, fail the task (don't complete)
      const hasFailure = evidence.some((item) => item.verdict === 'FAIL');
      if (hasFailure) {
        const failEvidence = evidence.find((item) => item.verdict === 'FAIL');
        return this._handleFailure(taskId, new Error(failEvidence?.summary || 'Task produced failing evidence'));
      }

      // Attempt completion — may throw if required evidence is still missing
      this.plane.completeTask(taskId, { result });

      return { taskId, success: true, result, evidence };
    } catch (error) {
      return this._handleFailure(taskId, error);
    }
  }

  /**
   * Execute a task without updating the control plane.
   * Useful for dry runs or testing executors in isolation.
   */
  async preview(task, projectRoot) {
    const kind = task.kind || 'shell';
    const executor = EXECUTORS[kind] || EXECUTORS.shell;
    return executor.execute(task, projectRoot || this.plane.projectRoot);
  }

  /** List available executor kinds. */
  get kinds() {
    return Object.keys(EXECUTORS);
  }

  // ─── Private ──────────────────────────────────────────────────────

  async _handleFailure(taskId, error) {
    const category = classifyError(error);
    const { task, failure } = this.plane.failTask(taskId, {
      category,
      cause: error.message,
      attemptedFixes: [],
      prevention: '',
    });

    return {
      taskId,
      success: false,
      error: error.message,
      category,
      failure,
      willRetry: task.status === 'PENDING',
      attempts: task.attempts,
    };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────

function runCommand(command, { cwd, timeout = 120_000 } = {}) {
  return new Promise((resolve) => {
    const start = Date.now();
    // Use PowerShell on Windows
    const shell = process.platform === 'win32' ? 'powershell.exe' : '/bin/sh';
    const flag = process.platform === 'win32' ? '-Command' : '-c';

    const child = spawn(shell, [flag, command], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout,
      env: { ...process.env, NODE_NO_WARNINGS: '1' },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data; });
    child.stderr.on('data', (data) => { stderr += data; });

    child.on('close', (exitCode) => {
      resolve({
        exitCode: exitCode ?? 1,
        stdout,
        stderr,
        duration: Date.now() - start,
      });
    });

    child.on('error', (error) => {
      resolve({
        exitCode: 1,
        stdout,
        stderr: stderr + '\n' + error.message,
        duration: Date.now() - start,
      });
    });
  });
}

function timeoutAfter(ms, message) {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

function classifyError(error) {
  const msg = error.message?.toLowerCase() || '';
  if (msg.includes('timeout') || msg.includes('timed out')) return 'TIMEOUT';
  if (msg.includes('enoent') || msg.includes('not found')) return 'DEPENDENCY';
  if (msg.includes('econnrefused') || msg.includes('network')) return 'NETWORK';
  if (msg.includes('permission') || msg.includes('eacces')) return 'SECURITY';
  if (msg.includes('syntax') || msg.includes('type')) return 'CODE';
  if (msg.includes('test') || msg.includes('assert')) return 'TEST';
  return 'UNKNOWN';
}
