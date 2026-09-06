import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';

const ORCHESTRATION_MODE = Object.freeze({
  PARALLEL: 'PARALLEL',
  SEQUENTIAL: 'SEQUENTIAL',
  HANDOFF: 'HANDOFF',
  PIPELINE: 'PIPELINE',
});

const AGENT_STATE = Object.freeze({
  IDLE: 'IDLE',
  ASSIGNED: 'ASSIGNED',
  RUNNING: 'RUNNING',
  WAITING: 'WAITING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  REPLACED: 'REPLACED',
});

class AgentOrchestrator extends EventEmitter {
  constructor(options) {
    super();
    this.agents = new Map();
    this.tasks = new Map();
    this.artifacts = new Map();
    this.maxConcurrent = (options && options.maxConcurrent) || 5;
  }

  /**
   * Register an agent.
   */
  registerAgent(agent) {
    const state = { ...agent, status: AGENT_STATE.IDLE, assignedTasks: [], completedTasks: [], startTime: null };
    this.agents.set(agent.id, state);
    return state;
  }

  /**
   * Assign a task to an agent.
   */
  assignTask(agentId, task) {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error('Unknown agent: ' + agentId);
    const taskState = { ...task, status: 'ASSIGNED', assignedTo: agentId, result: null, startTime: null };
    this.tasks.set(task.id, taskState);
    agent.assignedTasks.push(task.id);
    agent.status = AGENT_STATE.ASSIGNED;
    this.emit('task:assigned', { taskId: task.id, agentId: agentId });
    return taskState;
  }

  /**
   * Start task execution.
   */
  startTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error('Unknown task: ' + taskId);
    task.status = 'RUNNING';
    task.startTime = Date.now();
    const agent = this.agents.get(task.assignedTo);
    if (agent) agent.status = AGENT_STATE.RUNNING;
    this.emit('task:started', { taskId: taskId, agentId: task.assignedTo });
    return task;
  }

  /**
   * Complete a task.
   */
  completeTask(taskId, result) {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error('Unknown task: ' + taskId);
    task.status = 'COMPLETED';
    task.result = result;
    task.completedAt = Date.now();
    const agent = this.agents.get(task.assignedTo);
    if (agent) {
      agent.status = AGENT_STATE.IDLE;
      agent.completedTasks.push(taskId);
    }
    if (result.artifacts) {
      for (const art of result.artifacts) {
        this.artifacts.set(art.id || crypto.randomUUID().slice(0, 8), { ...art, taskId: taskId, agentId: task.assignedTo });
      }
    }
    this.emit('task:completed', { taskId: taskId, agentId: task.assignedTo });
    return task;
  }

  /**
   * Fail a task.
   */
  failTask(taskId, error) {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error('Unknown task: ' + taskId);
    task.status = 'FAILED';
    task.error = error;
    const agent = this.agents.get(task.assignedTo);
    if (agent) agent.status = AGENT_STATE.IDLE;
    this.emit('task:failed', { taskId: taskId, error: error });
    return task;
  }

  /**
   * Replace an agent on a task.
   */
  replaceAgent(taskId, newAgentId) {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error('Unknown task: ' + taskId);
    const oldAgent = this.agents.get(task.assignedTo);
    if (oldAgent) {
      oldAgent.status = AGENT_STATE.IDLE;
      oldAgent.assignedTasks = oldAgent.assignedTasks.filter(t => t !== taskId);
    }
    task.assignedTo = newAgentId;
    task.status = 'ASSIGNED';
    const newAgent = this.agents.get(newAgentId);
    if (newAgent) newAgent.assignedTasks.push(taskId);
    this.emit('agent:replaced', { taskId: taskId, oldAgent: oldAgent ? oldAgent.id : null, newAgent: newAgentId });
    return task;
  }

  /**
   * Get artifacts for a task.
   */
  getArtifacts(taskId) {
    return [...this.artifacts.values()].filter(a => a.taskId === taskId);
  }

  /**
   * Get orchestrator state.
   */
  getState() {
    return {
      agents: [...this.agents.values()].map(a => ({ id: a.id, role: a.role, status: a.status, assignedCount: a.assignedTasks.length, completedCount: a.completedTasks.length })),
      tasks: [...this.tasks.values()].map(t => ({ id: t.id, status: t.status, assignedTo: t.assignedTo })),
      artifacts: this.artifacts.size,
    };
  }

  /**
   * Get stats.
   */
  stats() {
    const tasks = [...this.tasks.values()];
    return {
      agents: this.agents.size,
      totalTasks: tasks.length,
      completed: tasks.filter(t => t.status === 'COMPLETED').length,
      failed: tasks.filter(t => t.status === 'FAILED').length,
      running: tasks.filter(t => t.status === 'RUNNING').length,
      artifacts: this.artifacts.size,
    };
  }
}

export { ORCHESTRATION_MODE, AGENT_STATE, AgentOrchestrator };