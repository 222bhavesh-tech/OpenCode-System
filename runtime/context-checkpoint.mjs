/**
 * ContextCheckpoint — saves and restores execution context.
 *
 * When a session ends or crashes, the next session resumes from the
 * last checkpoint rather than restarting from scratch.
 *
 * Checkpoint includes:
 *   - Project state snapshot
 *   - Active worker states
 *   - Decision history
 *   - Replanner mutation history
 *   - Memory snapshot
 *   - Execution metadata
 *
 * Usage:
 *   import { ContextCheckpoint } from './context-checkpoint.mjs';
 *   const checkpoint = new ContextCheckpoint(plane);
 *   checkpoint.save({ workers: [...], decisions: [...] });
 *   const restored = checkpoint.restore();
 */

import fs from 'node:fs';
import path from 'node:path';

export class ContextCheckpoint {
  /**
   * @param {import('./control-plane.mjs').ControlPlane} plane
   * @param {object} [options]
   * @param {number} [options.maxCheckpoints=10] — Keep last N checkpoints
   * @param {string} [options.checkpointDir] — Directory for checkpoint files
   */
  constructor(plane, options = {}) {
    this.plane = plane;
    this.projectRoot = plane.projectRoot;
    this.maxCheckpoints = options.maxCheckpoints ?? 10;
    this.checkpointDir = options.checkpointDir || path.join(this.projectRoot, '.opencode', 'checkpoints');
    this._ensureDir();
  }

  /**
   * Save a checkpoint with extended context.
   *
   * @param {object} extra — Additional context to save
   * @returns {{ id, path, timestamp }}
   */
  save(extra = {}) {
    const state = this.plane.load();
    const id = `cp-${Date.now().toString(36)}`;
    const timestamp = new Date().toISOString();

    const checkpoint = {
      id,
      timestamp,
      missionId: state.missionId,
      projectRoot: this.projectRoot,
      // Snapshot the control plane state
      state: {
        goal: state.goal,
        mode: state.mode,
        status: state.status,
        tasks: state.tasks,
        evidence: state.evidence,
        failures: state.failures,
        events: state.events.slice(-50), // Last 50 events only
        decisions: (state.decisions || []).slice(-20),
        budgets: state.budgets,
      },
      // Extended context from runtime
      workers: extra.workers || [],
      decisions: extra.decisions || [],
      mutations: extra.mutations || [],
      memory: extra.memory || null,
      metadata: {
        savedAt: timestamp,
        taskCount: Object.keys(state.tasks).length,
        completedCount: Object.values(state.tasks).filter((t) => t.status === 'DONE').length,
        failedCount: Object.values(state.tasks).filter((t) => t.status === 'FAILED').length,
        version: '0.3.0',
      },
    };

    const filePath = path.join(this.checkpointDir, `${id}.json`);
    fs.writeFileSync(filePath, `${JSON.stringify(checkpoint, null, 2)}\n`);

    // Prune old checkpoints
    this._prune();

    return { id, path: filePath, timestamp };
  }

  /**
   * Restore the most recent checkpoint.
   *
   * @returns {object|null} — Checkpoint data or null if none
   */
  restore() {
    const files = this._listCheckpoints();
    if (files.length === 0) return null;

    const latest = files[files.length - 1];
    try {
      const data = JSON.parse(fs.readFileSync(latest.path, 'utf8'));
      return data;
    } catch {
      return null;
    }
  }

  /**
   * Restore a specific checkpoint by ID.
   *
   * @param {string} checkpointId
   * @returns {object|null}
   */
  restoreById(checkpointId) {
    const filePath = path.join(this.checkpointDir, `${checkpointId}.json`);
    if (!fs.existsSync(filePath)) return null;

    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      return null;
    }
  }

  /**
   * List all available checkpoints.
   *
   * @returns {Array<{ id, timestamp, path }>}
   */
  list() {
    return this._listCheckpoints().map((f) => {
      try {
        const data = JSON.parse(fs.readFileSync(f.path, 'utf8'));
        return {
          id: data.id,
          timestamp: data.timestamp,
          path: f.path,
          taskCount: data.metadata?.taskCount || 0,
          completedCount: data.metadata?.completedCount || 0,
        };
      } catch {
        return { id: f.name.replace('.json', ''), timestamp: null, path: f.path };
      }
    });
  }

  /**
   * Delete a specific checkpoint.
   *
   * @param {string} checkpointId
   * @returns {boolean}
   */
  delete(checkpointId) {
    const filePath = path.join(this.checkpointDir, `${checkpointId}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  }

  /**
   * Apply a checkpoint to the ControlPlane (restore state).
   *
   * @param {string} checkpointId
   * @returns {{ restored, tasks, evidence }}
   */
  apply(checkpointId) {
    const data = this.restoreById(checkpointId);
    if (!data) throw new Error(`Checkpoint not found: ${checkpointId}`);

    // Restore the control plane state
    const state = this.plane.load();
    Object.assign(state, data.state);
    state.updatedAt = new Date().toISOString();
    state.events.push({
      id: `event-${Date.now().toString(36)}`,
      at: new Date().toISOString(),
      type: 'checkpoint.restored',
      data: { checkpointId, timestamp: data.timestamp },
    });

    const temp = `${this.plane.stateFile}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`);
    fs.renameSync(temp, this.plane.stateFile);

    return {
      restored: true,
      tasks: Object.keys(state.tasks).length,
      evidence: state.evidence.length,
    };
  }

  // ─── Private ──────────────────────────────────────────────────────

  _ensureDir() {
    if (!fs.existsSync(this.checkpointDir)) {
      fs.mkdirSync(this.checkpointDir, { recursive: true });
    }
  }

  _listCheckpoints() {
    if (!fs.existsSync(this.checkpointDir)) return [];
    return fs.readdirSync(this.checkpointDir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f) => ({ name: f, path: path.join(this.checkpointDir, f) }));
  }

  _prune() {
    const files = this._listCheckpoints();
    if (files.length > this.maxCheckpoints) {
      const toDelete = files.slice(0, files.length - this.maxCheckpoints);
      for (const f of toDelete) {
        fs.unlinkSync(f.path);
      }
    }
  }
}
