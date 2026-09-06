/**
 * MissionTimeline — visual timeline, event correlation, duration tracking.
 *
 * Provides:
 *   - Mission-level timeline of all events
 *   - Event correlation (link events across components)
 *   - Duration tracking (how long each phase took)
 *   - Visual timeline rendering (text-based)
 *   - Export for diagnostics
 */

import fs from 'node:fs';
import path from 'node:path';

export class MissionTimeline {
  /**
   * @param {string} [outputDir]
   */
  constructor(outputDir) {
    this.outputDir = outputDir;
    this._events = [];
    this._phases = new Map();
    this._correlations = new Map(); // correlationId → [events]
  }

  // ─── Event Recording ─────────────────────────────────────────────

  /**
   * Record a timeline event.
   */
  record(event) {
    const entry = {
      id: `evt-${this._events.length + 1}`,
      timestamp: new Date().toISOString(),
      type: event.type || 'unknown',
      source: event.source || 'system',
      message: event.message || '',
      data: event.data || {},
      correlationId: event.correlationId || null,
      duration: event.duration || null,
      status: event.status || 'ok',
    };

    this._events.push(entry);

    // Track correlations
    if (entry.correlationId) {
      if (!this._correlations.has(entry.correlationId)) {
        this._correlations.set(entry.correlationId, []);
      }
      this._correlations.get(entry.correlationId).push(entry);
    }

    return entry;
  }

  /**
   * Start a phase (for duration tracking).
   */
  startPhase(name, metadata = {}) {
    this._phases.set(name, {
      name,
      startedAt: Date.now(),
      startedAtISO: new Date().toISOString(),
      metadata,
    });
    this.record({ type: 'phase:start', source: name, message: `Phase ${name} started`, data: metadata });
  }

  /**
   * End a phase.
   */
  endPhase(name, result = {}) {
    const phase = this._phases.get(name);
    if (!phase) return null;

    const duration = Date.now() - phase.startedAt;
    const entry = this.record({
      type: 'phase:end',
      source: name,
      message: `Phase ${name} completed (${duration}ms)`,
      duration,
      data: { ...phase.metadata, ...result },
    });

    this._phases.delete(name);
    return entry;
  }

  // ─── Queries ─────────────────────────────────────────────────────

  /**
   * Get all events.
   */
  all() {
    return [...this._events];
  }

  /**
   * Get events of a specific type.
   */
  byType(type) {
    return this._events.filter(e => e.type === type);
  }

  /**
   * Get events from a specific source.
   */
  bySource(source) {
    return this._events.filter(e => e.source === source);
  }

  /**
   * Get events correlated by a correlation ID.
   */
  byCorrelation(correlationId) {
    return this._correlations.get(correlationId) || [];
  }

  /**
   * Get events in a time range.
   */
  byTimeRange(start, end) {
    return this._events.filter(e => {
      const t = new Date(e.timestamp).getTime();
      return t >= start && t <= end;
    });
  }

  /**
   * Get duration statistics.
   */
  durations() {
    const phases = [];
    const correlations = [];

    // Phase durations
    for (const [name, phase] of this._phases) {
      phases.push({
        name,
        startedAt: phase.startedAtISO,
        elapsed: Date.now() - phase.startedAt,
      });
    }

    // Correlation durations
    for (const [corrId, events] of this._correlations) {
      if (events.length >= 2) {
        const start = new Date(events[0].timestamp).getTime();
        const end = new Date(events[events.length - 1].timestamp).getTime();
        correlations.push({
          correlationId: corrId,
          events: events.length,
          duration: end - start,
        });
      }
    }

    return { phases, correlations, totalEvents: this._events.length };
  }

  // ─── Rendering ───────────────────────────────────────────────────

  /**
   * Render a text-based timeline.
   */
  render(options = {}) {
    const maxEvents = options.maxEvents ?? 50;
    const events = this._events.slice(-maxEvents);
    const lines = [];

    lines.push('╔══════════════════════════════════════════════════════════════╗');
    lines.push('║                    MISSION TIMELINE                         ║');
    lines.push('╚══════════════════════════════════════════════════════════════╝');
    lines.push('');

    for (const event of events) {
      const time = event.timestamp.slice(11, 19);
      const type = event.type.padEnd(20);
      const source = event.source.padEnd(12);
      const duration = event.duration ? ` (${event.duration}ms)` : '';
      const status = event.status === 'error' ? ' ❌' : '';

      lines.push(`  ${time} │ ${type} │ ${source} │ ${event.message}${duration}${status}`);
    }

    lines.push('');
    lines.push(`  Total events: ${this._events.length}`);

    return lines.join('\n');
  }

  // ─── Export ──────────────────────────────────────────────────────

  /**
   * Export timeline to file.
   */
  export(format = 'json') {
    if (!this.outputDir) return null;
    fs.mkdirSync(this.outputDir, { recursive: true });

    const filename = `timeline-${Date.now()}.${format}`;
    const filepath = path.join(this.outputDir, filename);

    if (format === 'json') {
      fs.writeFileSync(filepath, JSON.stringify({
        events: this._events,
        durations: this.durations(),
        exportedAt: new Date().toISOString(),
      }, null, 2));
    } else if (format === 'text') {
      fs.writeFileSync(filepath, this.render());
    }

    return filepath;
  }
}
