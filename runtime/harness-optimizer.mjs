/**
 * HarnessOptimizer — analyzes the OpenCode-System config for improvements.
 *
 * Reads:
 *   - agents/*.md (count, complexity)
 *   - skills/manifest.json (count, categories)
 *   - plugins/manifest.json (count)
 *   - config/opencode.jsonc (MCPs, tools)
 *   - runtime/*.mjs (executor types)
 *   - .opencode-system/ (memory, state)
 *
 * Produces a scored report with actionable recommendations.
 */

import fs from 'node:fs';
import path from 'node:path';

export class HarnessOptimizer {
  /**
   * @param {string} projectRoot
   */
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.systemRoot = path.join(projectRoot, 'OpenCode-System');
  }

  /**
   * Run full analysis.
   *
   * @returns {{ score, dimensions, summary, quickWins, criticalIssues }}
   */
  async analyze() {
    const dimensions = {
      cost: await this._analyzeCost(),
      quality: await this._analyzeQuality(),
      performance: await this._analyzePerformance(),
      completeness: await this._analyzeCompleteness(),
    };

    const scores = Object.values(dimensions).map((d) => d.score);
    const score = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

    const quickWins = this._extractQuickWins(dimensions);
    const criticalIssues = this._extractCriticalIssues(dimensions);
    const summary = this._generateSummary(score, dimensions);

    return { score, dimensions, summary, quickWins, criticalIssues };
  }

  // ─── Cost Analysis ──────────────────────────────────────────────

  async _analyzeCost() {
    const issues = [];
    const recommendations = [];

    // Count agents
    const agents = this._listAgents();
    if (agents.length > 10) {
      issues.push(`${agents.length} agents defined — context overhead is high`);
      recommendations.push('Consolidate agents for projects under 10K lines');
    }

    // Count skills
    const skills = this._countSkills();
    if (skills.total > 100) {
      issues.push(`${skills.total} skills registered — most won't be used`);
      recommendations.push('Prune skills to only those relevant to current project type');
    }

    // Count MCPs
    const mcps = this._countMCPs();
    if (mcps > 5) {
      issues.push(`${mcps} MCPs configured — activation overhead`);
      recommendations.push('Use demand-driven MCP activation, not all at once');
    }

    // Estimate token overhead
    const estimatedTokens = agents.length * 2000 + skills.total * 500;
    if (estimatedTokens > 50000) {
      issues.push(`Estimated ${estimatedTokens} tokens of instruction overhead`);
      recommendations.push('Reduce active agents and skills to lower token usage');
    }

    const score = Math.max(0, 100 - issues.length * 15);

    return { score, issues, recommendations, metrics: { agents: agents.length, skills: skills.total, mcps, estimatedTokens } };
  }

  // ─── Quality Analysis ──────────────────────────────────────────

  async _analyzeQuality() {
    const issues = [];
    const recommendations = [];

    // Check for verification gates in templates
    const templates = this._listTemplates();
    const hasGate = templates.some((t) => t.includes('gate') || t.includes('evidence'));
    if (!hasGate) {
      issues.push('No evidence gate templates found');
      recommendations.push('Add evidence gates to enforce verification');
    }

    // Check for memory
    const hasMemory = fs.existsSync(path.join(this.systemRoot, 'runtime', 'memory.mjs'));
    if (!hasMemory) {
      issues.push('No memory system found');
      recommendations.push('Add file-based memory for cross-session learning');
    }

    // Check for review agent
    const hasReviewer = agents.includes('reviewer.md');
    if (!hasReviewer) {
      issues.push('No independent reviewer agent');
      recommendations.push('Add reviewer agent for independent verification');
    }

    // Check for error handling
    const hasErrorHandling = this._fileContains('runtime/worker.mjs', 'classifyError');
    if (!hasErrorHandling) {
      issues.push('No error classification in worker');
      recommendations.push('Add error classification for better recovery');
    }

    const score = Math.max(0, 100 - issues.length * 20);

    return { score, issues, recommendations };
  }

  // ─── Performance Analysis ─────────────────────────────────────

  async _analyzePerformance() {
    const issues = [];
    const recommendations = [];

    // Check for redundant executors
    const executors = this._listExecutors();
    if (executors.length > 5) {
      issues.push(`${executors.length} executor types — may be redundant`);
      recommendations.push('Consolidate similar executors');
    }

    // Check task granularity
    const tasks = this._countTasks();
    if (tasks > 50) {
      issues.push(`${tasks} tasks in graph — may cause scheduling overhead`);
      recommendations.push('Group related tasks into phases');
    }

    // Check for parallelization opportunities
    const hasParallel = this._fileContains('runtime/scheduler.mjs', 'maxConcurrent');
    if (!hasParallel && tasks > 5) {
      issues.push('No parallel task execution configured');
      recommendations.push('Enable concurrent task execution for independent tasks');
    }

    const score = Math.max(0, 100 - issues.length * 15);

    return { score, issues, recommendations };
  }

  // ─── Completeness Analysis ────────────────────────────────────

  async _analyzeCompleteness() {
    const issues = [];
    const recommendations = [];

    // Check for required docs
    const requiredDocs = ['AGENTS.md', 'README.md'];
    for (const doc of requiredDocs) {
      if (!fs.existsSync(path.join(this.systemRoot, doc))) {
        issues.push(`Missing ${doc}`);
        recommendations.push(`Create ${doc}`);
      }
    }

    // Check for runtime modules
    const requiredRuntime = ['control-plane.mjs', 'worker.mjs', 'scheduler.mjs', 'cli.mjs'];
    for (const mod of requiredRuntime) {
      if (!fs.existsSync(path.join(this.systemRoot, 'runtime', mod))) {
        issues.push(`Missing runtime module: ${mod}`);
        recommendations.push(`Create runtime/${mod}`);
      }
    }

    // Check for test coverage
    const tests = this._listTests();
    if (tests.length === 0) {
      issues.push('No tests found');
      recommendations.push('Add unit tests for runtime modules');
    }

    const score = Math.max(0, 100 - issues.length * 20);

    return { score, issues, recommendations, metrics: { docs: requiredDocs.length, runtime: requiredRuntime.length, tests: tests.length } };
  }

  // ─── Helpers ──────────────────────────────────────────────────

  _listAgents() {
    const dir = path.join(this.systemRoot, 'agents');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  }

  _countSkills() {
    const manifest = path.join(this.systemRoot, 'skills', 'manifest.json');
    if (!fs.existsSync(manifest)) return { total: 0, categories: {} };
    try {
      const data = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      return { total: data.total || 0, categories: data.categories || {} };
    } catch {
      return { total: 0, categories: {} };
    }
  }

  _countMCPs() {
    const config = path.join(this.systemRoot, 'config', 'opencode.jsonc');
    if (!fs.existsSync(config)) return 0;
    try {
      const raw = fs.readFileSync(config, 'utf8');
      // Simple count of "server-name" entries in mcpServers
      const matches = raw.match(/"server-name"/g);
      return matches ? matches.length : 0;
    } catch {
      return 0;
    }
  }

  _listTemplates() {
    const dir = path.join(this.systemRoot, 'templates');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  }

  _listExecutors() {
    const worker = path.join(this.systemRoot, 'runtime', 'worker.mjs');
    if (!fs.existsSync(worker)) return [];
    try {
      const content = fs.readFileSync(worker, 'utf8');
      const executors = [];
      if (content.includes('ShellExecutor')) executors.push('shell');
      if (content.includes('FileExecutor')) executors.push('file');
      if (content.includes('TestExecutor')) executors.push('test');
      if (content.includes('ManualExecutor')) executors.push('manual');
      return executors;
    } catch {
      return [];
    }
  }

  _countTasks() {
    const stateFile = path.join(this.systemRoot, '.opencode-system', 'project-state.json');
    if (!fs.existsSync(stateFile)) return 0;
    try {
      const data = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      return Object.keys(data.tasks || {}).length;
    } catch {
      return 0;
    }
  }

  _listTests() {
    const dir = path.join(this.systemRoot, 'test');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((f) => f.endsWith('.test.mjs') || f.endsWith('.test.js'));
  }

  _fileContains(relativePath, searchStr) {
    const fullPath = path.join(this.systemRoot, relativePath);
    if (!fs.existsSync(fullPath)) return false;
    try {
      return fs.readFileSync(fullPath, 'utf8').includes(searchStr);
    } catch {
      return false;
    }
  }

  _extractQuickWins(dimensions) {
    const wins = [];
    for (const [name, dim] of Object.entries(dimensions)) {
      for (const rec of dim.recommendations) {
        wins.push({ dimension: name, action: rec });
      }
    }
    return wins.slice(0, 5); // Top 5 quick wins
  }

  _extractCriticalIssues(dimensions) {
    const critical = [];
    for (const [name, dim] of Object.entries(dimensions)) {
      if (dim.score < 50) {
        critical.push({ dimension: name, score: dim.score, issues: dim.issues });
      }
    }
    return critical;
  }

  _generateSummary(score, dimensions) {
    const weakest = Object.entries(dimensions).sort((a, b) => a[1].score - b[1].score)[0];
    const strongest = Object.entries(dimensions).sort((a, b) => b[1].score - a[1].score)[0];

    return `Overall score: ${score}/100. Strongest: ${strongest[0]} (${strongest[1].score}). Weakest: ${weakest[0]} (${weakest[1].score}).`;
  }
}
