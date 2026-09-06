/**
 * MissionRecovery — durable mission state, resume across process restarts.
 *
 * Provides:
 *   - Mission state persistence (survives process crash)
 *   - Checkpoint creation and restoration
 *   - Task progress tracking
 *   - Worker cleanup on recovery
 *   - Mission timeline reconstruction
 *
 * Integrates with ControlPlane for state and CrashSafeControlPlane for recovery.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export class MissionRecovery {
  /**
   * @param {import('./control-plane.mjs').ControlPlane} plane
   * @param {object} [options]
   * @param {string} [options.recoveryDir]       Directory for recovery files
   * @param {number} [options.maxCheckpoints=50] Max checkpoints to keep
   * @param {number} [options.maxTimelineEntries=1000] Max timeline entries
   */
  constructor(plane, options = {}) {
    this.plane = plane;
    this.recoveryDir = options.recoveryDir || path.join(plane.dir, 'recovery');
    this.maxCheckpoints = options.maxCheckpoints ?? 50;
    this.maxTimelineEntries = options.maxTimelineEntries ?? 1000;

    this._timelineFile = path.join(this.recoveryDir, 'timeline.jsonl');
    this._missionStateFile = path.join(this.recoveryDir, 'mission-state.json');
    this._workerStateFile = path.join(this.recoveryDir, 'worker-state.json');

    fs.mkdirSync(this.recoveryDir, { recursive: true });
  }

  // ─── Mission State ───────────────────────────────────────────────

  /**
   * Save mission state for crash recovery.
   */
  saveMissionState(missionData) {
    const state = {
      ...missionData,
      updatedAt: new Date().toISOString(),
      checksum: this._checksum(missionData),
    };
    fs.writeFileSync(this._missionStateFile, JSON.stringify(state, null, 2));
    return state;
  }

  /**
   * Load mission state from recovery.
   * Returns null if no state exists or state is corrupted.
   */
  loadMissionState() {
    if (!fs.existsSync(this._missionStateFile)) return null;
    try {
      const state = JSON.parse(fs.readFileSync(this._missionStateFile, 'utf8'));
      // Verify checksum
      const expected = this._checksum({ ...state, checksum: undefined, updatedAt: undefined });
      if (state.checksum && state.checksum !== expected) {
        return null; // Corrupted
      }
      return state;
    } catch (e) {
      return null;
    }
  }

  /**
   * Clear mission state (after successful completion).
   */
  clearMissionState() {
    try {
      if (fs.existsSync(this._missionStateFile)) fs.unlinkSync(this._missionStateFile);
      if (fs.existsSync(this._workerStateFile)) fs.unlinkSync(this._workerStateFile);
    } catch (e) {
      // Non-fatal
    }
  }

  // ─── Checkpoints ─────────────────────────────────────────────────

  /**
   * Create a checkpoint with full state snapshot.
   */
  createCheckpoint(summary, data = {}) {
    const checkpoint = {
      id: `cp-${crypto.randomUUID().slice(0, 12)}`,
      timestamp: new Date().toISOString(),
      summary,
      tasks: data.tasks || {},
      evidence: data.evidence || [],
      failures: data.failures || [],
      events: (data.events || []).slice(-100), // Keep last 100 events
      metadata: data.metadata || {},
    };

    const cpFile = path.join(this.recoveryDir, `checkpoint-${checkpoint.id}.json`);
    fs.writeFileSync(cpFile, JSON.stringify(checkpoint, null, 2));

    // Add to timeline
    this._appendTimeline({
      type: 'checkpoint',
      checkpointId: checkpoint.id,
      summary,
    });

    // Cleanup old checkpoints
    this._cleanupCheckpoints();

    return checkpoint;
  }

  /**
   * List all checkpoints.
   */
  listCheckpoints() {
    const files = fs.readdirSync(this.recoveryDir).filter(f => f.startsWith('checkpoint-') && f.endsWith('.json'));
    return files.map(f => {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(this.recoveryDir, f), 'utf8'));
        return { id: data.id, timestamp: data.timestamp, summary: data.summary };
      } catch (e) {
        return null;
      }
    }).filter(Boolean).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  /**
   * Load a specific checkpoint.
   */
  loadCheckpoint(checkpointId) {
    const cpFile = path.join(this.recoveryDir, `checkpoint-${checkpointId}.json`);
    if (!fs.existsSync(cpFile)) return null;
    try {
      return JSON.parse(fs.readFileSync(cpFile, 'utf8'));
    } catch (e) {
      return null;
    }
  }

  /**
   * Restore from the latest checkpoint.
   */
  restoreLatestCheckpoint() {
    const checkpoints = this.listCheckpoints();
    if (checkpoints.length === 0) return null;
    return this.loadCheckpoint(checkpoints[checkpoints.length - 1].id);
  }

  // ─── Timeline ────────────────────────────────────────────────────

  /**
   * Append an event to the mission timeline.
   */
  appendTimeline(event) {
    this._appendTimeline(event);
  }

  /**
   * Get the mission timeline.
   */
  getTimeline(count = 100) {
    if (!fs.existsSync(this._timelineFile)) return [];
    const lines = fs.readFileSync(this._timelineFile, 'utf8').split('\n').filter(Boolean);
    return lines.slice(-count).map(line => {
      try { return JSON.parse(line); } catch (e) { return null; }
    }).filter(Boolean);
  }

  // ─── Worker State ────────────────────────────────────────────────

  /**
   * Save worker state for crash recovery.
   */
  saveWorkerState(workers) {
    const state = {
      workers: Array.from(workers.entries()).map(([id, record]) => ({
        id,
        taskId: record.taskId,
        pid: record.pid,
        state: record.state,
        startedAt: record.createdAt,
      })),
      savedAt: new Date().toISOString(),
    };
    fs.writeFileSync(this._workerStateFile, JSON.stringify(state, null, 2));
  }

  /**
   * Load worker state from recovery.
   */
  loadWorkerState() {
    if (!fs.existsSync(this._workerStateFile)) return null;
    try {
      return JSON.parse(fs.readFileSync(this._workerStateFile, 'utf8'));
    } catch (e) {
      return null;
    }
  }

  // ─── Recovery Decision ───────────────────────────────────────────

  /**
   * Determine if a mission can be recovered.
   * Returns { recoverable, reason, data }
   */
  assessRecovery() {
    const state = this.loadMissionState();
    const checkpoint = this.restoreLatestCheckpoint();
    const workers = this.loadWorkerState();

    if (!state && !checkpoint) {
      return { recoverable: false, reason: 'No mission state or checkpoints found' };
    }

    // Check for stale workers (likely crashed)
    let staleWorkers = [];
    if (workers && workers.workers) {
      staleWorkers = workers.workers.filter(w => w.state === 'RUNNING');
    }

    return {
      recoverable: true,
      reason: 'Mission state available',
      data: { missionState: state, checkpoint, staleWorkers },
    };
  }

  // ─── Internal ────────────────────────────────────────────────────

  _appendTimeline(event) {
    const entry = {
      ...event,
      timestamp: new Date().toISOString(),
      pid: process.pid,
    };
    fs.appendFileSync(this._timelineFile, JSON.stringify(entry) + '\n');
    this._trimTimeline();
  }

  _trimTimeline() {
    if (!fs.existsSync(this._timelineFile)) return;
    const lines = fs.readFileSync(this._timelineFile, 'utf8').split('\n').filter(Boolean);
    if (lines.length > this.maxTimelineEntries) {
      const trimmed = lines.slice(-this.maxTimelineEntries);
      fs.writeFileSync(this._timelineFile, trimmed.join('\n') + '\n');
    }
  }

  _cleanupCheckpoints() {
    const files = fs.readdirSync(this.recoveryDir).filter(f => f.startsWith('checkpoint-') && f.endsWith('.json'));
    if (files.length > this.maxCheckpoints) {
      const toDelete = files.sort().slice(0, files.length - this.maxCheckpoints);
      for (const f of toDelete) {
        try { fs.unlinkSync(path.join(this.recoveryDir, f)); } catch (e) {}
      }
    }
  }

  _checksum(data) {
    const str = JSON.stringify(data);
    return crypto.createHash('sha256').update(str).digest('hex').slice(0, 16);
  }
}
