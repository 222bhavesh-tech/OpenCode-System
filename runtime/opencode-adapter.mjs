/**
 * OpenCodeAdapter — bridges ControlPlane tasks to OpenCode agent execution.
 *
 * Flow:
 *   ControlPlane → Scheduler → OpenCodeAdapter → OpenCode CLI → Agent → Tools → Repository
 *   → Result → OpenCodeAdapter → WorkerReceipt → ControlPlane
 *
 * The adapter does NOT execute model calls directly.
 * It assembles context, invokes OpenCode CLI, captures results, returns receipts.
 *
 * Usage:
 *   import { OpenCodeAdapter } from './opencode-adapter.mjs';
 *   const adapter = new OpenCodeAdapter(plane, { projectRoot: '/path/to/project' });
 *   const receipt = await adapter.executeTask('task-001');
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// ─── Agent role mapping ───────────────────────────────────────────────

const ROLE_TO_AGENT = {
  planner: 'plan',
  architect: 'plan',
  researcher: 'plan',
  'workspace-explorer': 'workspace',
  builder: 'build',
  frontend: 'build',
  backend: 'build',
  database: 'build',
  devops: 'build',
  tester: 'build',
  debugger: 'build',
  'security-reviewer': 'reviewer',
  'spec-reviewer': 'reviewer',
  'code-reviewer': 'reviewer',
  documentation: 'build',
  commander: 'commander',
};

// ─── Skill categories for auto-selection ──────────────────────────────

const ROLE_SKILLS = {
  frontend: ['frontend-patterns', 'frontend-design', 'react-expert', 'vue-expert'],
  backend: ['backend-patterns', 'api-design'],
  database: ['postgres-patterns', 'redis-patterns', 'database-optimizer'],
  devops: ['ci-pipeline', 'docker-patterns', 'deployment-patterns'],
  tester: ['tdd-workflow', 'code-review'],
  debugger: ['systematic-debugging', 'error-handling'],
  'security-reviewer': ['security-review', 'reviewing-security'],
  documentation: ['api-documentation', 'blog-workflow'],
  researcher: ['deep-research', 'context-engineering'],
};

export class OpenCodeAdapter {
  /**
   * @param {import('./control-plane.mjs').ControlPlane} plane
   * @param {object} options
   * @param {string} options.projectRoot — Path to the target project
   * @param {string} [options.opencodePath] — Path to opencode CLI (auto-detected)
   * @param {number} [options.defaultTimeout=300000] — Default execution timeout
   * @param {boolean} [options.dryRun=false] — If true, assemble context but don't invoke CLI
   */
  constructor(plane, options = {}) {
    this.plane = plane;
    this.projectRoot = options.projectRoot || plane.projectRoot;
    this.opencodePath = options.opencodePath || this._findOpenCode();
    this.defaultTimeout = options.defaultTimeout ?? 300_000;
    this.dryRun = options.dryRun ?? false;
  }

  /**
   * Execute a task through OpenCode.
   *
   * 1. Assemble task context
   * 2. Select agent role
   * 3. Activate relevant skills
   * 4. Invoke OpenCode CLI
   * 5. Capture result
   * 6. Return structured receipt
   *
   * @param {string} taskId
   * @param {object} [overrides] — { agent, command, timeout, prompt }
   * @returns {import('./worker.mjs').WorkerReceipt}
   */
  async executeTask(taskId, overrides = {}) {
    const startTime = Date.now();
    const state = this.plane.load();
    const task = state.tasks[taskId];
    if (!task) throw new Error(`Unknown task: ${taskId}`);

    // 1. Assemble context
    const context = this._assembleContext(task, state);

    // 2. Select agent
    const agentRole = overrides.agent || task.specialist || 'builder';
    const agentName = ROLE_TO_AGENT[agentRole] || 'build';

    // 3. Select skills
    const skills = this._selectSkills(agentRole);

    // 4. Build prompt
    const prompt = overrides.prompt || this._buildPrompt(task, context, agentRole);

    // 5. Execute (or dry-run)
    try {
      let result;
      if (this.dryRun) {
        result = {
          stdout: JSON.stringify({ dryRun: true, agent: agentName, task: task.id, prompt: prompt.slice(0, 500) }),
          stderr: '',
          exitCode: 0,
          duration: 0,
        };
      } else {
        result = await this._invokeOpenCode({
          agent: agentName,
          prompt,
          timeout: overrides.timeout ?? this.defaultTimeout,
        });
      }

      // 6. Build receipt
      return this._buildReceipt(task, context, agentName, skills, result, startTime);
    } catch (error) {
      return this._buildReceipt(task, context, agentName, skills, {
        stdout: '',
        stderr: error.message,
        exitCode: 1,
        duration: Date.now() - startTime,
      }, startTime, error);
    }
  }

  /**
   * Assemble context for a task without executing.
   * Useful for inspection or debugging.
   *
   * @param {string} taskId
   * @returns {{ task, context, agent, skills, prompt }}
   */
  inspect(taskId) {
    const state = this.plane.load();
    const task = state.tasks[taskId];
    if (!task) throw new Error(`Unknown task: ${taskId}`);

    const context = this._assembleContext(task, state);
    const agentRole = task.specialist || 'builder';
    const agentName = ROLE_TO_AGENT[agentRole] || 'build';
    const skills = this._selectSkills(agentRole);
    const prompt = this._buildPrompt(task, context, agentRole);

    return { task, context, agent: agentName, agentRole, skills, prompt };
  }

  /**
   * Cancel a running execution.
   * @param {string} executionId
   */
  async cancel(executionId) {
    // In a real implementation, this would kill the spawned process
    // For now, we record the cancellation intent
    return { executionId, cancelled: true, timestamp: new Date().toISOString() };
  }

  // ─── Context Assembly ──────────────────────────────────────────────

  _assembleContext(task, state) {
    const context = {
      taskId: task.id,
      title: task.title,
      description: task.description,
      acceptanceCriteria: task.acceptanceCriteria || [],
      dependencies: task.dependencies.map((dep) => ({
        id: dep,
        title: state.tasks[dep]?.title,
        status: state.tasks[dep]?.status,
        result: state.tasks[dep]?.result,
      })),
      previousFailures: state.failures
        .filter((f) => f.taskId === task.id)
        .map((f) => ({ category: f.category, cause: f.cause, attemptedFixes: f.attemptedFixes })),
      evidence: state.evidence
        .filter((e) => e.taskId === task.id)
        .map((e) => ({ type: e.type, verdict: e.verdict, summary: e.summary })),
      projectGoal: state.goal,
      projectMode: state.mode,
    };

    // Add relevant files if they exist
    const relevantFiles = this._findRelevantFiles(task);
    if (relevantFiles.length > 0) {
      context.relevantFiles = relevantFiles;
    }

    return context;
  }

  _findRelevantFiles(task) {
    const files = [];
    const searchPaths = [
      task.title?.toLowerCase(),
      task.description?.toLowerCase(),
      ...(task.acceptanceCriteria || []),
    ].filter(Boolean);

    // Simple heuristic: look for files mentioned in task text
    for (const text of searchPaths) {
      const matches = text.match(/[\w/-]+\.(m?js|ts|tsx|jsx|json|md|py|go|rs)/g);
      if (matches) {
        for (const match of matches) {
          const fullPath = path.join(this.projectRoot, match);
          if (fs.existsSync(fullPath) && !files.includes(match)) {
            files.push(match);
          }
        }
      }
    }

    return files.slice(0, 10); // Cap at 10 files
  }

  // ─── Agent & Skill Selection ──────────────────────────────────────

  _selectSkills(agentRole) {
    const base = ['superpowers', 'agent-task-workflow'];
    const roleSpecific = ROLE_SKILLS[agentRole] || [];
    return [...base, ...roleSpecific];
  }

  // ─── Prompt Construction ──────────────────────────────────────────

  _buildPrompt(task, context, agentRole) {
    const lines = [];

    // Mission context
    lines.push(`# Mission: ${context.projectGoal}`);
    lines.push(`Mode: ${context.projectMode}`);
    lines.push('');

    // Task specification
    lines.push(`## Current Task: ${task.title}`);
    lines.push(`ID: ${task.id}`);
    lines.push(`Specialist: ${agentRole}`);
    lines.push('');
    lines.push(`Description: ${task.description || 'No description provided.'}`);
    lines.push('');

    // Acceptance criteria
    if (context.acceptanceCriteria.length > 0) {
      lines.push('## Acceptance Criteria');
      for (const criterion of context.acceptanceCriteria) {
        lines.push(`- ${criterion}`);
      }
      lines.push('');
    }

    // Dependencies context
    if (context.dependencies.length > 0) {
      lines.push('## Completed Dependencies');
      for (const dep of context.dependencies) {
        lines.push(`- ${dep.title} (${dep.status})`);
      }
      lines.push('');
    }

    // Previous failures
    if (context.previousFailures.length > 0) {
      lines.push('## Previous Failures (avoid these)');
      for (const failure of context.previousFailures) {
        lines.push(`- Category: ${failure.category}, Cause: ${failure.cause}`);
        if (failure.attemptedFixes.length > 0) {
          lines.push(`  Attempted: ${failure.attemptedFixes.join(', ')}`);
        }
      }
      lines.push('');
    }

    // Relevant files
    if (context.relevantFiles?.length > 0) {
      lines.push('## Relevant Files');
      for (const file of context.relevantFiles) {
        lines.push(`- ${file}`);
      }
      lines.push('');
    }

    // Instructions
    lines.push('## Instructions');
    lines.push('Implement this task. Return your result as structured output.');
    lines.push('If you encounter errors, classify them and suggest fixes.');

    return lines.join('\n');
  }

  // ─── OpenCode CLI Invocation ──────────────────────────────────────

  async _invokeOpenCode({ agent, prompt, timeout }) {
    return new Promise((resolve, reject) => {
      const start = Date.now();

      // Build the opencode command
      // On Windows: powershell -Command "opencode ..."
      // On Unix: /bin/sh -c "opencode ..."
      const args = [
        '--agent', agent,
        '--message', prompt,
        '--non-interactive',
      ];

      const shell = process.platform === 'win32' ? 'powershell.exe' : '/bin/sh';
      const flag = process.platform === 'win32' ? '-Command' : '-c';
      const fullCommand = `"${this.opencodePath}" ${args.map((a) => `"${a}"`).join(' ')}`;

      const child = spawn(shell, [flag, fullCommand], {
        cwd: this.projectRoot,
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
          stdout: stdout.slice(-50_000), // Cap output
          stderr: stderr.slice(-10_000),
          exitCode: exitCode ?? 1,
          duration: Date.now() - start,
        });
      });

      child.on('error', (error) => {
        reject(error);
      });
    });
  }

  // ─── Receipt Building ─────────────────────────────────────────────

  _buildReceipt(task, context, agent, skills, result, startTime, error = null) {
    const duration = Date.now() - startTime;
    const success = result.exitCode === 0 && !error;

    return {
      taskId: task.id,
      taskTitle: task.title,
      agent,
      agentRole: task.specialist || 'builder',
      skills,
      success,
      exitCode: result.exitCode,
      stdout: result.stdout?.slice(-5000) || '',
      stderr: result.stderr?.slice(-2000) || '',
      duration,
      timestamp: new Date().toISOString(),
      error: error?.message || null,
      context: {
        projectGoal: context.projectGoal,
        acceptanceCriteria: context.acceptanceCriteria,
        previousFailures: context.previousFailures.length,
      },
    };
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  _findOpenCode() {
    // Common locations for opencode CLI
    const candidates = process.platform === 'win32'
      ? [
          path.join(process.env.APPDATA || '', 'npm', 'opencode.ps1'),
          path.join(process.env.APPDATA || '', 'npm', 'opencode.cmd'),
          'opencode',
        ]
      : ['/usr/local/bin/opencode', '/usr/bin/opencode', 'opencode'];

    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) return candidate;
      } catch { /* ignore */ }
    }

    return 'opencode'; // Fallback to PATH
  }
}
