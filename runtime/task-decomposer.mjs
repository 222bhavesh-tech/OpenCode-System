import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';

const COMPLEXITY = Object.freeze({ TRIVIAL: 1, SIMPLE: 2, MODERATE: 3, COMPLEX: 4, VERY_COMPLEX: 5 });

class TaskDecomposer extends EventEmitter {
  constructor(options) {
    super();
    options = options || {};
    this.maxSubtasks = options.maxSubtasks || 10;
    this.minTaskSize = options.minTaskSize || 1;
    this.complexityThreshold = options.complexityThreshold || COMPLEXITY.MODERATE;
  }

  /**
   * Evaluate whether a task needs decomposition.
   */
  evaluate(task) {
    const complexity = this._estimateComplexity(task);
    const needsDecomposition = complexity >= this.complexityThreshold;
    return { needsDecomposition: needsDecomposition, complexity: complexity, threshold: this.complexityThreshold };
  }

  /**
   * Decompose a complex task into subtasks.
   */
  decompose(task) {
    const eval_ = this.evaluate(task);
    if (!eval_.needsDecomposition) {
      return { decomposed: false, subtasks: [task], reason: 'Task complexity within threshold' };
    }
    const subtasks = this._generateSubtasks(task);
    this.emit('task:decomposed', { taskId: task.id, subtaskCount: subtasks.length });
    return { decomposed: true, subtasks: subtasks, originalComplexity: eval_.complexity, subtaskCount: subtasks.length };
  }

  _estimateComplexity(task) {
    let score = 1;
    if (task.files && task.files.length > 5) score++;
    if (task.files && task.files.length > 15) score++;
    if (task.dependencies && task.dependencies.length > 3) score++;
    if (task.dependencies && task.dependencies.length > 8) score++;
    if (task.risk === 'HIGH' || task.risk === 'CRITICAL') score++;
    if (task.verificationRequirements && task.verificationRequirements.length > 3) score++;
    if (task.type === 'MIGRATION' || task.type === 'ARCHITECTURE') score++;
    const title = (task.title || task.description || '').toLowerCase();
    if (title.includes('and') || title.includes(',')) score++;
    return Math.min(COMPLEXITY.VERY_COMPLEX, score);
  }

  _generateSubtasks(task) {
    const subtasks = [];
    const files = task.files || [];
    const deps = task.dependencies || [];
    if (files.length > 5) {
      const chunkSize = Math.ceil(files.length / Math.min(this.maxSubtasks, Math.ceil(files.length / 3)));
      for (let i = 0; i < files.length; i += chunkSize) {
        subtasks.push({ id: task.id + '-chunk-' + crypto.randomUUID().slice(0, 6), title: task.title + ' (part ' + (subtasks.length + 1) + ')', type: task.type, files: files.slice(i, i + chunkSize), parentTaskId: task.id, dependencies: [], specialist: task.specialist, risk: task.risk });
      }
    } else {
      subtasks.push({ id: task.id + '-impl', title: task.title + ' (implementation)', type: task.type, files: files, parentTaskId: task.id, dependencies: [], specialist: task.specialist, risk: task.risk });
      subtasks.push({ id: task.id + '-verify', title: task.title + ' (verification)', type: 'TESTING', files: [], parentTaskId: task.id, dependencies: [task.id + '-impl'], specialist: 'tester', risk: 'LOW' });
    }
    if (subtasks.length > this.maxSubtasks) return subtasks.slice(0, this.maxSubtasks);
    return subtasks;
  }
}

export { COMPLEXITY, TaskDecomposer };