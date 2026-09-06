/**
 * NetworkResilience — retry, circuit breaker, model/tool failure recovery.
 *
 * Provides:
 *   - Exponential backoff with jitter
 *   - Circuit breaker pattern (open/half-open/closed)
 *   - Model failure recovery (fallback, retry, degrade)
 *   - Tool failure recovery (retry, skip, alternative)
 *   - Network timeout handling
 *   - Connection pool management
 */

import { EventEmitter } from 'node:events';

const CIRCUIT_STATES = Object.freeze({
  CLOSED: 'CLOSED',       // Normal operation
  OPEN: 'OPEN',           // Failing, reject requests
  HALF_OPEN: 'HALF_OPEN', // Testing if recovered
});

export class NetworkResilience extends EventEmitter {
  /**
   * @param {object} [options]
   * @param {number} [options.maxRetries=3]
   * @param {number} [options.baseDelayMs=1000]
   * @param {number} [options.maxDelayMs=30000]
   * @param {number} [options.circuitBreakerThreshold=5]  Failures before opening circuit
   * @param {number} [options.circuitBreakerResetMs=60000] Time before trying again
   * @param {number} [options.requestTimeoutMs=30000]
   */
  constructor(options = {}) {
    super();
    this.maxRetries = options.maxRetries ?? 3;
    this.baseDelayMs = options.baseDelayMs ?? 1000;
    this.maxDelayMs = options.maxDelayMs ?? 30_000;
    this.circuitBreakerThreshold = options.circuitBreakerThreshold ?? 5;
    this.circuitBreakerResetMs = options.circuitBreakerResetMs ?? 60_000;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000;

    this._circuits = new Map(); // service → CircuitState
    this._stats = new Map();   // service → { successes, failures, timeouts }
  }

  // ─── Retry with Backoff ──────────────────────────────────────────

  /**
   * Execute a function with retry + exponential backoff + jitter.
   */
  async retry(fn, options = {}) {
    const service = options.service || 'default';
    const maxRetries = options.maxRetries ?? this.maxRetries;

    // Check circuit breaker
    if (this._isCircuitOpen(service)) {
      throw new CircuitOpenError(service);
    }

    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await this._withTimeout(fn, options.timeoutMs ?? this.requestTimeoutMs);
        this._recordSuccess(service);
        return result;
      } catch (error) {
        lastError = error;
        this._recordFailure(service);

        // Don't retry on non-retryable errors
        if (!this._isRetryable(error)) throw error;

        // Don't retry on last attempt
        if (attempt === maxRetries) break;

        // Wait with exponential backoff + jitter
        const delay = this._calculateDelay(attempt);
        this.emit('retry:waiting', { service, attempt, delay, error: error.message });
        await this._sleep(delay);
      }
    }

    this._onCircuitFailure(service);
    throw lastError;
  }

  /**
   * Calculate delay with exponential backoff + jitter.
   */
  _calculateDelay(attempt) {
    const exponential = this.baseDelayMs * Math.pow(2, attempt);
    const jitter = Math.random() * this.baseDelayMs;
    return Math.min(exponential + jitter, this.maxDelayMs);
  }

  // ─── Circuit Breaker ─────────────────────────────────────────────

  /**
   * Get circuit state for a service.
   */
  getCircuitState(service) {
    const circuit = this._circuits.get(service);
    if (!circuit) return { state: CIRCUIT_STATES.CLOSED, failures: 0 };
    return { ...circuit };
  }

  /**
   * Manually reset a circuit.
   */
  resetCircuit(service) {
    this._circuits.set(service, {
      state: CIRCUIT_STATES.CLOSED,
      failures: 0,
      lastFailure: null,
      openedAt: null,
    });
    this.emit('circuit:reset', { service });
  }

  _isCircuitOpen(service) {
    const circuit = this._circuits.get(service);
    if (!circuit) return false;

    if (circuit.state === CIRCUIT_STATES.OPEN) {
      // Check if reset time has passed
      if (Date.now() - circuit.openedAt > this.circuitBreakerResetMs) {
        circuit.state = CIRCUIT_STATES.HALF_OPEN;
        this.emit('circuit:halfOpen', { service });
        return false; // Allow one request
      }
      return true;
    }

    return false;
  }

  _recordSuccess(service) {
    const stats = this._getStats(service);
    stats.successes++;

    const circuit = this._circuits.get(service);
    if (circuit && circuit.state === CIRCUIT_STATES.HALF_OPEN) {
      circuit.state = CIRCUIT_STATES.CLOSED;
      circuit.failures = 0;
      this.emit('circuit:closed', { service });
    }
  }

  _recordFailure(service) {
    const stats = this._getStats(service);
    stats.failures++;
  }

  _onCircuitFailure(service) {
    let circuit = this._circuits.get(service);
    if (!circuit) {
      circuit = { state: CIRCUIT_STATES.CLOSED, failures: 0, lastFailure: null, openedAt: null };
      this._circuits.set(service, circuit);
    }

    circuit.failures++;
    circuit.lastFailure = Date.now();

    if (circuit.failures >= this.circuitBreakerThreshold && circuit.state === CIRCUIT_STATES.CLOSED) {
      circuit.state = CIRCUIT_STATES.OPEN;
      circuit.openedAt = Date.now();
      this.emit('circuit:opened', { service, failures: circuit.failures });
    }
  }

  // ─── Model Failure Recovery ──────────────────────────────────────

  /**
   * Execute a model call with fallback strategy.
   */
  async modelCall(fn, options = {}) {
    const fallbacks = options.fallbacks || [];
    const degrade = options.degrade || null;

    try {
      return await this.retry(fn, { service: 'model', ...options });
    } catch (error) {
      this.emit('model:primaryFailed', { error: error.message });

      // Try fallbacks
      for (const fallback of fallbacks) {
        try {
          this.emit('model:tryingFallback', { service: fallback.service });
          const result = await this.retry(fallback.fn, { service: fallback.service, ...options });
          this.emit('model:fallbackSucceeded', { service: fallback.service });
          return result;
        } catch (fbError) {
          this.emit('model:fallbackFailed', { service: fallback.service, error: fbError.message });
        }
      }

      // Try degradation
      if (degrade) {
        try {
          this.emit('model:degrading');
          const result = await degrade();
          this.emit('model:degraded', { result });
          return result;
        } catch (dError) {
          this.emit('model:degradationFailed', { error: dError.message });
        }
      }

      throw error;
    }
  }

  // ─── Tool Failure Recovery ───────────────────────────────────────

  /**
   * Execute a tool call with recovery strategy.
   */
  async toolCall(toolName, fn, options = {}) {
    const strategy = options.strategy || 'retry'; // retry | skip | alternative

    try {
      return await this.retry(fn, { service: `tool:${toolName}`, ...options });
    } catch (error) {
      this.emit('tool:failed', { tool: toolName, error: error.message, strategy });

      if (strategy === 'skip') {
        this.emit('tool:skipped', { tool: toolName });
        return null;
      }

      if (strategy === 'alternative' && options.alternative) {
        try {
          const result = await options.alternative();
          this.emit('tool:alternativeSucceeded', { tool: toolName });
          return result;
        } catch (altError) {
          this.emit('tool:alternativeFailed', { tool: toolName, error: altError.message });
        }
      }

      throw error;
    }
  }

  // ─── Stats ───────────────────────────────────────────────────────

  /**
   * Get statistics for a service.
   */
  stats(service) {
    return this._getStats(service);
  }

  /**
   * Get all statistics.
   */
  allStats() {
    const result = {};
    for (const [service, stats] of this._stats) {
      result[service] = { ...stats };
    }
    return result;
  }

  // ─── Internal ────────────────────────────────────────────────────

  _withTimeout(fn, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs);
      fn().then(
        result => { clearTimeout(timer); resolve(result); },
        error => { clearTimeout(timer); reject(error); }
      );
    });
  }

  _isRetryable(error) {
    const msg = error.message?.toLowerCase() || '';
    // Retryable errors
    if (msg.includes('timeout')) return true;
    if (msg.includes('econnrefused')) return true;
    if (msg.includes('econnreset')) return true;
    if (msg.includes('enotfound')) return true;
    if (msg.includes('rate limit')) return true;
    if (msg.includes('429')) return true;
    if (msg.includes('503')) return true;
    if (msg.includes('502')) return true;
    // Non-retryable errors
    if (msg.includes('400')) return false;
    if (msg.includes('401')) return false;
    if (msg.includes('403')) return false;
    if (msg.includes('404')) return false;
    if (msg.includes('syntax')) return false;
    return true; // Default to retryable
  }

  _getStats(service) {
    if (!this._stats.has(service)) {
      this._stats.set(service, { successes: 0, failures: 0, timeouts: 0 });
    }
    return this._stats.get(service);
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export class CircuitOpenError extends Error {
  constructor(service) {
    super(`Circuit breaker open for ${service}`);
    this.name = 'CircuitOpenError';
    this.service = service;
  }
}
