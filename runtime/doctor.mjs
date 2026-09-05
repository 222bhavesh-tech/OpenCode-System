import fs from 'node:fs';
import path from 'node:path';

class Doctor {
  constructor(projectRoot) {
    this.projectRoot = path.resolve(projectRoot);
    this.dir = path.join(this.projectRoot, '.opencode-system');
  }

  /**
   * Run all diagnostic checks.
   */
  async runAll() {
    const checks = [
      this.checkProjectStructure(),
      this.checkStateFiles(),
      this.checkMemoryFiles(),
      this.checkCheckpointFiles(),
      this.checkConfigFiles(),
      this.checkDiskSpace(),
      this.checkDependencies(),
    ];
    return Promise.all(checks);
  }

  checkProjectStructure() {
    const exists = fs.existsSync(this.dir);
    return { name: 'project-structure', pass: exists, message: exists ? '.opencode-system exists' : '.opencode-system missing', severity: exists ? 'info' : 'error' };
  }

  checkStateFiles() {
    const stateFile = path.join(this.dir, 'state.json');
    const exists = fs.existsSync(stateFile);
    let valid = false;
    let details = '';
    if (exists) {
      try {
        const data = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        valid = !!(data && data.tasks);
        details = valid ? Object.keys(data.tasks).length + ' tasks' : 'Invalid state structure';
      } catch (e) {
        details = 'Corrupt state file: ' + e.message;
      }
    }
    return { name: 'state-files', pass: exists && valid, message: exists ? (valid ? 'State OK (' + details + ')' : 'State invalid: ' + details) : 'No state file', severity: exists && valid ? 'info' : 'warning' };
  }

  checkMemoryFiles() {
    const memDir = path.join(this.dir, 'memory');
    const exists = fs.existsSync(memDir);
    let count = 0;
    if (exists) {
      try { count = fs.readdirSync(memDir).filter(f => f.endsWith('.json')).length; } catch(e) { /* ignore */ }
    }
    return { name: 'memory-files', pass: true, message: exists ? count + ' memory files' : 'No memory directory', severity: 'info' };
  }

  checkCheckpointFiles() {
    const cpFile = path.join(this.dir, 'checkpoints.json');
    const exists = fs.existsSync(cpFile);
    return { name: 'checkpoint-files', pass: true, message: exists ? 'Checkpoints present' : 'No checkpoints', severity: 'info' };
  }

  checkConfigFiles() {
    const configFile = path.join(this.dir, 'config.json');
    const exists = fs.existsSync(configFile);
    return { name: 'config-files', pass: true, message: exists ? 'Config present' : 'No config (defaults)', severity: 'info' };
  }

  checkDiskSpace() {
    try {
      const stats = fs.statfsSync(this.projectRoot);
      const freeGB = (stats.bavail * stats.bsize) / (1024 * 1024 * 1024);
      return { name: 'disk-space', pass: freeGB > 1, message: freeGB.toFixed(2) + 'GB free', severity: freeGB > 1 ? 'info' : 'warning' };
    } catch(e) {
      return { name: 'disk-space', pass: true, message: 'Unable to check disk space', severity: 'info' };
    }
  }

  checkDependencies() {
    const pkgFile = path.join(this.projectRoot, 'package.json');
    if (!fs.existsSync(pkgFile)) return { name: 'dependencies', pass: true, message: 'No package.json (not a Node project)', severity: 'info' };
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
      const depCount = Object.keys(pkg.dependencies || {}).length;
      const devCount = Object.keys(pkg.devDependencies || {}).length;
      return { name: 'dependencies', pass: true, message: depCount + ' deps, ' + devCount + ' devDeps', severity: 'info' };
    } catch(e) {
      return { name: 'dependencies', pass: false, message: 'Corrupt package.json', severity: 'warning' };
    }
  }

  /**
   * Format diagnostic results.
   */
  format(results) {
    let output = '=== OpenCode System Diagnostics ===\n';
    let passCount = 0;
    let warnCount = 0;
    let errCount = 0;
    for (const r of results) {
      const icon = r.pass ? (r.severity === 'warning' ? '⚠' : '✓') : '✗';
      output += icon + ' ' + r.name + ': ' + r.message + '\n';
      if (r.pass && r.severity !== 'warning') passCount++;
      else if (r.severity === 'warning') warnCount++;
      else errCount++;
    }
    output += '\nSummary: ' + passCount + ' passed, ' + warnCount + ' warnings, ' + errCount + ' errors';
    return output;
  }
}

export { Doctor };