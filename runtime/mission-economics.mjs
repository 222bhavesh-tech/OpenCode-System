import { EventEmitter } from 'node:events';

class MissionEconomics extends EventEmitter {
  constructor(options) {
    super();
    options = options || {};
    this.costPerToken = options.costPerToken || 0.00001;
    this.costPerToolCall = options.costPerToolCall || 0.001;
    this.costPerMcpCall = options.costPerMcpCall || 0.005;
    this.costPerBrowserAction = options.costPerBrowserAction || 0.01;
    this.sessions = new Map();
    this.totalSpent = 0;
  }

  /**
   * Start tracking a mission session.
   */
  startSession(missionId) {
    const session = {
      missionId,
      tokenUsage: 0,
      toolCalls: 0,
      mcpCalls: 0,
      browserActions: 0,
      estimatedCost: 0,
      startTime: Date.now(),
      endTime: null,
      breakdown: { tokens: 0, tools: 0, mcp: 0, browser: 0 },
    };
    this.sessions.set(missionId, session);
    return session;
  }

  /**
   * Record token usage.
   */
  recordTokens(missionId, tokens) {
    const session = this.sessions.get(missionId);
    if (!session) return;
    session.tokenUsage += tokens;
    session.breakdown.tokens = session.tokenUsage * this.costPerToken;
    session.estimatedCost = session.breakdown.tokens + session.breakdown.tools + session.breakdown.mcp + session.breakdown.browser;
  }

  /**
   * Record tool call.
   */
  recordToolCall(missionId, count) {
    const session = this.sessions.get(missionId);
    if (!session) return;
    session.toolCalls += (count || 1);
    session.breakdown.tools = session.toolCalls * this.costPerToolCall;
    session.estimatedCost = session.breakdown.tokens + session.breakdown.tools + session.breakdown.mcp + session.breakdown.browser;
  }

  /**
   * Record MCP call.
   */
  recordMcpCall(missionId, count) {
    const session = this.sessions.get(missionId);
    if (!session) return;
    session.mcpCalls += (count || 1);
    session.breakdown.mcp = session.mcpCalls * this.costPerMcpCall;
    session.estimatedCost = session.breakdown.tokens + session.breakdown.tools + session.breakdown.mcp + session.breakdown.browser;
  }

  /**
   * Record browser action.
   */
  recordBrowserAction(missionId, count) {
    const session = this.sessions.get(missionId);
    if (!session) return;
    session.browserActions += (count || 1);
    session.breakdown.browser = session.browserActions * this.costPerBrowserAction;
    session.estimatedCost = session.breakdown.tokens + session.breakdown.tools + session.breakdown.mcp + session.breakdown.browser;
  }

  /**
   * End a session.
   */
  endSession(missionId) {
    const session = this.sessions.get(missionId);
    if (!session) return null;
    session.endTime = Date.now();
    session.duration = session.endTime - session.startTime;
    this.totalSpent += session.estimatedCost;
    return session;
  }

  /**
   * Get session summary.
   */
  getSession(missionId) {
    return this.sessions.get(missionId) || null;
  }

  /**
   * Get global stats.
   */
  stats() {
    const all = [...this.sessions.values()];
    return {
      totalSessions: all.length,
      totalSpent: Math.round(this.totalSpent * 1000) / 1000,
      totalTokens: all.reduce((s, e) => s + e.tokenUsage, 0),
      totalToolCalls: all.reduce((s, e) => s + e.toolCalls, 0),
      totalMcpCalls: all.reduce((s, e) => s + e.mcpCalls, 0),
      avgCostPerSession: all.length > 0 ? Math.round((this.totalSpent / all.length) * 1000) / 1000 : 0,
    };
  }
}

export { MissionEconomics };