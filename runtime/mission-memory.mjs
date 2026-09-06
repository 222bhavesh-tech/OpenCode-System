import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';

class MissionMemory extends EventEmitter {
  constructor(projectRoot, options) {
    super();
    this.projectRoot = path.resolve(projectRoot);
    this.dir = path.join(this.projectRoot, '.opencode-system');
    this.file = path.join(this.dir, 'mission-memory.json');
    this.maxEntries = (options && options.maxEntries) || 200;
    this.entries = this._load();
  }

  _load() {
    if (fs.existsSync(this.file)) {
      try { return JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch(e) { return []; }
    }
    return [];
  }

  _save() {
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.entries, null, 2));
  }

  /**
   * Save a mission outcome to memory.
   */
  save(mission) {
    const entry = {
      id: mission.id,
      objective: mission.objective,
      outcome: mission.outcome || 'UNKNOWN',
      phases: mission.phases || [],
      agentsUsed: mission.agentsUsed || [],
      strategiesUsed: mission.strategiesUsed || [],
      failures: mission.failures || [],
      totalDuration: mission.totalDuration || 0,
      totalCost: mission.totalCost || 0,
      qualityScore: mission.qualityScore || 0.5,
      lessonsLearned: mission.lessonsLearned || [],
      successfulPatterns: mission.successfulPatterns || [],
      timestamp: Date.now(),
    };
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }
    this._save();
    this.emit('memory:saved', { id: entry.id, outcome: entry.outcome });
    return entry;
  }

  /**
   * Recall similar missions.
   */
  recall(objective, options) {
    const query = (objective || '').toLowerCase();
    let results = this.entries.filter(e => {
      const obj = (e.objective || '').toLowerCase();
      return obj.includes(query) || query.includes(obj);
    });
    if (options && options.outcome) results = results.filter(e => e.outcome === options.outcome);
    if (options && options.limit) results = results.slice(-options.limit);
    return results;
  }

  /**
   * Get recent missions.
   */
  recent(limit) {
    return this.entries.slice(-(limit || 10));
  }

  /**
   * Get stats.
   */
  stats() {
    const n = this.entries.length;
    if (n === 0) return { total: 0, successRate: 0, avgQuality: 0 };
    const successes = this.entries.filter(e => e.outcome === 'SUCCESS').length;
    const avgQuality = this.entries.reduce((s, e) => s + e.qualityScore, 0) / n;
    return { total: n, successRate: Math.round((successes / n) * 100) / 100, avgQuality: Math.round(avgQuality * 100) / 100 };
  }

  /**
   * Get all lessons learned.
   */
  getLessons() {
    return this.entries.filter(e => e.lessonsLearned && e.lessonsLearned.length > 0).flatMap(e => e.lessonsLearned.map(l => ({ lesson: l, missionId: e.id, objective: e.objective, timestamp: e.timestamp })));
  }

  clear() { this.entries = []; this._save(); }
}

export { MissionMemory };