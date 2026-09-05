/**
 * Memory — file-based persistent memory for agents.
 *
 * FREE alternative to @agentmemory/agentmemory MCP.
 * Stores structured observations in a JSON file that persists across sessions.
 *
 * Categories (matching agent-kit):
 *   - decision: Architecture/design decisions
 *   - pattern: Recurring code/project patterns
 *   - failure: Important failures and their fixes
 *   - convention: Project conventions and rules
 *   - insight: Domain knowledge and discoveries
 *
 * Usage:
 *   import { Memory } from './memory.mjs';
 *   const mem = new Memory('/path/to/project');
 *   mem.store('decision', 'Use ESM modules', { reason: 'Modern Node.js', files: ['package.json'] });
 *   const results = mem.search('ESM');
 *   const recent = mem.recent('failure', 10);
 */

import fs from 'node:fs';
import path from 'node:path';

const MEMORY_FILE = 'memory.json';
const MAX_ENTRIES = 5000;
const VALID_CATEGORIES = new Set(['decision', 'pattern', 'failure', 'convention', 'insight']);

export class Memory {
  /**
   * @param {string} projectRoot
   */
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.memoryDir = path.join(projectRoot, '.opencode-system');
    this.filePath = path.join(this.memoryDir, MEMORY_FILE);
    this._cache = null;
  }

  /**
   * Store a memory entry.
   *
   * @param {string} category — decision|pattern|failure|convention|insight
   * @param {string} content — The memory content
   * @param {object} [meta] — Optional metadata (reason, files, tags, etc.)
   * @returns {{ id, category, content, meta, timestamp }}
   */
  store(category, content, meta = {}) {
    if (!VALID_CATEGORIES.has(category)) {
      throw new Error(`Invalid category "${category}". Must be one of: ${[...VALID_CATEGORIES].join(', ')}`);
    }
    if (!content || typeof content !== 'string') {
      throw new Error('Memory content must be a non-empty string');
    }

    const data = this._load();
    const entry = {
      id: this._generateId(),
      category,
      content: content.trim(),
      meta: { ...meta },
      timestamp: new Date().toISOString(),
    };

    data.entries.push(entry);

    // Enforce max entries — drop oldest first
    if (data.entries.length > MAX_ENTRIES) {
      data.entries = data.entries.slice(-MAX_ENTRIES);
    }

    this._save(data);
    return entry;
  }

  /**
   * Search memory entries by query (case-insensitive substring match).
   *
   * @param {string} query
   * @param {object} [options]
   * @param {string} [options.category] — Filter by category
   * @param {number} [options.limit=20] — Max results
   * @param {string} [options.since] — ISO date string — only entries after this date
   * @returns {Array<{ id, category, content, meta, timestamp }>}
   */
  search(query, options = {}) {
    const data = this._load();
    const q = query.toLowerCase();
    const { category, limit = 20, since } = options;

    let results = data.entries.filter(
      (e) =>
        e.content.toLowerCase().includes(q) ||
        (e.meta.tags || []).some((t) => t.toLowerCase().includes(q))
    );

    if (category) {
      results = results.filter((e) => e.category === category);
    }

    if (since) {
      const sinceDate = new Date(since).getTime();
      results = results.filter((e) => new Date(e.timestamp).getTime() >= sinceDate);
    }

    // Most recent first
    results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    return results.slice(0, limit);
  }

  /**
   * Get recent entries for a category.
   *
   * @param {string} [category] — If omitted, returns all categories
   * @param {number} [limit=20]
   * @returns {Array}
   */
  recent(category, limit = 20) {
    const data = this._load();
    let entries = data.entries;

    if (category) {
      entries = entries.filter((e) => e.category === category);
    }

    return entries.slice(-limit).reverse();
  }

  /**
   * Get a specific entry by ID.
   *
   * @param {string} id
   * @returns {object|null}
   */
  getById(id) {
    const data = this._load();
    return data.entries.find((e) => e.id === id) || null;
  }

  /**
   * Delete a specific entry by ID.
   *
   * @param {string} id
   * @returns {boolean}
   */
  delete(id) {
    const data = this._load();
    const index = data.entries.findIndex((e) => e.id === id);
    if (index === -1) return false;

    data.entries.splice(index, 1);
    this._save(data);
    return true;
  }

  /**
   * Get memory statistics.
   *
   * @returns {{ total, byCategory, oldest, newest }}
   */
  stats() {
    const data = this._load();
    const byCategory = {};
    for (const e of data.entries) {
      byCategory[e.category] = (byCategory[e.category] || 0) + 1;
    }

    return {
      total: data.entries.length,
      byCategory,
      oldest: data.entries[0]?.timestamp || null,
      newest: data.entries[data.entries.length - 1]?.timestamp || null,
    };
  }

  /**
   * Export all memory as a markdown document.
   *
   * @returns {string}
   */
  toMarkdown() {
    const data = this._load();
    const lines = ['# Project Memory', ''];

    // Group by category
    const grouped = {};
    for (const e of data.entries) {
      if (!grouped[e.category]) grouped[e.category] = [];
      grouped[e.category].push(e);
    }

    for (const [cat, entries] of Object.entries(grouped)) {
      lines.push(`## ${cat.charAt(0).toUpperCase() + cat.slice(1)}s`, '');
      for (const e of entries) {
        lines.push(`- **[${e.timestamp}]** ${e.content}`);
        if (e.meta && Object.keys(e.meta).length > 0) {
          lines.push(`  - ${JSON.stringify(e.meta)}`);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Clear all memory. Irreversible.
   */
  clear() {
    this._save({ entries: [], version: 1 });
  }

  // ─── Private ──────────────────────────────────────────────────────

  _load() {
    if (this._cache) return this._cache;

    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        this._cache = JSON.parse(raw);
        return this._cache;
      }
    } catch {
      // Corrupt file — start fresh
    }

    this._cache = { entries: [], version: 1 };
    return this._cache;
  }

  _save(data) {
    if (!fs.existsSync(this.memoryDir)) {
      fs.mkdirSync(this.memoryDir, { recursive: true });
    }
    // Atomic write
    const tmpPath = this.filePath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpPath, this.filePath);
    this._cache = data;
  }

  _generateId() {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    return `mem_${ts}_${rand}`;
  }
}
