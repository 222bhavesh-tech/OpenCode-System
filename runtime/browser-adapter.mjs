import { EventEmitter } from 'node:events';

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
  }

  isAvailable() { return this._available; }

  setAvailable(available) { this._available = available; }

  async screenshot(context) {
    this.iterationCount++;
    if (this.iterationCount > this.maxIterations) { throw new Error('Browser iteration budget exceeded'); }
    var result = { iteration: this.iterationCount, action: BROWSER_ACTION.SCREENSHOT, url: context.url || this.url, timestamp: new Date().toISOString(), screenshotPath: null, domSnapshot: null, issues: [] };
    this.results.push(result);
    this.emit('browser:screenshot', result);
    return result;
  }

  async evaluate(context) {
    var result = { action: BROWSER_ACTION.EVALUATE, script: context.script || '', result: null, timestamp: new Date().toISOString() };
    this.emit('browser:evaluate', result);
    return result;
  }

  async checkForIssues(context) {
    var issues = [];
    if (context.screenshotPath && !context.screenshotPath) { issues.push({ type: 'MISSING_SCREENSHOT', description: 'No screenshot captured' }); }
    if (context.consoleErrors && context.consoleErrors.length > 0) { issues.push({ type: 'CONSOLE_ERROR', description: context.consoleErrors.length + ' console errors' }); }
    if (context.networkErrors && context.networkErrors.length > 0) { issues.push({ type: 'NETWORK_ERROR', description: context.networkErrors.length + ' network errors' }); }
    this.emit('browser:issues', { count: issues.length, issues: issues });
    return { hasIssues: issues.length > 0, issues: issues };
  }

  createFixTask(issue) {
    return { id: 'browser-fix-' + Date.now(), title: 'Fix browser issue: ' + issue.type, description: issue.description, kind: 'shell', specialist: 'frontend', requiredEvidence: ['browser'] };
  }

  getResults() { return this.results.slice(); }

  reset() { this.iterationCount = 0; this.results = []; }
}

export { BROWSER_ACTION, BrowserAdapter };