import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';

const WORKTREE_STATUS = Object.freeze({
  CREATING: 'CREATING',
  ACTIVE: 'ACTIVE',
  CLEANUP: 'CLEANUP',
  MERGED: 'MERGED',
  ABANDONED: 'ABANDONED',
  ERROR: 'ERROR',
});

class WorktreeManager extends EventEmitter {
  constructor(projectRoot, options) {
    super();
    options = options || {};
    this.projectRoot = path.resolve(projectRoot);
    this.dir = path.join(this.projectRoot, '.opencode-system');
    this.worktreesFile = path.join(this.dir, 'worktrees.json');
    this.worktrees = this._load();
    this.maxWorktrees = options.maxWorktrees || 50;
    this.isolationRoot = options.isolationRoot || path.join(this.projectRoot, '.opencode-system', 'worktrees');
  }

  create(taskId, workerId, branch) {
    if (Object.keys(this.worktrees).length >= this.maxWorktrees) throw new Error('Maximum worktrees reached: ' + this.maxWorktrees);
    var existing = Object.values(this.worktrees).filter(function(w) { return w.taskId === taskId && w.status === WORKTREE_STATUS.ACTIVE; });
    if (existing.length > 0) return existing[0];
    var id = 'wt-' + crypto.randomUUID().slice(0, 8);
    var wt = { id: id, taskId: taskId, workerId: workerId, branch: branch || 'task/' + taskId, path: path.join(this.isolationRoot, id), ownedFiles: [], status: WORKTREE_STATUS.CREATING, createdAt: new Date().toISOString(), cleanupStatus: null };
    this.worktrees[id] = wt;
    this._save();
    this.emit('worktree:created', { id: id, taskId: taskId });
    return wt;
  }

  activate(worktreeId) {
    var wt = this.worktrees[worktreeId];
    if (wt) { wt.status = WORKTREE_STATUS.ACTIVE; this._save(); }
    return wt;
  }

  addOwnedFile(worktreeId, filePath) {
    var wt = this.worktrees[worktreeId];
    if (wt && wt.ownedFiles.indexOf(filePath) === -1) { wt.ownedFiles.push(filePath); this._save(); }
    return wt;
  }

  detectConflict(taskId1, taskId2) {
    var wt1 = Object.values(this.worktrees).find(function(w) { return w.taskId === taskId1 && w.status === WORKTREE_STATUS.ACTIVE; });
    var wt2 = Object.values(this.worktrees).find(function(w) { return w.taskId === taskId2 && w.status === WORKTREE_STATUS.ACTIVE; });
    if (!wt1 || !wt2) return { hasConflict: false };
    var overlap = wt1.ownedFiles.filter(function(f) { return wt2.ownedFiles.indexOf(f) >= 0; });
    return { hasConflict: overlap.length > 0, overlappingFiles: overlap, worktree1: wt1.id, worktree2: wt2.id };
  }

  getActiveWorktrees() {
    return Object.values(this.worktrees).filter(function(w) { return w.status === WORKTREE_STATUS.ACTIVE || w.status === WORKTREE_STATUS.CREATING; });
  }

  getWorktreeForTask(taskId) {
    return Object.values(this.worktrees).find(function(w) { return w.taskId === taskId && (w.status === WORKTREE_STATUS.ACTIVE || w.status === WORKTREE_STATUS.CREATING); });
  }

  markCleanup(worktreeId) {
    var wt = this.worktrees[worktreeId];
    if (wt) { wt.status = WORKTREE_STATUS.CLEANUP; wt.cleanupStatus = 'pending'; this._save(); }
    return wt;
  }

  markMerged(worktreeId) {
    var wt = this.worktrees[worktreeId];
    if (wt) { wt.status = WORKTREE_STATUS.MERGED; wt.cleanupStatus = 'completed'; this._save(); }
    return wt;
  }

  abandon(worktreeId) {
    var wt = this.worktrees[worktreeId];
    if (wt) { wt.status = WORKTREE_STATUS.ABANDONED; wt.cleanupStatus = 'abandoned'; this._save(); }
    return wt;
  }

  getStats() {
    var all = Object.values(this.worktrees);
    return { total: all.length, active: all.filter(function(w) { return w.status === WORKTREE_STATUS.ACTIVE; }).length, creating: all.filter(function(w) { return w.status === WORKTREE_STATUS.CREATING; }).length, merged: all.filter(function(w) { return w.status === WORKTREE_STATUS.MERGED; }).length, abandoned: all.filter(function(w) { return w.status === WORKTREE_STATUS.ABANDONED; }).length };
  }

  _load() {
    if (fs.existsSync(this.worktreesFile)) { return JSON.parse(fs.readFileSync(this.worktreesFile, 'utf8')); }
    return {};
  }

  _save() {
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(this.worktreesFile, JSON.stringify(this.worktrees, null, 2));
  }
}

export { WORKTREE_STATUS, WorktreeManager };