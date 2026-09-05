/**
 * Hooks — executable lifecycle hook system.
 *
 * Unlike agents/hooks.md (which is documentation), this module provides
 * actual executable hook functions that run on system events.
 *
 * Inspired by opencode-agent-kit's ponytail hooks (activate, config, instructions, mode-tracker, runtime).
 *
 * Hook points:
 *   - session:start     — When a session begins
 *   - session:end       — When a session ends
 *   - task:before       — Before a task is executed
 *   - task:after        — After a task completes
 *   - task:fail         — When a task fails
 *   - evidence:recorded — When evidence is recorded
 *   - checkpoint:saved  — When a checkpoint is saved
 *
 * Each hook is a function: async (context) => context
 * Hooks can modify the context (before hooks) or observe it (after hooks).
 * Before hooks can return false to cancel the action.
 */

import fs from 'node:fs';
import path from 'node:path';

export class HookRegistry {
  /**
   * @param {string} projectRoot
   */
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.hooks = new Map(); // event → [{ name, handler, priority, once }]
    this._executed = new Set(); // Track one-shot hooks
  }

  /**
   * Register a hook.
   *
   * @param {string} event — Hook point name
   * @param {string} name — Hook name (for identification)
   * @param {Function} handler — async (context) => context | false
   * @param {object} [options]
   * @param {number} [options.priority=0] — Higher = runs first
   * @param {boolean} [options.once=false] — Run only once per session
   */
  register(event, name, handler, options = {}) {
    if (!this.hooks.has(event)) {
      this.hooks.set(event, []);
    }
    this.hooks.get(event).push({
      name,
      handler,
      priority: options.priority ?? 0,
      once: options.once ?? false,
    });
    // Sort by priority (highest first)
    this.hooks.get(event).sort((a, b) => b.priority - a.priority);
  }

  /**
   * Unregister a hook.
   *
   * @param {string} event
   * @param {string} name
   */
  unregister(event, name) {
    const hooks = this.hooks.get(event);
    if (!hooks) return;
    this.hooks.set(event, hooks.filter((h) => h.name !== name));
  }

  /**
   * Execute all hooks for an event (before hooks).
   * If any hook returns false, the action is cancelled.
   *
   * @param {string} event
   * @param {object} context
   * @returns {{ ok: boolean, context, results: Array<{ name, result }> }}
   */
  async execute(event, context = {}) {
    const hooks = this.hooks.get(event) || [];
    const results = [];
    let currentContext = { ...context };

    for (const hook of hooks) {
      // Skip one-shot hooks that already ran
      if (hook.once && this._executed.has(`${event}:${hook.name}`)) {
        continue;
      }

      try {
        const result = await hook.handler(currentContext);

        if (result === false) {
          results.push({ name: hook.name, result: 'CANCELLED' });
          return { ok: false, context: currentContext, results, cancelledBy: hook.name };
        }

        // If handler returns an object, merge it into context
        if (result && typeof result === 'object') {
          currentContext = { ...currentContext, ...result };
        }

        results.push({ name: hook.name, result: 'OK' });

        if (hook.once) {
          this._executed.add(`${event}:${hook.name}`);
        }
      } catch (error) {
        results.push({ name: hook.name, result: 'ERROR', error: error.message });
        // Continue executing other hooks — don't let one failure stop all
      }
    }

    return { ok: true, context: currentContext, results };
  }

  /**
   * Execute observation hooks (after events).
   * These don't modify context or cancel actions.
   *
   * @param {string} event
   * @param {object} context
   */
  async observe(event, context = {}) {
    const hooks = this.hooks.get(event) || [];

    for (const hook of hooks) {
      if (hook.once && this._executed.has(`${event}:${hook.name}`)) {
        continue;
      }

      try {
        await hook.handler(context);
        if (hook.once) {
          this._executed.add(`${event}:${hook.name}`);
        }
      } catch {
        // Observation hooks should not throw
      }
    }
  }

  /**
   * List all registered hooks.
   *
   * @returns {object} event → hook names
   */
  list() {
    const result = {};
    for (const [event, hooks] of this.hooks) {
      result[event] = hooks.map((h) => ({ name: h.name, priority: h.priority, once: h.once }));
    }
    return result;
  }

  /**
   * Clear all hooks.
   */
  clear() {
    this.hooks.clear();
    this._executed.clear();
  }

  /**
   * Clear execution tracking (for new session).
   */
  resetExecutions() {
    this._executed.clear();
  }
}

// ─── Built-in Hooks ──────────────────────────────────────────────

/**
 * Session start hook — loads memory and sets up context.
 */
export function sessionStartHook(projectRoot) {
  return async (context) => {
    const memoryFile = path.join(projectRoot, '.opencode-system', 'memory.json');
    let memory = [];
    if (fs.existsSync(memoryFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(memoryFile, 'utf8'));
        memory = (data.entries || []).slice(-50); // Last 50 entries
      } catch { /* ignore */ }
    }
    return { ...context, memory, sessionStart: new Date().toISOString() };
  };
}

/**
 * Task before hook — validates task and adds context.
 */
export function taskBeforeHook() {
  return async (context) => {
    const { task } = context;
    if (!task) return context;

    // Add timestamp
    return { ...context, taskStartedAt: new Date().toISOString() };
  };
}

/**
 * Task after hook — records completion metrics.
 */
export function taskAfterHook() {
  return async (context) => {
    const { task, result } = context;
    if (!task || !result) return context;

    return {
      ...context,
      taskCompletedAt: new Date().toISOString(),
      taskSuccess: result.success,
    };
  };
}

/**
 * Task fail hook — logs failure for learning.
 */
export function taskFailHook(projectRoot) {
  return async (context) => {
    const { task, error, category } = context;

    // Log failure to memory
    const memoryFile = path.join(projectRoot, '.opencode-system', 'memory.json');
    try {
      let data = { entries: [], version: 1 };
      if (fs.existsSync(memoryFile)) {
        data = JSON.parse(fs.readFileSync(memoryFile, 'utf8'));
      }
      data.entries.push({
        id: `fail_${Date.now().toString(36)}`,
        category: 'failure',
        content: `Task "${task?.title || 'unknown'}" failed: ${error?.message || 'unknown error'} (category: ${category || 'UNKNOWN'})`,
        meta: { taskId: task?.id, category },
        timestamp: new Date().toISOString(),
      });
      fs.writeFileSync(memoryFile, JSON.stringify(data, null, 2), 'utf8');
    } catch { /* don't fail the hook chain */ }

    return context;
  };
}

/**
 * Evidence recorded hook — validates evidence.
 */
export function evidenceRecordedHook() {
  return async (context) => {
    const { evidence } = context;
    if (!evidence) return context;

    // Ensure evidence has required fields
    if (!evidence.type || !evidence.summary) {
      return { ...context, evidenceValid: false };
    }

    return { ...context, evidenceValid: true };
  };
}

/**
 * Install default hooks on a registry.
 *
 * @param {HookRegistry} registry
 * @param {string} projectRoot
 */
export function installDefaultHooks(registry, projectRoot) {
  registry.register('session:start', 'memory-loader', sessionStartHook(projectRoot), { priority: 10 });
  registry.register('task:before', 'task-validator', taskBeforeHook(), { priority: 5 });
  registry.register('task:after', 'task-metrics', taskAfterHook(), { priority: 5 });
  registry.register('task:fail', 'failure-logger', taskFailHook(projectRoot), { priority: 5 });
  registry.register('evidence:recorded', 'evidence-validator', evidenceRecordedHook(), { priority: 5 });
}
