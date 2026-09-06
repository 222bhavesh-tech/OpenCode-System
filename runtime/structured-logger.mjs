/**
 * StructuredLogger — levels, correlation IDs, mission timeline, audit trail.
 *
 * Provides:
 *   - DEBUG / INFO / WARN / ERROR / FATAL levels
 *   - Correlation IDs for tracing across components
 *   - Mission timeline events
 *   - Audit trail for security-sensitive operations
 *   - Structured JSON output for machine consumption
 *   - Human-readable output for terminal display
 *
 * Does NOT log: secrets, API keys, tokens, passwords, credentials.
 */

import fs from 'node:fs';
import path from 'node:path';

const LOG_LEVELS = Object.freeze({ DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3, FATAL: 4 });

export class StructuredLogger {
  /**
   * @param {string} [logDir]     Directory for log files
   * @param {string} [level]      Minimum level to log
   * @param {object} [options]
   * @param {boolean} [options.console=true]   Log to console
   * @param {boolean} [options.file=true]      Log to file
   * @param {number} [options.maxFileSizeMb=10] Max file size before rotation
   * @param {number} [options.maxFiles=5]      Max rotated files
   */
  constructor(logDir, level = 'INFO', options = {}) {
    this.logDir = logDir;
    this.level = LOG_LEVELS[level] ?? LOG_LEVELS.INFO;
    this.console = options.console ?? true;
    this.file = options.file ?? true;
    this.maxFileSizeMb = options.maxFileSizeMb ?? 10;
    this.maxFiles = options.maxFiles ?? 5;
    this._correlationId = null;
    this._missionId = null;

    if (this.logDir) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  // ─── Context ─────────────────────────────────────────────────────

  /**
   * Set correlation ID for request tracing.
   */
  setCorrelationId(id) {
    this._correlationId = id;
  }

  /**
   * Set mission ID for mission-scoped logging.
   */
  setMissionId(id) {
    this._missionId = id;
  }

  /**
   * Clear correlation context.
   */
  clearContext() {
    this._correlationId = null;
    this._missionId = null;
  }

  // ─── Logging ─────────────────────────────────────────────────────

  debug(message, data = {}) {
    this._log('DEBUG', message, data);
  }

  info(message, data = {}) {
    this._log('INFO', message, data);
  }

  warn(message, data = {}) {
    this._log('WARN', message, data);
  }

  error(message, data = {}) {
    this._log('ERROR', message, data);
  }

  fatal(message, data = {}) {
    this._log('FATAL', message, data);
  }

  // ─── Specialized Logging ─────────────────────────────────────────

  /**
   * Log a mission timeline event.
   */
  missionEvent(type, data = {}) {
    this._log('INFO', `MISSION:${type}`, { ...data, timeline: true });
  }

  /**
   * Log an audit trail entry (security-sensitive operations).
   */
  audit(action, data = {}) {
    // Redact sensitive fields
    const redacted = this._redactSensitive(data);
    this._log('INFO', `AUDIT:${action}`, { ...redacted, audit: true });
  }

  /**
   * Log a task lifecycle event.
   */
  taskEvent(taskId, event, data = {}) {
    this._log('INFO', `TASK:${event}`, { taskId, ...data });
  }

  /**
   * Log a worker lifecycle event.
   */
  workerEvent(workerId, event, data = {}) {
    this._log('INFO', `WORKER:${event}`, { workerId, ...data });
  }

  // ─── Query ───────────────────────────────────────────────────────

  /**
   * Read recent log entries.
   */
  recent(count = 100) {
    if (!this.logDir) return [];
    const logFile = path.join(this.logDir, 'system.log');
    if (!fs.existsSync(logFile)) return [];

    const content = fs.readFileSync(logFile, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    return lines.slice(-count).map(line => {
      try { return JSON.parse(line); } catch (e) { return { raw: line }; }
    });
  }

  /**
   * Search log entries by correlation ID.
   */
  byCorrelation(correlationId) {
    return this.recent(10000).filter(entry => entry.correlationId === correlationId);
  }

  /**
   * Search log entries by mission ID.
   */
  byMission(missionId) {
    return this.recent(10000).filter(entry => entry.missionId === missionId);
  }

  // ─── Internal ────────────────────────────────────────────────────

  _log(level, message, data = {}) {
    if (LOG_LEVELS[level] < this.level) return;

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...data,
    };

    if (this._correlationId) entry.correlationId = this._correlationId;
    if (this._missionId) entry.missionId = this._missionId;
    if (process.pid) entry.pid = process.pid;

    // Console output
    if (this.console) {
      this._writeConsole(level, message, entry);
    }

    // File output
    if (this.file && this.logDir) {
      this._writeFile(entry);
    }
  }

  _writeConsole(level, message, entry) {
    const colors = { DEBUG: '\x1b[90m', INFO: '\x1b[36m', WARN: '\x1b[33m', ERROR: '\x1b[31m', FATAL: '\x1b[35m' };
    const reset = '\x1b[0m';
    const prefix = this._correlationId ? `[${this._correlationId.slice(0, 8)}] ` : '';
    console.log(`${colors[level] || ''}${prefix}${message}${reset}`);
  }

  _writeFile(entry) {
    const logFile = path.join(this.logDir, 'system.log');
    try {
      // Rotate if needed
      if (fs.existsSync(logFile)) {
        const stats = fs.statSync(logFile);
        if (stats.size > this.maxFileSizeMb * 1024 * 1024) {
          this._rotate(logFile);
        }
      }
      fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
    } catch (e) {
      // Log file write failure is non-fatal
    }
  }

  _rotate(logFile) {
    for (let i = this.maxFiles - 1; i > 0; i--) {
      const from = `${logFile}.${i}`;
      const to = `${logFile}.${i + 1}`;
      if (fs.existsSync(from)) {
        if (i === this.maxFiles - 1) fs.unlinkSync(from);
        else fs.renameSync(from, to);
      }
    }
    if (fs.existsSync(logFile)) fs.renameSync(logFile, `${logFile}.1`);
  }

  _redactSensitive(data) {
    const redacted = { ...data };
    const sensitiveKeys = ['password', 'secret', 'token', 'apiKey', 'api_key', 'authorization', 'credential'];

    for (const key of Object.keys(redacted)) {
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk.toLowerCase()))) {
        redacted[key] = '[REDACTED]';
      }
      // Redact nested objects
      if (typeof redacted[key] === 'object' && redacted[key] !== null) {
        redacted[key] = this._redactSensitive(redacted[key]);
      }
    }

    return redacted;
  }
}
