/**
 * VisualDevLoop — autonomous visual development cycle.
 *
 * Inspired by opencode-agent-kit's portless + chrome-devtools + agent-browser.
 * Uses our existing Chrome DevTools MCP integration.
 *
 * Loop:
 *   1. BUILD — run shell command (dev server, build, etc.)
 *   2. NAVIGATE — open URL in browser
 *   3. INSPECT — screenshot + snapshot (DOM analysis)
 *   4. EVALUATE — run JS to check visual state
 *   5. FIX — if issues found, create fix task
 *   6. REPEAT — until no issues or budget exhausted
 *
 * Usage:
 *   import { VisualDevLoop } from './visual-dev-loop.mjs';
 *   const loop = new VisualDevLoop(plane, { url: 'http://localhost:3000' });
 *   const result = await loop.run({ maxIterations: 10, buildCommand: 'npm run dev' });
 */

import { EventEmitter } from 'node:events';
import { WorkerAdapter } from './worker.mjs';

export class VisualDevLoop extends EventEmitter {
  /**
   * @param {import('./control-plane.mjs').ControlPlane} plane
   * @param {object} options
   * @param {string} options.url — URL to inspect (e.g. http://localhost:3000)
   * @param {string} [options.buildCommand] — Command to start dev server
   * @param {number} [options.maxIterations=10] — Max inspection cycles
   * @param {number} [options.viewportWidth=1280]
   * @param {number} [options.viewportHeight=720]
   * @param {number} [options.waitForMs=3000] — Wait after build before inspect
   */
  constructor(plane, options = {}) {
    super();
    this.plane = plane;
    this.url = options.url || 'http://localhost:3000';
    this.buildCommand = options.buildCommand;
    this.maxIterations = options.maxIterations ?? 10;
    this.viewportWidth = options.viewportWidth ?? 1280;
    this.viewportHeight = options.viewportHeight ?? 720;
    this.waitForMs = options.waitForMs ?? 3000;
    this.worker = new WorkerAdapter(plane);
    this._running = false;
  }

  /**
   * Run the visual dev loop.
   *
   * @param {object} [overrides]
   * @param {string} [overrides.checkScript] — JS to evaluate on page (returns issues array)
   * @param {string} [overrides.fixPrompt] — Instructions for fixing issues
   * @returns {{ iterations, issues, fixes, screenshots, passed }}
   */
  async run(overrides = {}) {
    if (this._running) throw new Error('VisualDevLoop is already running');
    this._running = true;

    const result = {
      iterations: 0,
      issues: [],
      fixes: [],
      screenshots: [],
      passed: false,
    };

    try {
      // Step 1: Start dev server if build command provided
      if (this.buildCommand) {
        this.emit('vdl:build', { command: this.buildCommand });
        await this.worker.execute('vdl-build', {
          kind: 'shell',
          command: this.buildCommand,
          timeout: 120_000,
          agent: 'visual-dev-loop',
        });
        // Wait for server to be ready
        await sleep(this.waitForMs);
      }

      // Step 2: Loop — inspect → evaluate → fix
      for (let i = 0; i < this.maxIterations && this._running; i++) {
        result.iterations = i + 1;
        this.emit('vdl:iteration', { iteration: i + 1 });

        // Navigate to URL
        this.emit('vdl:navigate', { url: this.url });

        // Take screenshot (via Chrome DevTools MCP — delegated to agent)
        const screenshot = await this._captureScreenshot(i + 1);
        result.screenshots.push(screenshot);

        // Evaluate check script
        const issues = await this._evaluatePage(overrides.checkScript);
        result.issues.push(...issues);

        if (issues.length === 0) {
          result.passed = true;
          this.emit('vdl:pass', { iteration: i + 1 });
          break;
        }

        this.emit('vdl:issues-found', { iteration: i + 1, count: issues.length, issues });

        // Create fix task in control plane
        const fixTaskId = `vdl-fix-${i + 1}`;
        this.plane.addTask({
          id: fixTaskId,
          title: `Visual fix iteration ${i + 1}`,
          description: `Fix ${issues.length} visual issues: ${issues.map((i) => i.message || i.selector || 'unknown').join(', ')}`,
          kind: 'shell',
          agent: 'visual-dev-loop',
          priority: 100,
          deps: [],
          retries: 1,
          evidenceGates: [],
          content: overrides.fixPrompt || `Fix the visual issues found on ${this.url}`,
        });

        const fixResult = await this.worker.execute(fixTaskId, {
          agent: 'visual-dev-loop',
        });
        result.fixes.push(fixResult);
        this.emit('vdl:fix-applied', { iteration: i + 1, fixResult });
      }
    } finally {
      this._running = false;
      this.emit('vdl:done', result);
    }

    return result;
  }

  /**
   * Stop the visual dev loop.
   */
  stop() {
    this._running = false;
    this.emit('vdl:stopping');
  }

  get isRunning() {
    return this._running;
  }

  // ─── Private ──────────────────────────────────────────────────────

  async _captureScreenshot(iteration) {
    // In practice, this calls Chrome DevTools MCP via the agent
    // For now, we record the intent — the agent handles the actual capture
    return {
      iteration,
      timestamp: new Date().toISOString(),
      viewport: { width: this.viewportWidth, height: this.viewportHeight },
      path: `.opencode-system/screenshots/iter-${iteration}.png`,
    };
  }

  async _evaluatePage(checkScript) {
    // In practice, this calls Chrome DevTools evaluate_script via the agent
    // For now, we return a structured format — the agent fills in actual results
    // The check script should return an array of issues:
    // [{ selector, message, severity, screenshot }]
    if (!checkScript) return [];

    // Placeholder — the agent runs this script via Chrome DevTools MCP
    return [{
      type: 'visual',
      message: 'Evaluate script delegated to Chrome DevTools MCP',
      script: checkScript,
      severity: 'info',
    }];
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
