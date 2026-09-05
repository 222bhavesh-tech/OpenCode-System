import fs from 'node:fs';
import path from 'node:path';

const CONTEXT_TYPE = Object.freeze({
  CONVERSATION: 'conversation',
  TASK: 'task',
  PROJECT_STATE: 'project-state',
  PROJECT_MEMORY: 'project-memory',
  FAILURE_MEMORY: 'failure-memory',
  DECISION_HISTORY: 'decision-history',
  EVIDENCE: 'evidence',
  CHECKPOINT: 'checkpoint',
});

class ContextEngine {
  constructor(projectRoot, options) {
    options = options || {};
    this.projectRoot = path.resolve(projectRoot);
    this.dir = path.join(this.projectRoot, '.opencode-system');
    this.contextDir = path.join(this.dir, 'context');
    this.maxContextTokens = options.maxContextTokens || 40000;
    this.maxRelevantFiles = options.maxRelevantFiles || 20;
    this.maxFailures = options.maxFailures || 10;
    this.maxDecisions = options.maxDecisions || 10;
    this.maxEvidence = options.maxEvidence || 20;
  }

  assembleTaskContext(task, state, mission) {
    var ctx = { taskId: task.id, sections: {}, tokenEstimate: 0, timestamp: new Date().toISOString() };

    ctx.sections.requirements = { type: CONTEXT_TYPE.TASK, content: { title: task.title, description: task.description || '', acceptanceCriteria: task.acceptanceCriteria || [], specialist: task.specialist || 'builder' } };

    ctx.sections.projectState = { type: CONTEXT_TYPE.PROJECT_STATE, content: { goal: state.goal, status: state.status, mode: state.mode, taskCount: Object.keys(state.tasks).length } };

    if (task.dependencies && task.dependencies.length > 0) {
      ctx.sections.dependencies = { type: CONTEXT_TYPE.TASK, content: task.dependencies.map(function(depId) { var dep = state.tasks[depId]; return { id: depId, title: dep ? dep.title : depId, status: dep ? dep.status : 'UNKNOWN', result: dep ? dep.result : null }; }) };
    }

    var failedTasks = Object.values(state.tasks).filter(function(t) { return t.status === 'FAILED'; });
    if (failedTasks.length > 0) {
      ctx.sections.previousFailures = { type: CONTEXT_TYPE.FAILURE_MEMORY, content: failedTasks.slice(0, this.maxFailures).map(function(t) { return { taskId: t.id, title: t.title, attempts: t.attempts }; }) };
    }

    if (state.decisions && state.decisions.length > 0) {
      ctx.sections.decisions = { type: CONTEXT_TYPE.DECISION_HISTORY, content: state.decisions.slice(-this.maxDecisions) };
    }

    if (state.evidence && state.evidence.length > 0) {
      ctx.sections.evidence = { type: CONTEXT_TYPE.EVIDENCE, content: state.evidence.slice(-this.maxEvidence) };
    }

    if (mission && mission.checkpoints && mission.checkpoints.length > 0) {
      var lastCp = mission.checkpoints[mission.checkpoints.length - 1];
      ctx.sections.checkpoint = { type: CONTEXT_TYPE.CHECKPOINT, content: { checkpointId: lastCp.id, timestamp: lastCp.timestamp } };
    }

    ctx.sections.conventions = { type: CONTEXT_TYPE.PROJECT_MEMORY, content: this._loadConventions() };

    ctx.tokenEstimate = this._estimateTokens(ctx);
    return ctx;
  }

  assembleMissionContext(mission) {
    return { missionId: mission.missionId, objective: mission.objective, status: mission.status, requirements: mission.requirements, acceptanceCriteria: mission.acceptanceCriteria, stats: { tasks: Object.keys(mission.tasks).length, milestones: mission.milestones.length, failures: mission.failures.length, evidence: mission.evidence.length, blockers: mission.blockers.filter(function(b) { return !b.resolvedAt; }).length } };
  }

  saveContextSnapshot(context, label) {
    fs.mkdirSync(this.contextDir, { recursive: true });
    var filename = 'ctx-' + (label || Date.now()) + '.json';
    var filepath = path.join(this.contextDir, filename);
    fs.writeFileSync(filepath, JSON.stringify(context, null, 2));
    return filepath;
  }

  loadContextSnapshot(label) {
    var filepath = path.join(this.contextDir, 'ctx-' + label + '.json');
    if (!fs.existsSync(filepath)) return null;
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  }

  pruneContext(context) {
    var sections = context.sections;
    var keys = Object.keys(sections);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var section = sections[key];
      if (section.content && typeof section.content === 'string' && section.content.length > 2000) {
        section.content = section.content.substring(0, 2000) + '... [pruned]';
      }
    }
    context.tokenEstimate = this._estimateTokens(context);
    return context;
  }

  needsRotation(context) {
    return context.tokenEstimate > this.maxContextTokens;
  }

  _estimateTokens(ctx) {
    var str = JSON.stringify(ctx);
    return Math.ceil(str.length / 4);
  }

  _loadConventions() {
    var rulesFile = path.join(this.projectRoot, '.opencode-system', 'rules.md');
    if (fs.existsSync(rulesFile)) {
      var content = fs.readFileSync(rulesFile, 'utf8');
      return content.substring(0, 2000);
    }
    return 'No conventions loaded.';
  }
}

export { CONTEXT_TYPE, ContextEngine };