import fs from 'node:fs';
import path from 'node:path';

class Dashboard {
  constructor(projectRoot) {
    this.projectRoot = path.resolve(projectRoot);
    this.dir = path.join(this.projectRoot, '.opencode-system');
    this.stateFile = path.join(this.dir, 'state.json');
  }

  /**
   * Generate a full dashboard report.
   */
  generate() {
    if (!fs.existsSync(this.stateFile)) return { initialized: false, message: 'No project state found. Run init first.' };
    const state = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
    const tasks = Object.values(state.tasks || {});
    const counts = {};
    for (const status of ['PENDING', 'IN_PROGRESS', 'BLOCKED', 'COMPLETE', 'FAILED', 'CANCELLED']) {
      counts[status] = tasks.filter(t => t.status === status).length;
    }
    const recentEvents = (state.events || []).slice(-10);
    const recentFailures = (state.failures || []).slice(-5);
    const recentEvidence = (state.evidence || []).slice(-10);
    return {
      initialized: true,
      projectId: state.projectId,
      goal: state.goal,
      status: state.status,
      mode: state.mode,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
      taskCounts: counts,
      totalTasks: tasks.length,
      completionRate: tasks.length > 0 ? Math.round((counts.COMPLETE / tasks.length) * 100) : 0,
      budget: state.budgets,
      checkpoints: (state.checkpoints || []).length,
      recentEvents: recentEvents.map(e => ({ type: e.type, at: e.at, data: e.data })),
      recentFailures: recentFailures.map(f => ({ category: f.category, cause: f.cause, taskId: f.taskId })),
      recentEvidence: recentEvidence.map(e => ({ type: e.type, verdict: e.verdict, taskId: e.taskId })),
    };
  }

  /**
   * Generate a text-formatted dashboard.
   */
  toText() {
    const d = this.generate();
    if (!d.initialized) return d.message;
    const lines = [];
    lines.push('=== OpenCode System Dashboard ===');
    lines.push('Project:  ' + d.goal);
    lines.push('Status:   ' + d.status + ' (mode: ' + d.mode + ')');
    lines.push('Updated:  ' + d.updatedAt);
    lines.push('');
    lines.push('--- Tasks ---');
    lines.push('  Total:     ' + d.totalTasks);
    lines.push('  Complete:  ' + d.taskCounts.COMPLETE + ' (' + d.completionRate + '%)');
    lines.push('  In Progress: ' + d.taskCounts.IN_PROGRESS);
    lines.push('  Pending:   ' + d.taskCounts.PENDING);
    lines.push('  Blocked:   ' + d.taskCounts.BLOCKED);
    lines.push('  Failed:    ' + d.taskCounts.FAILED);
    lines.push('');
    lines.push('--- Budget ---');
    lines.push('  Iterations: ' + (d.budget.iterations || 'N/A'));
    lines.push('  Retries/Task: ' + (d.budget.retriesPerTask || 'N/A'));
    lines.push('  Checkpoints: ' + d.checkpoints);
    if (d.recentFailures.length > 0) {
      lines.push('');
      lines.push('--- Recent Failures ---');
      for (const f of d.recentFailures) lines.push('  [' + f.category + '] ' + f.taskId + ': ' + f.cause);
    }
    if (d.recentEvidence.length > 0) {
      lines.push('');
      lines.push('--- Recent Evidence ---');
      for (const e of d.recentEvidence) lines.push('  [' + e.type + '] ' + e.verdict + ' (' + e.taskId + ')');
    }
    lines.push('');
    lines.push('=== End Dashboard ===');
    return lines.join('\n');
  }
}

export { Dashboard };