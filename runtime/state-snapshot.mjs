import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

class StateSnapshot {
  constructor(projectRoot) {
    this.projectRoot = path.resolve(projectRoot);
    this.dir = path.join(this.projectRoot, '.opencode-system');
    this.snapshotsDir = path.join(this.dir, 'snapshots');
    this.maxSnapshots = 20;
  }

  /**
   * Save a full state snapshot.
   */
  save(label) {
    const stateFile = path.join(this.dir, 'state.json');
    if (!fs.existsSync(stateFile)) return null;
    fs.mkdirSync(this.snapshotsDir, { recursive: true });
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    const snapshot = {
      id: 'snap-' + crypto.randomUUID().slice(0, 8),
      label: label || 'manual',
      state: state,
      createdAt: new Date().toISOString(),
      stateHash: crypto.createHash('sha256').update(JSON.stringify(state)).digest('hex').slice(0, 12),
    };
    const snapshotFile = path.join(this.snapshotsDir, snapshot.id + '.json');
    fs.writeFileSync(snapshotFile, JSON.stringify(snapshot, null, 2));
    this._cleanup();
    return { id: snapshot.id, label: snapshot.label, stateHash: snapshot.stateHash, createdAt: snapshot.createdAt };
  }

  /**
   * List all snapshots.
   */
  list() {
    if (!fs.existsSync(this.snapshotsDir)) return [];
    return fs.readdirSync(this.snapshotsDir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const data = JSON.parse(fs.readFileSync(path.join(this.snapshotsDir, f), 'utf8'));
        return { id: data.id, label: data.label, stateHash: data.stateHash, createdAt: data.createdAt, taskCount: Object.keys(data.state.tasks || {}).length };
      })
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /**
   * Get a snapshot by ID.
   */
  get(snapshotId) {
    const snapshotFile = path.join(this.snapshotsDir, snapshotId + '.json');
    if (!fs.existsSync(snapshotFile)) return null;
    return JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
  }

  /**
   * Restore state from a snapshot.
   */
  restore(snapshotId) {
    const snapshot = this.get(snapshotId);
    if (!snapshot) return null;
    const stateFile = path.join(this.dir, 'state.json');
    const temp = stateFile + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(snapshot.state, null, 2));
    fs.renameSync(temp, stateFile);
    return { restored: snapshotId, taskCount: Object.keys(snapshot.state.tasks || {}).length };
  }

  /**
   * Delete a snapshot.
   */
  delete(snapshotId) {
    const snapshotFile = path.join(this.snapshotsDir, snapshotId + '.json');
    if (fs.existsSync(snapshotFile)) {
      fs.unlinkSync(snapshotFile);
      return { deleted: snapshotId };
    }
    return null;
  }

  _cleanup() {
    const snapshots = this.list();
    if (snapshots.length > this.maxSnapshots) {
      const toDelete = snapshots.slice(0, snapshots.length - this.maxSnapshots);
      for (const s of toDelete) {
        const f = path.join(this.snapshotsDir, s.id + '.json');
        if (fs.existsSync(f)) fs.unlinkSync(f);
      }
    }
  }
}

export { StateSnapshot };