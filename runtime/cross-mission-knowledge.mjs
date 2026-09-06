import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';

class CrossMissionKnowledge extends EventEmitter {
  constructor(projectRoot, options) {
    super();
    this.projectRoot = path.resolve(projectRoot);
    this.dir = path.join(this.projectRoot, '.opencode-system');
    this.file = path.join(this.dir, 'cross-mission-knowledge.json');
    this.knowledge = this._load();
  }

  _load() {
    if (fs.existsSync(this.file)) {
      try { return JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch(e) { return { patterns: [], antiPatterns: [], dependencies: [], insights: [] }; }
    }
    return { patterns: [], antiPatterns: [], dependencies: [], insights: [] };
  }

  _save() {
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.knowledge, null, 2));
  }

  /**
   * Learn from a completed mission.
   */
  learnFromMission(mission) {
    if (mission.outcome === 'SUCCESS') {
      if (mission.successfulPatterns) {
        for (const pattern of mission.successfulPatterns) {
          const existing = this.knowledge.patterns.find(p => p.name === pattern);
          if (existing) { existing.count++; existing.lastSeen = Date.now(); }
          else this.knowledge.patterns.push({ name: pattern, count: 1, firstSeen: Date.now(), lastSeen: Date.now() });
        }
      }
    }
    if (mission.failures && mission.failures.length > 0) {
      for (const failure of mission.failures) {
        const existing = this.knowledge.antiPatterns.find(p => p.name === failure);
        if (existing) { existing.count++; existing.lastSeen = Date.now(); }
        else this.knowledge.antiPatterns.push({ name: failure, count: 1, firstSeen: Date.now(), lastSeen: Date.now() });
      }
    }
    this._save();
    this.emit('knowledge:learned', { missionId: mission.id, outcome: mission.outcome });
  }

  /**
   * Query knowledge.
   */
  query(query) {
    const q = (query || '').toLowerCase();
    return {
      patterns: this.knowledge.patterns.filter(p => p.name.toLowerCase().includes(q)),
      antiPatterns: this.knowledge.antiPatterns.filter(p => p.name.toLowerCase().includes(q)),
      insights: this.knowledge.insights.filter(i => i.text.toLowerCase().includes(q)),
    };
  }

  /**
   * Get top patterns.
   */
  topPatterns(limit) {
    return this.knowledge.patterns.sort((a, b) => b.count - a.count).slice(0, limit || 10);
  }

  /**
   * Get top anti-patterns.
   */
  topAntiPatterns(limit) {
    return this.knowledge.antiPatterns.sort((a, b) => b.count - a.count).slice(0, limit || 10);
  }

  /**
   * Add an insight.
   */
  addInsight(text, source) {
    this.knowledge.insights.push({ text, source: source || 'manual', timestamp: Date.now() });
    this._save();
  }

  /**
   * Get knowledge stats.
   */
  stats() {
    return { patterns: this.knowledge.patterns.length, antiPatterns: this.knowledge.antiPatterns.length, insights: this.knowledge.insights.length, totalObservations: this.knowledge.patterns.reduce((s, p) => s + p.count, 0) + this.knowledge.antiPatterns.reduce((s, p) => s + p.count, 0) };
  }

  clear() { this.knowledge = { patterns: [], antiPatterns: [], dependencies: [], insights: [] }; this._save(); }
}

export { CrossMissionKnowledge };