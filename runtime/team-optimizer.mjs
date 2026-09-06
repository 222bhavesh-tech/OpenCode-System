import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';

const TEAM_COMPOSITION = Object.freeze({
  SOLO: 'SOLO',
  PAIR: 'PAIR',
  SMALL: 'SMALL',
  FULL: 'FULL',
});

class TeamOptimizer extends EventEmitter {
  constructor(experienceStore, options) {
    super();
    this.experienceStore = experienceStore;
    this.teams = new Map();
    this._registerDefaults();
  }

  _registerDefaults() {
    this.teams.set('backend', { role: 'backend', capabilities: ['code-write', 'file-edit', 'shell-execute', 'test-run'] });
    this.teams.set('frontend', { role: 'frontend', capabilities: ['code-write', 'file-edit', 'browser-verify', 'test-run'] });
    this.teams.set('tester', { role: 'tester', capabilities: ['test-run', 'code-read', 'file-read'] });
    this.teams.set('reviewer', { role: 'reviewer', capabilities: ['code-read', 'file-read', 'security-check'] });
    this.teams.set('database', { role: 'database', capabilities: ['schema-read', 'schema-write', 'query-execute'] });
    this.teams.set('security', { role: 'security', capabilities: ['code-read', 'security-check', 'dependency-audit'] });
    this.teams.set('devops', { role: 'devops', capabilities: ['shell-execute', 'config-edit', 'deploy'] });
    this.teams.set('debugger', { role: 'debugger', capabilities: ['code-read', 'file-read', 'shell-execute', 'code-edit'] });
  }

  /**
   * Select optimal team composition for a task.
   */
  selectTeam(task) {
    const required = this._getRequiredRoles(task);
    const compositions = this._generateCompositions(required);
    const scored = compositions.map(c => {
      const score = this._scoreComposition(c, task);
      return { composition: c, score: score.score, reasoning: score.reasoning };
    });
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    const record = {
      id: 'team-' + crypto.randomUUID().slice(0, 8),
      taskId: task.id,
      selectedTeam: best.composition,
      score: best.score,
      reasoning: best.reasoning,
      alternatives: scored.slice(1).map(s => ({ team: s.composition.map(r => r.role), score: s.score })),
      timestamp: new Date().toISOString(),
    };
    this.emit('team:selected', { taskId: task.id, team: record.selectedTeam.map(r => r.role) });
    return record;
  }

  _getRequiredRoles(task) {
    const roles = [];
    const type = (task.type || '').toLowerCase();
    if (type.includes('backend') || type.includes('api') || type.includes('server')) roles.push('backend');
    if (type.includes('frontend') || type.includes('ui') || type.includes('component')) roles.push('frontend');
    if (type.includes('test') || type.includes('spec')) roles.push('tester');
    if (type.includes('security') || type.includes('auth')) roles.push('security');
    if (type.includes('database') || type.includes('schema') || type.includes('migration')) roles.push('database');
    if (type.includes('deploy') || type.includes('ci') || type.includes('docker')) roles.push('devops');
    if (type.includes('bug') || type.includes('fix') || type.includes('debug')) roles.push('debugger');
    if (roles.length === 0) roles.push('backend');
    return [...new Set(roles)];
  }

  _generateCompositions(requiredRoles) {
    const compositions = [];
    compositions.push(requiredRoles.map(r => this.teams.get(r) || { role: r, capabilities: [] }));
    if (requiredRoles.length > 1) {
      compositions.push([this.teams.get(requiredRoles[0]) || { role: requiredRoles[0], capabilities: [] }]);
    }
    const withReviewer = [...compositions[0], this.teams.get('reviewer')];
    compositions.push(withReviewer);
    return compositions;
  }

  _scoreComposition(composition, task) {
    let score = 0.5;
    const roles = composition.map(r => r.role);
    const allCaps = composition.flatMap(r => r.capabilities || []);
    const uniqueCaps = [...new Set(allCaps)];
    score += uniqueCaps.length * 0.05;
    if (roles.includes('reviewer') && (task.risk === 'HIGH' || task.risk === 'CRITICAL')) score += 0.15;
    if (roles.includes('tester')) score += 0.1;
    if (composition.length > 4) score -= 0.1;
    return { score: Math.max(0, Math.min(1, score)), reasoning: roles.join(' + ') + ' (' + uniqueCaps.length + ' capabilities)' };
  }

  getTeamTemplates() {
    return [...this.teams.entries()].map(([name, team]) => ({ name, ...team }));
  }
}

export { TEAM_COMPOSITION, TeamOptimizer };