import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';

class TelemetryCollector extends EventEmitter {
  constructor(options) {
    super();
    options = options || {};
    this.maxMetrics = options.maxMetrics || 10000;
    this.metrics = [];
    this.counters = new Map();
    this.gauges = new Map();
    this.histograms = new Map();
    this.events = [];
    this.maxEvents = options.maxEvents || 500;
  }

  /**
   * Record a metric.
   */
  recordMetric(name, value, tags) {
    const metric = { name, value, tags: tags || {}, timestamp: Date.now(), id: 'm-' + crypto.randomUUID().slice(0, 8) };
    this.metrics.push(metric);
    if (this.metrics.length > this.maxMetrics) this.metrics.splice(0, this.metrics.length - this.maxMetrics);
    if (!this.histograms.has(name)) this.histograms.set(name, []);
    this.histograms.get(name).push({ value, timestamp: metric.timestamp });
  }

  /**
   * Increment a counter.
   */
  incrementCounter(name, value) {
    const current = this.counters.get(name) || 0;
    this.counters.set(name, current + (value || 1));
  }

  /**
   * Set a gauge.
   */
  setGauge(name, value) {
    this.gauges.set(name, { value, timestamp: Date.now() });
  }

  /**
   * Record an event.
   */
  recordEvent(name, data) {
    this.events.push({ name, data: data || {}, timestamp: Date.now() });
    if (this.events.length > this.maxEvents) this.events.splice(0, this.events.length - this.maxEvents);
  }

  /**
   * Get metric stats.
   */
  getMetricStats(name) {
    const values = (this.histograms.get(name) || []).map(h => h.value);
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((s, v) => s + v, 0);
    return {
      count: values.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean: Math.round((sum / values.length) * 1000) / 1000,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
    };
  }

  /**
   * Get all counters.
   */
  getCounters() {
    return Object.fromEntries(this.counters);
  }

  /**
   * Get all gauges.
   */
  getGauges() {
    return [...this.gauges.entries()].map(([name, data]) => ({ name, ...data }));
  }

  /**
   * Get events.
   */
  getEvents(limit) {
    return this.events.slice(-(limit || 50));
  }

  /**
   * Get full telemetry summary.
   */
  summary() {
    return {
      totalMetrics: this.metrics.length,
      uniqueMetricNames: this.histograms.size,
      counters: this.getCounters(),
      gauges: this.getGauges().length,
      events: this.events.length,
      metricNames: [...this.histograms.keys()],
    };
  }
}

export { TelemetryCollector };