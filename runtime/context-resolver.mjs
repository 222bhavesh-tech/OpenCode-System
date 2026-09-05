/**
 * ContextResolver — assembles minimal, task-specific context.
 *
 * Do NOT inject the entire repository into every worker.
 * Assemble only what the task needs:
 *   - Task details
 *   - Acceptance criteria
 *   - Relevant files (by name heuristic)
 *   - Dependencies and their results
 *   - Previous failures for this task
 *   - Relevant evidence
 *   - Project conventions
 *   - Previous decisions
 *
 * Usage:
 *   import { ContextResolver } from './context-resolver.mjs';
 *   const resolver = new ContextResolver(plane);
 *   const context = resolver.resolve('task-001');
 */

import fs from 'node:fs';
import path from 'node:path';

export class ContextResolver {
  /**
   * @param {import('./control-plane.mjs').ControlPlane} plane
   * @param {object} [options]
   * @param {number} [options.maxFiles=10] — Max relevant files to include
   * @param {number} [options.maxFailures=5] — Max past failures to include
   * @param {number} [options.maxContextTokens=50000] — Approximate token budget
   */
  constructor(plane, options = {}) {
    this.plane = plane;
    this.projectRoot = plane.projectRoot;
    this.maxFiles = options.maxFiles ?? 10;
    this.maxFailures = options.maxFailures ?? 5;
    this.maxContextTokens = options.maxContextTokens ?? 50_000;
  }

  /**
   * Resolve context for a specific task.
   *
   * @param {string} taskId
   * @returns {{ task, files, dependencies, failures, evidence, conventions, decisions, summary }}
   */
  resolve(taskId) {
    const state = this.plane.load();
    const task = state.tasks[taskId];
    if (!task) throw new Error(`Unknown task: ${taskId}`);

    const context = {
      task: this._resolveTask(task),
      files: this._resolveFiles(task),
      dependencies: this._resolveDependencies(task, state),
      failures: this._resolveFailures(taskId, state),
      evidence: this._resolveEvidence(taskId, state),
      conventions: this._resolveConventions(),
      decisions: this._resolveDecisions(state),
      projectGoal: state.goal,
      projectMode: state.mode,
    };

    context.summary = this._buildSummary(context);

    return context;
  }

  /**
   * Resolve context for multiple tasks (for parallel execution).
   *
   * @param {string[]} taskIds
   * @returns {Map<string, object>}
   */
  resolveMany(taskIds) {
    const contexts = new Map();
    for (const taskId of taskIds) {
      contexts.set(taskId, this.resolve(taskId));
    }
    return contexts;
  }

  /**
   * Check for file ownership conflicts between tasks.
   *
   * @param {string[]} taskIds
   * @returns {{ conflicts: Array<{ file, tasks }>, safe: string[] }}
   */
  detectConflicts(taskIds) {
    const fileOwnership = new Map(); // file → taskId[]
    const conflicts = [];

    for (const taskId of taskIds) {
      const context = this.resolve(taskId);
      for (const file of context.files) {
        if (!fileOwnership.has(file)) {
          fileOwnership.set(file, []);
        }
        fileOwnership.get(file).push(taskId);
      }
    }

    for (const [file, tasks] of fileOwnership) {
      if (tasks.length > 1) {
        conflicts.push({ file, tasks });
      }
    }

    const safe = taskIds.filter(
      (id) => !conflicts.some((c) => c.tasks.includes(id))
    );

    return { conflicts, safe };
  }

  // ─── Private Resolvers ────────────────────────────────────────────

  _resolveTask(task) {
    return {
      id: task.id,
      title: task.title,
      description: task.description,
      specialist: task.specialist,
      priority: task.priority,
      status: task.status,
      attempts: task.attempts,
      acceptanceCriteria: task.acceptanceCriteria || [],
      requiredEvidence: task.requiredEvidence || [],
      kind: task.kind || 'shell',
      command: task.command || null,
    };
  }

  _resolveFiles(task) {
    const files = new Set();

    // 1. Files mentioned in task text
    const text = `${task.title} ${task.description} ${(task.acceptanceCriteria || []).join(' ')}`;
    const mentioned = text.match(/[\w/.-]+\.(m?js|ts|tsx|jsx|json|md|py|go|rs|css|html)/g) || [];
    for (const match of mentioned) {
      const full = path.join(this.projectRoot, match);
      if (fs.existsSync(full)) files.add(match);
    }

    // 2. Files in runtime/ directory (always relevant)
    const runtimeDir = path.join(this.projectRoot, 'runtime');
    if (fs.existsSync(runtimeDir)) {
      for (const file of fs.readdirSync(runtimeDir)) {
        if (file.endsWith('.mjs') || file.endsWith('.js')) {
          files.add(`runtime/${file}`);
        }
      }
    }

    // 3. Test files (if task is test-related)
    if (task.specialist === 'tester' || task.kind === 'test') {
      const testDir = path.join(this.projectRoot, 'test');
      if (fs.existsSync(testDir)) {
        for (const file of fs.readdirSync(testDir)) {
          if (file.endsWith('.test.mjs') || file.endsWith('.test.js')) {
            files.add(`test/${file}`);
          }
        }
      }
    }

    return [...files].slice(0, this.maxFiles);
  }

  _resolveDependencies(task, state) {
    return task.dependencies.map((depId) => {
      const dep = state.tasks[depId];
      if (!dep) return { id: depId, status: 'UNKNOWN' };
      return {
        id: dep.id,
        title: dep.title,
        status: dep.status,
        result: dep.result ? JSON.stringify(dep.result).slice(0, 500) : null,
      };
    });
  }

  _resolveFailures(taskId, state) {
    return state.failures
      .filter((f) => f.taskId === taskId)
      .slice(-this.maxFailures)
      .map((f) => ({
        category: f.category,
        cause: f.cause,
        attemptedFixes: f.attemptedFixes,
        prevention: f.prevention,
        timestamp: f.createdAt,
      }));
  }

  _resolveEvidence(taskId, state) {
    return state.evidence
      .filter((e) => e.taskId === taskId)
      .map((e) => ({
        type: e.type,
        verdict: e.verdict,
        summary: e.summary,
        timestamp: e.createdAt,
      }));
  }

  _resolveConventions() {
    const conventions = [];

    // Read AGENTS.md if it exists
    const agentsMd = path.join(this.projectRoot, 'AGENTS.md');
    if (fs.existsSync(agentsMd)) {
      try {
        const content = fs.readFileSync(agentsMd, 'utf8');
        // Extract key conventions (first 2000 chars as summary)
        conventions.push({ source: 'AGENTS.md', content: content.slice(0, 2000) });
      } catch { /* ignore */ }
    }

    // Read rules.md if it exists
    const rulesMd = path.join(this.projectRoot, 'rules.md');
    if (fs.existsSync(rulesMd)) {
      try {
        const content = fs.readFileSync(rulesMd, 'utf8');
        conventions.push({ source: 'rules.md', content: content.slice(0, 2000) });
      } catch { /* ignore */ }
    }

    return conventions;
  }

  _resolveDecisions(state) {
    return (state.decisions || []).slice(-10).map((d) => ({
      type: d.type,
      summary: d.summary,
      timestamp: d.timestamp,
    }));
  }

  _buildSummary(context) {
    const lines = [];
    lines.push(`Task: ${context.task.title} (${context.task.id})`);
    lines.push(`Specialist: ${context.task.specialist}`);
    lines.push(`Priority: ${context.task.priority}`);
    lines.push(`Status: ${context.task.status} (attempt ${context.task.attempts})`);
    if (context.files.length > 0) lines.push(`Files: ${context.files.join(', ')}`);
    if (context.dependencies.length > 0) lines.push(`Dependencies: ${context.dependencies.map((d) => `${d.id}(${d.status})`).join(', ')}`);
    if (context.failures.length > 0) lines.push(`Past failures: ${context.failures.length}`);
    return lines.join('\n');
  }
}
