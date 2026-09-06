import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';

const IMPROVEMENT_TYPE = Object.freeze({
  PATTERN_SUGGESTION: 'PATTERN_SUGGESTION',
  STRUCTURE_IMPROVEMENT: 'STRUCTURE_IMPROVEMENT',
  PERFORMANCE_HINT: 'PERFORMANCE_HINT',
  SECURITY_IMPROVEMENT: 'SECURITY_IMPROVEMENT',
  DOCUMENTATION_HINT: 'DOCUMENTATION_HINT',
  TESTING_HINT: 'TESTING_HINT',
});

class QualityImprover extends EventEmitter {
  constructor(experienceStore, options) {
    super();
    this.experienceStore = experienceStore;
    this.improvements = [];
    this.applied = new Map();
  }

  /**
   * Analyze code changes and suggest improvements.
   */
  analyzeChanges(changes) {
    const suggestions = [];
    for (const change of changes) {
      if (change.type === 'add' || change.type === 'modify') {
        suggestions.push(...this._analyzeFile(change));
      }
    }
    this.improvements = suggestions;
    this.emit('improvement:suggested', { count: suggestions.length });
    return suggestions;
  }

  /**
   * Apply an improvement.
   */
  apply(improvementId) {
    const improvement = this.improvements.find(i => i.id === improvementId);
    if (!improvement) throw new Error('Unknown improvement: ' + improvementId);
    improvement.appliedAt = Date.now();
    this.applied.set(improvementId, improvement);
    return improvement;
  }

  /**
   * Get all improvements.
   */
  getImprovements() { return this.improvements; }

  _analyzeFile(change) {
    const suggestions = [];
    const content = change.content || '';
    const lines = content.split('\n');
    if (lines.length > 200) suggestions.push({ id: 'qi-' + crypto.randomUUID().slice(0, 6), type: IMPROVEMENT_TYPE.STRUCTURE_IMPROVEMENT, file: change.path, message: 'File is over 200 lines, consider splitting', severity: 'MEDIUM' });
    if (content.includes('eval(') || content.includes('exec(')) suggestions.push({ id: 'qi-' + crypto.randomUUID().slice(0, 6), type: IMPROVEMENT_TYPE.SECURITY_IMPROVEMENT, file: change.path, message: 'Dynamic code execution detected, review for security', severity: 'HIGH' });
    if (content.includes('console.log') && !change.path.includes('test')) suggestions.push({ id: 'qi-' + crypto.randomUUID().slice(0, 6), type: IMPROVEMENT_TYPE.STRUCTURE_IMPROVEMENT, file: change.path, message: 'console.log in non-test file, consider using logger', severity: 'LOW' });
    if (content.includes('TODO') || content.includes('FIXME')) suggestions.push({ id: 'qi-' + crypto.randomUUID().slice(0, 6), type: IMPROVEMENT_TYPE.DOCUMENTATION_HINT, file: change.path, message: 'TODO/FIXME found, ensure tracked in issue tracker', severity: 'LOW' });
    if (lines.some(l => l.length > 120)) suggestions.push({ id: 'qi-' + crypto.randomUUID().slice(0, 6), type: IMPROVEMENT_TYPE.STRUCTURE_IMPROVEMENT, file: change.path, message: 'Lines exceed 120 characters, consider breaking up', severity: 'LOW' });
    return suggestions;
  }
}

export { IMPROVEMENT_TYPE, QualityImprover };