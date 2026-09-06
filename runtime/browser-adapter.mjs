import { EventEmitter } from 'node:events';

/**
 * BrowserAdapter — browser automation interface.
 *
 * STATUS: FRAMEWORK ONLY — requires Playwright MCP or Chrome DevTools MCP
 * to be connected for real browser interaction.
 *
 * When no browser MCP is available, returns structured stubs indicating
 * browser capabilities are not active.
 *
 * This adapter follows the adapter pattern: it provides a consistent
 * interface regardless of whether a real browser backend is connected.
 */

const BROWSER_ACTION = Object.freeze({
  NAVIGATE: 'navigate',
  SCREENSHOT: 'screenshot',
  EVALUATE: 'evaluate',
  CLICK: 'click',
  FILL: 'fill',
  SNAPSHOT: 'snapshot',
});

class BrowserAdapter extends EventEmitter {
  constructor(options) {
    super();
    options = options || {};
    this.url = options.url || 'http://localhost:3000';
    this.maxIterations = options.maxIterations || 10;
    this.timeout = options.timeout || 30000;
    this.iterationCount = 0;
    this.results = [];
    this._available = false;
    this._backend = options.backend || null; // 'playwright' | 'chromedevtools' | null
  }

  isAvailable() { return this._available; }

  setAvailable(available) { this._available = available; }

  /**
   * Take a screenshot. Returns null paths when no browser backend is connected.
   */
  async screenshot(context) {
    this.iterationCount++;
    if (this.iterationCount > this.maxIterations) {
      throw new Error('Browser iteration budget exceeded');
    }
    const result = {
      iteration: this.iterationCount,
      action: BROWSER_ACTION.SCREENSHOT,
      url: context.url || this.url,
      timestamp: new Date().toISOString(),
      screenshotPath: null,
      domSnapshot: null,
      issues: [],
      available: this._available,
      backend: this._backend,
    };
    this.results.push(result);
    this.emit('browser:screenshot', result);
    return result;
  }

  /**
   * Evaluate JavaScript in the browser context.
   */
  async evaluate(context) {
    const result = {
      action: BROWSER_ACTION.EVALUATE,
      script: context.script || '',
      result: null,
      timestamp: new Date().toISOString(),
      available: this._available,
    };
    this.emit('browser:evaluate', result);
    return result;
  }

  /**
   * Check for issues from collected data.
   */
  async checkForIssues(context) {
    const issues = [];
    if (context.screenshotPath && !context.screenshotPath) {
      issues.push({ type: 'MISSING_SCREENSHOT', description: 'No screenshot captured' });
    }
    if (context.consoleErrors && context.consoleErrors.length > 0) {
      issues.push({ type: 'CONSOLE_ERROR', description: context.consoleErrors.length + ' console errors' });
    }
    if (context.networkErrors && context.networkErrors.length > 0) {
      issues.push({ type: 'NETWORK_ERROR', description: context.networkErrors.length + ' network errors' });
    }
    this.emit('browser:issues', { count: issues.length, issues });
    return { hasIssues: issues.length > 0, issues };
  }

  /**
   * Create a fix task for a browser issue.
   */
  createFixTask(issue) {
    return {
      id: 'browser-fix-' + Date.now(),
      title: 'Fix browser issue: ' + issue.type,
      description: issue.description,
      kind: 'shell',
      specialist: 'frontend',
      requiredEvidence: ['browser'],
    };
  }

  getResults() { return this.results.slice(); }

  reset() { this.iterationCount = 0; this.results = []; }
}

export { BROWSER_ACTION, BrowserAdapter };