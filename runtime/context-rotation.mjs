import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';

const ROTATION_REASON = Object.freeze({
  TOKEN_BUDGET: 'TOKEN_BUDGET',
  STALE_CONTEXT: 'STALE_CONTEXT',
  PHASE_CHANGE: 'PHASE_CHANGE',
  ERROR_RECOVERY: 'ERROR_RECOVERY',
  CHECKPOINT_RESTORE: 'CHECKPOINT_RESTORE',
  MANUAL: 'MANUAL',
});

const ROTATION_ACTION = Object.freeze({
  PRUNE: 'PRUNE',
  SUMMARIZE: 'SUMMARIZE',
  COMPRESS: 'COMPRESS',
  RESET: 'RESET',
  SNAPSHOT: 'SNAPSHOT',
  RESTORE: 'RESTORE',
});

class ContextRotation extends EventEmitter {
  constructor(projectRoot, options) {
    super();
    options = options || {};
    this.projectRoot = path.resolve(projectRoot);
    this.dir = path.join(this.projectRoot, '.opencode-system');
    this.snapshotsDir = path.join(this.dir, 'context-snapshots');
    this.maxTokens = options.maxTokens || 50000;
    this.maxSnapshots = options.maxSnapshots || 20;
    this.staleAfterMs = options.staleAfterMs || 300000; // 5 minutes
    this.snapshots = this._loadSnapshots();
  }

  /**
   * Evaluate whether context rotation is needed.
   */
  evaluate(context) {
    const reasons = [];
    const tokenEstimate = this._estimateTokens(context);
    if (tokenEstimate > this.maxTokens) {
      reasons.push({ reason: ROTATION_REASON.TOKEN_BUDGET, current: tokenEstimate, max: this.maxTokens });
    }
    if (context.lastUpdated) {
      const age = Date.now() - new Date(context.lastUpdated).getTime();
      if (age > this.staleAfterMs) {
        reasons.push({ reason: ROTATION_REASON.STALE_CONTEXT, ageMs: age, staleAfterMs: this.staleAfterMs });
      }
    }
    return { needsRotation: reasons.length > 0, reasons: reasons, estimatedTokens: tokenEstimate };
  }

  /**
   * Execute a rotation action.
   */
  rotate(context, action, reason) {
    const snapshot = this.snapshot(context, reason || ROTATION_REASON.MANUAL);
    let result;
    switch (action) {
      case ROTATION_ACTION.PRUNE:
        result = this._prune(context);
        break;
      case ROTATION_ACTION.SUMMARIZE:
        result = this._summarize(context);
        break;
      case ROTATION_ACTION.COMPRESS:
        result = this._compress(context);
        break;
      case ROTATION_ACTION.RESET:
        result = this._resetContext(context);
        break;
      case ROTATION_ACTION.SNAPSHOT:
        result = { saved: true, snapshotId: snapshot.id };
        break;
      case ROTATION_ACTION.RESTORE:
        result = { restored: true, snapshotId: snapshot.id };
        break;
      default:
        result = this._prune(context);
    }
    this.emit('context:rotated', { action: action, reason: reason, result: result });
    return { snapshotId: snapshot.id, action: action, result: result };
  }

  /**
   * Save a context snapshot.
   */
  snapshot(context, reason) {
    const id = 'snap-' + crypto.randomUUID().slice(0, 8);
    const snapshot = {
      id: id,
      reason: reason || 'manual',
      timestamp: new Date().toISOString(),
      data: JSON.parse(JSON.stringify(context)),
      tokens: this._estimateTokens(context),
    };
    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots = this.snapshots.slice(-this.maxSnapshots);
    }
    this._saveSnapshots();
    this.emit('context:snapshot', { id: id, reason: reason });
    return snapshot;
  }

  /**
   * Restore a context snapshot.
   */
  restore(snapshotId) {
    const snap = this.snapshots.find(s => s.id === snapshotId);
    if (!snap) throw new Error('Snapshot not found: ' + snapshotId);
    this.emit('context:restored', { snapshotId: snapshotId, timestamp: snap.timestamp });
    return { context: JSON.parse(JSON.stringify(snap.data)), snapshot: snap };
  }

  /**
   * Get rotation history.
   */
  getHistory() {
    return this.snapshots.map(s => ({
      id: s.id,
      reason: s.reason,
      timestamp: s.timestamp,
      tokens: s.tokens,
    }));
  }

  /**
   * Suggest the best rotation action for a given context evaluation.
   */
  suggestAction(evaluation) {
    if (!evaluation.needsRotation) return null;
    const primaryReason = evaluation.reasons[0];
    switch (primaryReason.reason) {
      case ROTATION_REASON.TOKEN_BUDGET:
        return primaryReason.current > this.maxTokens * 2
          ? ROTATION_ACTION.RESET
          : ROTATION_ACTION.PRUNE;
      case ROTATION_REASON.STALE_CONTEXT:
        return ROTATION_ACTION.SUMMARIZE;
      case ROTATION_REASON.PHASE_CHANGE:
        return ROTATION_ACTION.SNAPSHOT;
      case ROTATION_REASON.ERROR_RECOVERY:
        return ROTATION_ACTION.RESTORE;
      default:
        return ROTATION_ACTION.PRUNE;
    }
  }

  // ─── Private ──────────────────────────────────────────────────────

  _prune(context) {
    const pruned = { ...context };
    if (pruned.history && pruned.history.length > 50) {
      pruned.history = pruned.history.slice(-50);
    }
    if (pruned.findings && pruned.findings.length > 20) {
      pruned.findings = pruned.findings.slice(-20);
    }
    if (pruned.errors && pruned.errors.length > 10) {
      pruned.errors = pruned.errors.slice(-10);
    }
    return { pruned: true, tokensBefore: this._estimateTokens(context), tokensAfter: this._estimateTokens(pruned) };
  }

  _summarize(context) {
    // In production, this would call LLM for summarization
    // For now, truncate to essential fields
    const summary = {
      objective: context.objective || '',
      phase: context.phase || '',
      taskCount: (context.tasks || []).length,
      keyFindings: (context.findings || []).slice(-5),
      recentErrors: (context.errors || []).slice(-3),
      lastUpdated: new Date().toISOString(),
      summarized: true,
    };
    return { summarized: true, tokensBefore: this._estimateTokens(context), tokensAfter: this._estimateTokens(summary) };
  }

  _compress(context) {
    // Deduplicate and compress
    const seen = new Set();
    const compressed = { ...context };
    if (compressed.findings) {
      compressed.findings = compressed.findings.filter(f => {
        const key = JSON.stringify(f);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    return { compressed: true, tokensBefore: this._estimateTokens(context), tokensAfter: this._estimateTokens(compressed) };
  }

  _resetContext(context) {
    return {
      reset: true,
      objective: context.objective,
      phase: context.phase,
      timestamp: new Date().toISOString(),
    };
  }

  _estimateTokens(obj) {
    return Math.ceil(JSON.stringify(obj).length / 4);
  }

  _loadSnapshots() {
    fs.mkdirSync(this.snapshotsDir, { recursive: true });
    const file = path.join(this.snapshotsDir, 'snapshots.json');
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
    return [];
  }

  _saveSnapshots() {
    fs.mkdirSync(this.snapshotsDir, { recursive: true });
    const file = path.join(this.snapshotsDir, 'snapshots.json');
    fs.writeFileSync(file, JSON.stringify(this.snapshots, null, 2));
  }
}

export { ROTATION_REASON, ROTATION_ACTION, ContextRotation };