export const CapabilityStatus = {
  AVAILABLE: 'available',
  INTEGRATED: 'integrated',
  DISABLED: 'disabled',
  CONFLICT: 'conflict',
};

export const CapabilityPriority = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
};

export const ConflictRisk = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  NONE: 'none',
};

export class CapabilityRegistry {
  constructor() {
    this._capabilities = new Map();
    this._adapters = new Map();
    this._conflicts = [];
    this._eventListeners = [];
    this._initializeBuiltInCapabilities();
  }

  register(capability) {
    const required = ['id', 'name', 'source', 'priority', 'integrationMethod', 'conflictRisk'];
    for (const field of required) {
      if (!capability[field]) {
        throw new Error('Capability missing required field: ' + field);
      }
    }
    if (this._capabilities.has(capability.id)) {
      throw new Error('Capability already registered: ' + capability.id);
    }
    const entry = {
      id: capability.id,
      name: capability.name,
      description: capability.description || '',
      source: capability.source,
      sourceVersion: capability.sourceVersion || 'unknown',
      priority: capability.priority || CapabilityPriority.MEDIUM,
      integrationMethod: capability.integrationMethod,
      conflictRisk: capability.conflictRisk || ConflictRisk.LOW,
      status: CapabilityStatus.AVAILABLE,
      version: capability.version || '1.0.0',
      dependencies: capability.dependencies || [],
      permissions: capability.permissions || [],
      conflictsWith: capability.conflictsWith || [],
      adapterPath: capability.adapterPath || null,
      metadata: capability.metadata || {},
      registeredAt: Date.now(),
    };
    this._capabilities.set(capability.id, entry);
    this._emit('registered', entry);
    if (entry.conflictRisk === ConflictRisk.HIGH) {
      this._conflicts.push({ capabilityId: entry.id, reason: 'High conflict risk', timestamp: Date.now() });
    }
    return true;
  }

  registerAdapter(capabilityId, adapter) {
    if (!this._capabilities.has(capabilityId)) {
      throw new Error('Capability not found: ' + capabilityId);
    }
    if (!adapter.execute || typeof adapter.execute !== 'function') {
      throw new Error('Adapter must have an execute() method');
    }
    this._adapters.set(capabilityId, { capabilityId, adapter, registeredAt: Date.now() });
    this._capabilities.get(capabilityId).status = CapabilityStatus.INTEGRATED;
    return true;
  }

  get(id) { return this._capabilities.get(id) || null; }

  query(criteria) {
    criteria = criteria || {};
    const results = [];
    for (const cap of this._capabilities.values()) {
      if (criteria.source && cap.source !== criteria.source) continue;
      if (criteria.priority && cap.priority !== criteria.priority) continue;
      if (criteria.status && cap.status !== criteria.status) continue;
      results.push(cap);
    }
    return results;
  }

  getAvailable() { return this.query({ status: CapabilityStatus.AVAILABLE }); }
  getIntegrated() { return this.query({ status: CapabilityStatus.INTEGRATED }); }

  getAdapter(capabilityId) {
    const entry = this._adapters.get(capabilityId);
    return entry ? entry.adapter : null;
  }

  canIntegrate(capabilityId) {
    const cap = this._capabilities.get(capabilityId);
    if (!cap) return { safe: false, reason: 'Capability not found: ' + capabilityId };
    if (cap.status === CapabilityStatus.DISABLED) return { safe: false, reason: 'Disabled' };
    if (cap.status === CapabilityStatus.INTEGRATED) return { safe: false, reason: 'Already integrated' };
    for (const conflictId of (cap.conflictsWith || [])) {
      const conflicting = this._capabilities.get(conflictId);
      if (conflicting && conflicting.status === CapabilityStatus.INTEGRATED) {
        return { safe: false, reason: 'Conflicts with: ' + conflictId };
      }
    }
    for (const depId of (cap.dependencies || [])) {
      const dep = this._capabilities.get(depId);
      if (!dep || dep.status !== CapabilityStatus.INTEGRATED) {
        return { safe: false, reason: 'Missing dependency: ' + depId };
      }
    }
    return { safe: true, reason: 'OK' };
  }

  getConflicts() { return this._conflicts.slice(); }

  getStats() {
    const stats = { total: 0, byStatus: {}, byPriority: {}, bySource: {}, integrated: 0, available: 0, disabled: 0 };
    for (const cap of this._capabilities.values()) {
      stats.total++;
      stats.byStatus[cap.status] = (stats.byStatus[cap.status] || 0) + 1;
      stats.byPriority[cap.priority] = (stats.byPriority[cap.priority] || 0) + 1;
      stats.bySource[cap.source] = (stats.bySource[cap.source] || 0) + 1;
      if (cap.status === CapabilityStatus.INTEGRATED) stats.integrated++;
      if (cap.status === CapabilityStatus.AVAILABLE) stats.available++;
      if (cap.status === CapabilityStatus.DISABLED) stats.disabled++;
    }
    return stats;
  }

  export() {
    return {
      capabilities: Object.fromEntries(this._capabilities),
      conflicts: this._conflicts,
      stats: this.getStats(),
      exportedAt: Date.now(),
    };
  }

  on(event, listener) { this._eventListeners.push({ event, listener }); }

  _emit(event, data) {
    for (const { event: evt, listener } of this._eventListeners) {
      if (evt === event || evt === '*') {
        try { listener(data); } catch (e) { /* ignore */ }
      }
    }
  }

  _initializeBuiltInCapabilities() {
    const caps = [
      { id: 'openhands.typed-observations', name: 'Typed Observations', description: 'Structured observation types for agent execution', source: 'openhands', priority: 'high', integrationMethod: 'adapter', conflictRisk: 'low', metadata: { providesType: 'typed-observations' } },
      { id: 'openhands.retry-backoff', name: 'Retry with Backoff', description: 'Configurable retry with exponential backoff', source: 'openhands', priority: 'high', integrationMethod: 'enhancement', conflictRisk: 'low', metadata: { providesType: 'retry-backoff' } },
      { id: 'openhands.issue-resolution', name: 'Issue Resolution Pipeline', description: 'Automated GitHub issue to PR pipeline', source: 'openhands', priority: 'high', integrationMethod: 'adapter', conflictRisk: 'medium', metadata: { providesType: 'issue-resolution' } },
      { id: 'openhands.runtime-lifecycle', name: 'Runtime Lifecycle Hooks', description: 'Pre/post-flight hooks for worker execution', source: 'openhands', priority: 'medium', integrationMethod: 'enhancement', conflictRisk: 'low', metadata: { providesType: 'runtime-lifecycle' } },
      { id: 'openhands.success-guessing', name: 'Success Guessing', description: 'LLM-based success evaluation', source: 'openhands', priority: 'medium', integrationMethod: 'adapter', conflictRisk: 'low', metadata: { providesType: 'success-guessing' } },
      { id: 'opencode.basetool-interface', name: 'BaseTool Interface', description: 'Standardized tool interface', source: 'opencode', priority: 'high', integrationMethod: 'adapter', conflictRisk: 'low', metadata: { providesType: 'basetool-interface' } },
      { id: 'opencode.permission-system', name: 'Permission System', description: 'Per-tool permission verification', source: 'opencode', priority: 'high', integrationMethod: 'adapter', conflictRisk: 'low', metadata: { providesType: 'permission-checking' } },
      { id: 'opencode.mcp-integration', name: 'MCP Tool Integration', description: 'Dynamic MCP tool discovery', source: 'opencode', priority: 'high', integrationMethod: 'adapter', conflictRisk: 'low', metadata: { providesType: 'mcp-integration' } },
      { id: 'opencode.tool-execution-loop', name: 'Tool Execution Loop', description: 'Streaming agent loop with tool calls', source: 'opencode', priority: 'high', integrationMethod: 'adapter', conflictRisk: 'medium', metadata: { providesType: 'tool-execution-loop' } },
      { id: 'opencode.context-summarization', name: 'Context Summarization', description: 'LLM-based conversation compression', source: 'opencode', priority: 'medium', integrationMethod: 'adapter', conflictRisk: 'low', metadata: { providesType: 'context-summarization' } },
      { id: 'opencode.agent-delegation', name: 'Agent Delegation', description: 'Tool-restricted sub-agent spawning', source: 'opencode', priority: 'medium', integrationMethod: 'adapter', conflictRisk: 'medium', metadata: { providesType: 'agent-delegation' } },
      { id: 'opencode.tool-registry', name: 'Tool Registry', description: 'Agent-specific tool sets', source: 'opencode', priority: 'medium', integrationMethod: 'adapter', conflictRisk: 'low', metadata: { providesType: 'tool-registry' } },
      { id: 'opencode.cost-tracking', name: 'Cost Tracking', description: 'Per-session cost calculation', source: 'opencode', priority: 'low', integrationMethod: 'enhancement', conflictRisk: 'low', metadata: { providesType: 'cost-tracking' } },
    ];
    for (const cap of caps) {
      this.register(cap);
    }
  }
}

let _instance = null;
export function getCapabilityRegistry() {
  if (!_instance) _instance = new CapabilityRegistry();
  return _instance;
}