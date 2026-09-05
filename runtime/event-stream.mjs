import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';

const EVENT_TYPE = Object.freeze({
  // Mission events
  MISSION_CREATED: 'MISSION_CREATED',
  MISSION_STARTED: 'MISSION_STARTED',
  MISSION_PAUSED: 'MISSION_PAUSED',
  MISSION_RESUMED: 'MISSION_RESUMED',
  MISSION_COMPLETED: 'MISSION_COMPLETED',
  MISSION_FAILED: 'MISSION_FAILED',
  MISSION_BLOCKED: 'MISSION_BLOCKED',

  // Task events
  TASK_ADDED: 'TASK_ADDED',
  TASK_STARTED: 'TASK_STARTED',
  TASK_COMPLETED: 'TASK_COMPLETED',
  TASK_FAILED: 'TASK_FAILED',
  TASK_BLOCKED: 'TASK_BLOCKED',
  TASK_RETRY: 'TASK_RETRY',

  // Worker events
  WORKER_SPAWNED: 'WORKER_SPAWNED',
  WORKER_STARTED: 'WORKER_STARTED',
  WORKER_PAUSED: 'WORKER_PAUSED',
  WORKER_RESUMED: 'WORKER_RESUMED',
  WORKER_COMPLETED: 'WORKER_COMPLETED',
  WORKER_FAILED: 'WORKER_FAILED',
  WORKER_CANCELLED: 'WORKER_CANCELLED',
  WORKER_TIMEOUT: 'WORKER_TIMEOUT',
  WORKER_DEGRADED: 'WORKER_DEGRADED',
  WORKER_HEARTBEAT: 'WORKER_HEARTBEAT',

  // Decision events
  DECISION_MADE: 'DECISION_MADE',
  DECISION_ESCALATED: 'DECISION_ESCALATED',

  // Execution events
  EXECUTION_STARTED: 'EXECUTION_STARTED',
  EXECUTION_COMPLETED: 'EXECUTION_COMPLETED',
  EXECUTION_FAILED: 'EXECUTION_FAILED',

  // Verification events
  VERIFICATION_STARTED: 'VERIFICATION_STARTED',
  VERIFICATION_PASSED: 'VERIFICATION_PASSED',
  VERIFICATION_FAILED: 'VERIFICATION_FAILED',

  // Evidence events
  EVIDENCE_RECORDED: 'EVIDENCE_RECORDED',
  EVIDENCE_REJECTED: 'EVIDENCE_REJECTED',

  // Failure events
  FAILURE_RECORDED: 'FAILURE_RECORDED',
  FAILURE_CLASSIFIED: 'FAILURE_CLASSIFIED',
  RECOVERY_ATTEMPTED: 'RECOVERY_ATTEMPTED',
  RECOVERY_SUCCEEDED: 'RECOVERY_SUCCEEDED',
  RECOVERY_FAILED: 'RECOVERY_FAILED',

  // Checkpoint events
  CHECKPOINT_SAVED: 'CHECKPOINT_SAVED',
  CHECKPOINT_RESTORED: 'CHECKPOINT_RESTORED',

  // Context events
  CONTEXT_ROTATED: 'CONTEXT_ROTATED',
  CONTEXT_SNAPSHOT: 'CONTEXT_SNAPSHOT',

  // System events
  SYSTEM_ERROR: 'SYSTEM_ERROR',
  SYSTEM_WARNING: 'SYSTEM_WARNING',
});

class EventStream extends EventEmitter {
  constructor(options) {
    super();
    options = options || {};
    this.maxEvents = options.maxEvents || 1000;
    this.events = [];
    this.listeners = new Map();
    this._filters = options.filters || null;
  }

  /**
   * Emit a structured event.
   */
  emit(type, data) {
    const event = {
      id: 'evt-' + crypto.randomUUID().slice(0, 12),
      type: type,
      timestamp: new Date().toISOString(),
      data: data || {},
      severity: this._getSeverity(type),
    };

    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    // Apply filters if any
    if (this._filters && !this._matchesFilter(event)) {
      return true;
    }

    super.emit(type, event);
    super.emit('event', event); // Global listener
    return true;
  }

  /**
   * Subscribe to events with optional filtering.
   */
  subscribe(eventTypes, callback) {
    const id = 'sub-' + crypto.randomUUID().slice(0, 8);
    const types = Array.isArray(eventTypes) ? eventTypes : [eventTypes];

    for (const type of types) {
      super.on(type, callback);
    }

    this.listeners.set(id, { types: types, callback: callback });
    return id;
  }

  /**
   * Unsubscribe from events.
   */
  unsubscribe(subscriptionId) {
    const sub = this.listeners.get(subscriptionId);
    if (sub) {
      for (const type of sub.types) {
        super.removeListener(type, sub.callback);
      }
      this.listeners.delete(subscriptionId);
      return true;
    }
    return false;
  }

  /**
   * Get events by type.
   */
  getByType(type, limit) {
    return this.events.filter(e => e.type === type).slice(-(limit || 50));
  }

  /**
   * Get recent events.
   */
  recent(limit) {
    return this.events.slice(-(limit || 20));
  }

  /**
   * Get events in a time range.
   */
  inRange(startTime, endTime) {
    return this.events.filter(e => {
      const t = new Date(e.timestamp);
      return t >= new Date(startTime) && t <= new Date(endTime);
    });
  }

  /**
   * Get event statistics.
   */
  stats() {
    const byType = {};
    const bySeverity = {};
    for (const e of this.events) {
      byType[e.type] = (byType[e.type] || 0) + 1;
      bySeverity[e.severity] = (bySeverity[e.severity] || 0) + 1;
    }
    return { total: this.events.length, byType: byType, bySeverity: bySeverity, subscriptions: this.listeners.size };
  }

  /**
   * Clear all events.
   */
  clear() {
    this.events = [];
  }

  // ─── Private ──────────────────────────────────────────────────────

  _getSeverity(type) {
    if (type.includes('FAILED') || type.includes('ERROR') || type.includes('TIMEOUT')) return 'error';
    if (type.includes('WARNING') || type.includes('DEGRADED') || type.includes('BLOCKED')) return 'warning';
    if (type.includes('COMPLETED') || type.includes('PASSED') || type.includes('SUCCEEDED')) return 'success';
    return 'info';
  }

  _matchesFilter(event) {
    if (!this._filters) return true;
    if (this._filters.types && !this._filters.types.includes(event.type)) return false;
    if (this._filters.severity && event.severity !== this._filters.severity) return false;
    return true;
  }
}

export { EVENT_TYPE, EventStream };