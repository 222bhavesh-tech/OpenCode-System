/**
 * StateMachine — idempotent state transitions, guard conditions, audit trail.
 *
 * Provides:
 *   - Strict state transition enforcement
 *   - Guard conditions (prevent invalid transitions)
 *   - Idempotent operations (safe to retry)
 *   - Transition audit trail
 *   - Rollback support
 *   - State validation
 */

import crypto from 'node:crypto';

export class StateMachine {
  /**
   * @param {object} states        Map of state name → allowed transitions
   * @param {string} initialState  Starting state
   * @param {object} [options]
   * @param {boolean} [options.auditTrail=true]
   * @param {number} [options.maxHistory=100]
   */
  constructor(states, initialState, options = {}) {
    this._states = states; // { PENDING: ['IN_PROGRESS', 'CANCELLED'], ... }
    this._state = initialState;
    this._history = [];
    this._auditTrail = options.auditTrail !== false;
    this._maxHistory = options.maxHistory ?? 100;
    this._guards = new Map(); // "from->to" → guard function

    // Record initial state in history for rollback support
    if (this._auditTrail) {
      this._history.push({
        id: 'init',
        timestamp: new Date().toISOString(),
        type: 'INIT',
        from: null,
        to: initialState,
        context: {},
      });
    }
  }

  /**
   * Get current state.
   */
  get state() {
    return this._state;
  }

  /**
   * Get transition history.
   */
  get history() {
    return [...this._history];
  }

  // ─── Transitions ─────────────────────────────────────────────────

  /**
   * Attempt a state transition.
   * Returns { success, from, to, error }
   */
  transition(to, context = {}) {
    const from = this._state;

    // Check if transition is allowed
    const allowed = this._states[from];
    if (!allowed || !allowed.includes(to)) {
      const error = `Invalid transition: ${from} → ${to}`;
      if (this._auditTrail) {
        this._record({ type: 'INVALID', from, to, error, context });
      }
      return { success: false, from, to, error };
    }

    // Check guard condition
    const guardKey = `${from}->${to}`;
    const guard = this._guards.get(guardKey);
    if (guard) {
      const guardResult = guard(context);
      if (guardResult !== true) {
        const error = `Guard rejected: ${guardResult || 'condition not met'}`;
        if (this._auditTrail) {
          this._record({ type: 'GUARD_REJECTED', from, to, error, context });
        }
        return { success: false, from, to, error };
      }
    }

    // Perform transition
    this._state = to;

    if (this._auditTrail) {
      this._record({ type: 'TRANSITION', from, to, context });
    }

    return { success: true, from, to, error: null };
  }

  /**
   * Force a transition (bypasses guard conditions).
   * Use only for recovery/rollback.
   */
  forceTransition(to, reason = 'force') {
    const from = this._state;
    this._state = to;

    if (this._auditTrail) {
      this._record({ type: 'FORCE', from, to, reason });
    }

    return { success: true, from, to };
  }

  // ─── Guards ──────────────────────────────────────────────────────

  /**
   * Add a guard condition for a transition.
   * Guard function returns true to allow, or error string to reject.
   */
  addGuard(from, to, guardFn) {
    const key = `${from}->${to}`;
    this._guards.set(key, guardFn);
  }

  /**
   * Remove a guard condition.
   */
  removeGuard(from, to) {
    const key = `${from}->${to}`;
    this._guards.delete(key);
  }

  // ─── Queries ─────────────────────────────────────────────────────

  /**
   * Get all allowed transitions from current state.
   */
  allowedTransitions() {
    return this._states[this._state] || [];
  }

  /**
   * Check if a transition is allowed.
   */
  canTransition(to) {
    const allowed = this._states[this._state];
    return allowed && allowed.includes(to);
  }

  /**
   * Check if state is terminal (no outgoing transitions).
   */
  isTerminal() {
    const allowed = this._states[this._state];
    return !allowed || allowed.length === 0;
  }

  /**
   * Get state definition.
   */
  getStateDef(state) {
    return this._states[state] || null;
  }

  // ─── Rollback ────────────────────────────────────────────────────

  /**
   * Rollback to a previous state.
   * Only works if the target state exists in history.
   */
  rollback(targetState) {
    const entry = this._history.findLast(h => h.to === targetState);
    if (!entry) {
      return { success: false, error: `State ${targetState} not found in history` };
    }

    const from = this._state;
    this._state = targetState;

    if (this._auditTrail) {
      this._record({ type: 'ROLLBACK', from, to: targetState, historyId: entry.id });
    }

    return { success: true, from, to: targetState };
  }

  // ─── Validation ──────────────────────────────────────────────────

  /**
   * Validate that the state machine is in a valid state.
   */
  validate() {
    if (!this._states[this._state]) {
      return { valid: false, error: `Unknown state: ${this._state}` };
    }

    // Check for unreachable states
    const reachable = new Set();
    const queue = [this._state];
    while (queue.length > 0) {
      const current = queue.shift();
      if (reachable.has(current)) continue;
      reachable.add(current);
      const transitions = this._states[current] || [];
      for (const next of transitions) {
        if (!reachable.has(next)) queue.push(next);
      }
    }

    const allStates = Object.keys(this._states);
    const unreachable = allStates.filter(s => !reachable.has(s));

    return {
      valid: true,
      unreachable: unreachable.length > 0 ? unreachable : null,
    };
  }

  // ─── Audit Trail ─────────────────────────────────────────────────

  /**
   * Get audit trail.
   */
  auditTrail(count = 50) {
    return this._history.slice(-count);
  }

  _record(entry) {
    const record = {
      id: crypto.randomUUID().slice(0, 12),
      timestamp: new Date().toISOString(),
      ...entry,
    };
    this._history.push(record);
    if (this._history.length > this._maxHistory) {
      this._history = this._history.slice(-this._maxHistory);
    }
  }
}

// ─── Pre-defined State Machines ─────────────────────────────────────

/**
 * Task state machine: PENDING → IN_PROGRESS → COMPLETE | FAILED | CANCELLED
 */
export function createTaskStateMachine(initialState = 'PENDING') {
  return new StateMachine({
    PENDING: ['IN_PROGRESS', 'CANCELLED'],
    IN_PROGRESS: ['COMPLETE', 'FAILED', 'CANCELLED'],
    BLOCKED: ['IN_PROGRESS', 'CANCELLED'],
    FAILED: ['PENDING', 'CANCELLED'],  // Retry goes back to PENDING
    COMPLETE: [],
    CANCELLED: [],
  }, initialState);
}

/**
 * Mission state machine: PLANNING → EXECUTING → COMPLETE | BLOCKED | CANCELLED
 */
export function createMissionStateMachine(initialState = 'PLANNING') {
  return new StateMachine({
    PLANNING: ['EXECUTING', 'CANCELLED'],
    EXECUTING: ['COMPLETE', 'BLOCKED', 'CANCELLED', 'PAUSED'],
    BLOCKED: ['EXECUTING', 'CANCELLED'],
    PAUSED: ['EXECUTING', 'CANCELLED'],
    COMPLETE: [],
    CANCELLED: [],
  }, initialState);
}
