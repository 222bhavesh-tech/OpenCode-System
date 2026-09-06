import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

class ExperienceStore extends EventEmitter {
  constructor(projectRoot, options) {
    super();
    options = options || {};
    this.projectRoot = path.resolve(projectRoot);
    this.dir = path.join(this.projectRoot, '.opencode-system');
    this.storeFile = path.join(this.dir, 'experience-store.json');
    this.maxEntries = options.maxEntries || 1000;
    this._dirExists = fs.existsSync(this.dir);
    this.entries = this._load();
  }

  /**
   * Record a new experience.
   */
  record(data) {
    const entry = {
      id: 'exp-' + crypto.randomUUID().slice(0, 12),
      taskType: data.taskType || 'UNKNOWN',
      projectType: data.projectType || 'UNKNOWN',
      strategy: data.strategy || 'UNKNOWN',
      agentRole: data.agentRole || 'UNKNOWN',
      capabilities: data.capabilities || [],
      tools: data.tools || [],
      duration: data.duration || 0,
      cost: data.cost || 0,
      attempts: data.attempts || 1,
      verificationResults: data.verificationResults || 'UNKNOWN',
      failureCategories: data.failureCategories || [],
      outcome: data.outcome || 'UNKNOWN',
      qualityScore: data.qualityScore || 0.5,
      contextSize: data.contextSize || 0,
      tokenUsage: data.tokenUsage || 0,
      parallelEfficiency: data.parallelEfficiency || 0,
      recoveryUsed: data.recoveryUsed || false,
      timestamp: new Date().toISOString(),
    };
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }
    this._save();
    this.emit('experience:recorded', { id: entry.id, outcome: entry.outcome });
    return entry;
  }

  /**
   * Query experiences by filter.
   */
  getOutcomes(filter) {
    let results = this.entries;
    if (filter.taskType) results = results.filter(e => e.taskType === filter.taskType);
    if (filter.strategy) results = results.filter(e => e.strategy === filter.strategy);
    if (filter.agentRole) results = results.filter(e => e.agentRole === filter.agentRole);
    if (filter.outcome) results = results.filter(e => e.outcome === filter.outcome);
    if (filter.projectType) results = results.filter(e => e.projectType === filter.projectType);
    return results;
  }

  /**
   * Get aggregate statistics.
   */
  stats() {
    const n = this.entries.length;
    if (n === 0) return { total: 0, successRate: 0, avgQuality: 0, avgDuration: 0 };
    const successes = this.entries.filter(e => e.outcome === 'SUCCESS').length;
    const avgQuality = this.entries.reduce((s, e) => s + e.qualityScore, 0) / n;
    const avgDuration = this.entries.reduce((s, e) => s + e.duration, 0) / n;
    const byStrategy = {};
    for (const e of this.entries) {
      if (!byStrategy[e.strategy]) byStrategy[e.strategy] = { count: 0, successes: 0 };
      byStrategy[e.strategy].count++;
      if (e.outcome === 'SUCCESS') byStrategy[e.strategy].successes++;
    }
    return { total: n, successRate: Math.round((successes / n) * 100) / 100, avgQuality: Math.round(avgQuality * 100) / 100, avgDuration: Math.round(avgDuration), byStrategy };
  }

  /**
   * Get recent experiences.
   */
  recent(limit) {
    return this.entries.slice(-(limit || 10));
  }

  /**
   * Clear all experiences.
   */
  clear() {
    this.entries = [];
    this._save();
  }

  _load() {
    if (fs.existsSync(this.storeFile)) {
      try { return JSON.parse(fs.readFileSync(this.storeFile, 'utf8')); } catch(e) { return []; }
    }
    return [];
  }

  _save() {
    if (!this._dirExists) {
      fs.mkdirSync(this.dir, { recursive: true });
      this._dirExists = true;
    }
    fs.writeFileSync(this.storeFile, JSON.stringify(this.entries));
  }
}

export { ExperienceStore };