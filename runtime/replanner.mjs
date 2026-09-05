/**
 * Replanner — dynamic DAG mutation when assumptions change.
 *
 * The original task DAG is NOT immutable. The Replanner can:
 *   - Add tasks
 *   - Remove tasks
 *   - Split tasks
 *   - Merge tasks
 *   - Change dependencies
 *   - Change priority
 *   - Change specialist
 *   - Invalidate stale work
 *   - Create recovery tasks
 *   - Update acceptance criteria
 *
 * All mutations pass ControlPlane validation (cycle detection, unknown deps).
 *
 * Usage:
 *   import { Replanner } from './replanner.mjs';
 *   const replanner = new Replanner(plane);
 *   replanner.addTask({ id: 'fix-arch', title: 'Fix architecture', dependencies: ['B'] });
 *   replanner.removeTask('C');
 *   replanner.changeDependency('D', 'C', 'fix-arch');
 */

import { EventEmitter } from 'node:events';
import fs from 'node:fs';

export class Replanner extends EventEmitter {
  /**
   * @param {import('./control-plane.mjs').ControlPlane} plane
   */
  constructor(plane) {
    super();
    this.plane = plane;
    this._mutations = [];
  }

  /**
   * Add a new task to the DAG.
   *
   * @param {object} taskSpec — Full task specification (id, title, dependencies, etc.)
   * @returns {{ taskId, mutation }}
   */
  addTask(taskSpec) {
    const task = this.plane.addTask(taskSpec);
    const mutation = { type: 'ADD_TASK', taskId: task.id, spec: taskSpec, timestamp: new Date().toISOString() };
    this._mutations.push(mutation);
    this.emit('replanner:mutation', mutation);
    return { taskId: task.id, mutation };
  }

  /**
   * Remove a task from the DAG.
   * Fails if the task has dependents that are not also being removed.
   *
   * @param {string} taskId
   * @returns {{ mutation }}
   */
  removeTask(taskId) {
    const state = this.plane.load();
    const task = state.tasks[taskId];
    if (!task) throw new Error(`Unknown task: ${taskId}`);

    // Check for dependents
    const dependents = Object.values(state.tasks).filter(
      (t) => t.dependencies.includes(taskId) && t.id !== taskId
    );

    if (dependents.length > 0) {
      throw new Error(`Cannot remove ${taskId}: dependent tasks [${dependents.map((t) => t.id).join(', ')}] exist. Remove dependents first or change their dependencies.`);
    }

    // Remove from state
    delete state.tasks[taskId];

    // Remove any evidence/failures for this task
    state.evidence = state.evidence.filter((e) => e.taskId !== taskId);
    state.failures = state.failures.filter((f) => f.taskId !== taskId);

    this._event(state, 'task.removed', { taskId });
    this._save(state);

    const mutation = { type: 'REMOVE_TASK', taskId, timestamp: new Date().toISOString() };
    this._mutations.push(mutation);
    this.emit('replanner:mutation', mutation);
    return { mutation };
  }

  /**
   * Split a task into multiple subtasks.
   *
   * @param {string} taskId — Task to split
   * @param {Array<object>} subtasks — New tasks to create
   * @returns {{ removed, added, mutation }}
   */
  splitTask(taskId, subtasks) {
    const state = this.plane.load();
    const task = state.tasks[taskId];
    if (!task) throw new Error(`Unknown task: ${taskId}`);

    // Find dependents of the original task
    const dependents = Object.values(state.tasks).filter(
      (t) => t.dependencies.includes(taskId) && t.id !== taskId
    );

    // Remove original task
    this.removeTask(taskId);

    // Create subtasks
    const created = [];
    for (const subtask of subtasks) {
      const newTask = this.plane.addTask({
        ...subtask,
        dependencies: subtask.dependencies || [],
        specialist: subtask.specialist || task.specialist,
        requiredEvidence: subtask.requiredEvidence || task.requiredEvidence,
      });
      created.push(newTask);
    }

    // Re-link dependents to last subtask
    const lastSubtask = created[created.length - 1];
    for (const dependent of dependents) {
      this.changeDependency(dependent.id, taskId, lastSubtask.id);
    }

    const mutation = {
      type: 'SPLIT_TASK',
      originalTaskId: taskId,
      createdTaskIds: created.map((t) => t.id),
      timestamp: new Date().toISOString(),
    };
    this._mutations.push(mutation);
    this.emit('replanner:mutation', mutation);
    return { removed: taskId, added: created.map((t) => t.id), mutation };
  }

  /**
   * Merge multiple tasks into one.
   *
   * @param {string[]} taskIds — Tasks to merge (in order)
   * @param {object} mergedSpec — Specification for the merged task
   * @returns {{ removed, added, mutation }}
   */
  mergeTasks(taskIds, mergedSpec) {
    const state = this.plane.load();

    // Validate all tasks exist
    for (const tid of taskIds) {
      if (!state.tasks[tid]) throw new Error(`Unknown task: ${tid}`);
    }

    // Collect all dependencies from merged tasks (excluding the tasks themselves)
    const allDeps = new Set();
    for (const tid of taskIds) {
      for (const dep of state.tasks[tid].dependencies) {
        if (!taskIds.includes(dep)) allDeps.add(dep);
      }
    }

    // Find dependents (tasks that depend on any of the merged tasks, but are NOT being merged)
    const dependents = Object.values(state.tasks).filter(
      (t) => !taskIds.includes(t.id) && t.dependencies.some((d) => taskIds.includes(d))
    );

    // Remove external dependents directly (bypass removeTask since we'll re-add them)
    for (const dep of dependents) {
      const t = state.tasks[dep.id];
      if (!t) continue;
      delete state.tasks[dep.id];
      state.evidence = state.evidence.filter((e) => e.taskId !== dep.id);
      state.failures = state.failures.filter((f) => f.taskId !== dep.id);
    }
    // Remove merged tasks directly from state (bypass removeTask's dependent check
    // since all dependents are also being removed or re-added)
    for (const tid of taskIds) {
      const t = state.tasks[tid];
      if (!t) continue;
      delete state.tasks[tid];
      state.evidence = state.evidence.filter((e) => e.taskId !== tid);
      state.failures = state.failures.filter((f) => f.taskId !== tid);
    }
    this._event(state, 'tasks.merged', { taskIds });
    this._save(state);

    // Create merged task
    const merged = this.plane.addTask({
      ...mergedSpec,
      dependencies: [...allDeps],
    });

    // Re-add dependents with updated dependencies
    for (const dep of dependents) {
      const originalSpec = dep;
      const newDeps = originalSpec.dependencies.filter((d) => !taskIds.includes(d));
      newDeps.push(merged.id);
      this.plane.addTask({
        id: originalSpec.id,
        title: originalSpec.title,
        description: originalSpec.description,
        dependencies: newDeps,
        specialist: originalSpec.specialist,
        priority: originalSpec.priority,
        requiredEvidence: originalSpec.requiredEvidence,
        kind: originalSpec.kind,
        command: originalSpec.command,
      });
    }

    const mutation = {
      type: 'MERGE_TASKS',
      mergedTaskIds: taskIds,
      createdTaskId: merged.id,
      timestamp: new Date().toISOString(),
    };
    this._mutations.push(mutation);
    this.emit('replanner:mutation', mutation);
    return { removed: taskIds, added: merged.id, mutation };
  }

  /**
   * Change a task's dependency from one task to another.
   *
   * @param {string} taskId — Task to modify
   * @param {string} oldDep — Old dependency to remove
   * @param {string} newDep — New dependency to add
   * @returns {{ mutation }}
   */
  changeDependency(taskId, oldDep, newDep) {
    const state = this.plane.load();
    const task = state.tasks[taskId];
    if (!task) throw new Error(`Unknown task: ${taskId}`);
    if (newDep && !state.tasks[newDep]) throw new Error(`Unknown dependency: ${newDep}`);

    // Remove old dependency
    task.dependencies = task.dependencies.filter((d) => d !== oldDep);

    // Add new dependency
    if (newDep && !task.dependencies.includes(newDep)) {
      task.dependencies.push(newDep);
    }

    task.updatedAt = new Date().toISOString();
    this._event(state, 'task.dependency_changed', { taskId, oldDep, newDep });
    this.plane._ensureAcyclic(state);
    this._save(state);

    const mutation = { type: 'CHANGE_DEPENDENCY', taskId, oldDep, newDep, timestamp: new Date().toISOString() };
    this._mutations.push(mutation);
    this.emit('replanner:mutation', mutation);
    return { mutation };
  }

  /**
   * Change a task's priority.
   *
   * @param {string} taskId
   * @param {string} newPriority — CRITICAL, HIGH, MEDIUM, LOW
   * @returns {{ mutation }}
   */
  changePriority(taskId, newPriority) {
    const state = this.plane.load();
    const task = state.tasks[taskId];
    if (!task) throw new Error(`Unknown task: ${taskId}`);

    const oldPriority = task.priority;
    task.priority = newPriority;
    task.updatedAt = new Date().toISOString();

    this._event(state, 'task.priority_changed', { taskId, oldPriority, newPriority });
    this._save(state);

    const mutation = { type: 'CHANGE_PRIORITY', taskId, oldPriority, newPriority, timestamp: new Date().toISOString() };
    this._mutations.push(mutation);
    this.emit('replanner:mutation', mutation);
    return { mutation };
  }

  /**
   * Change a task's assigned specialist.
   *
   * @param {string} taskId
   * @param {string} newSpecialist
   * @returns {{ mutation }}
   */
  changeSpecialist(taskId, newSpecialist) {
    const state = this.plane.load();
    const task = state.tasks[taskId];
    if (!task) throw new Error(`Unknown task: ${taskId}`);

    const oldSpecialist = task.specialist;
    task.specialist = newSpecialist;
    task.updatedAt = new Date().toISOString();

    this._event(state, 'task.specialist_changed', { taskId, oldSpecialist, newSpecialist });
    this._save(state);

    const mutation = { type: 'CHANGE_SPECIALIST', taskId, oldSpecialist, newSpecialist, timestamp: new Date().toISOString() };
    this._mutations.push(mutation);
    this.emit('replanner:mutation', mutation);
    return { mutation };
  }

  /**
   * Update a task's acceptance criteria.
   *
   * @param {string} taskId
   * @param {string[]} newCriteria
   * @returns {{ mutation }}
   */
  updateAcceptanceCriteria(taskId, newCriteria) {
    const state = this.plane.load();
    const task = state.tasks[taskId];
    if (!task) throw new Error(`Unknown task: ${taskId}`);

    const oldCriteria = task.acceptanceCriteria || [];
    task.acceptanceCriteria = newCriteria;
    task.updatedAt = new Date().toISOString();

    this._event(state, 'task.criteria_updated', { taskId, oldCount: oldCriteria.length, newCount: newCriteria.length });
    this._save(state);

    const mutation = { type: 'UPDATE_CRITERIA', taskId, oldCount: oldCriteria.length, newCount: newCriteria.length, timestamp: new Date().toISOString() };
    this._mutations.push(mutation);
    this.emit('replanner:mutation', mutation);
    return { mutation };
  }

  /**
   * Create a recovery task for a failed task.
   *
   * @param {string} failedTaskId
   * @param {object} recoverySpec — Recovery task specification
   * @returns {{ taskId, mutation }}
   */
  createRecoveryTask(failedTaskId, recoverySpec) {
    const state = this.plane.load();
    const failedTask = state.tasks[failedTaskId];
    if (!failedTask) throw new Error(`Unknown task: ${failedTaskId}`);

    // Recovery task depends on nothing (it's a fresh attempt)
    const recovery = this.plane.addTask({
      id: recoverySpec.id || `recovery-${failedTaskId}-${Date.now().toString(36)}`,
      title: recoverySpec.title || `Recovery for ${failedTask.title}`,
      description: recoverySpec.description || `Recover from failure of ${failedTaskId}`,
      dependencies: recoverySpec.dependencies || [],
      specialist: recoverySpec.specialist || failedTask.specialist,
      priority: recoverySpec.priority || 'HIGH',
      requiredEvidence: recoverySpec.requiredEvidence || failedTask.requiredEvidence,
      acceptanceCriteria: recoverySpec.acceptanceCriteria || failedTask.acceptanceCriteria,
      kind: recoverySpec.kind || failedTask.kind,
      command: recoverySpec.command || failedTask.command,
    });

    const mutation = {
      type: 'RECOVERY_TASK',
      failedTaskId,
      recoveryTaskId: recovery.id,
      timestamp: new Date().toISOString(),
    };
    this._mutations.push(mutation);
    this.emit('replanner:mutation', mutation);
    return { taskId: recovery.id, mutation };
  }

  /**
   * Get full mutation history.
   * @returns {Array}
   */
  get history() {
    return [...this._mutations];
  }

  /**
   * Get the current DAG structure.
   * @returns {{ tasks, edges, roots, leaves }}
   */
  getDAG() {
    const state = this.plane.load();
    const tasks = Object.values(state.tasks);
    const edges = [];
    const roots = [];
    const leaves = [];

    for (const task of tasks) {
      if (task.dependencies.length === 0) roots.push(task.id);
      const hasDependents = tasks.some((t) => t.dependencies.includes(task.id));
      if (!hasDependents) leaves.push(task.id);
      for (const dep of task.dependencies) {
        edges.push({ from: dep, to: task.id });
      }
    }

    return { tasks: tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority })), edges, roots, leaves };
  }

  // ─── Private ──────────────────────────────────────────────────────

  _event(state, type, data) {
    state.events.push({ id: `event-${Date.now().toString(36)}`, at: new Date().toISOString(), type, data });
  }

  _save(state) {
    state.updatedAt = new Date().toISOString();
    const temp = `${this.plane.stateFile}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`);
    fs.renameSync(temp, this.plane.stateFile);
  }
}
