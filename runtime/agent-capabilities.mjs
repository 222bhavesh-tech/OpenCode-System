/**
 * runtime/agent-capabilities.mjs
 * 
 * Agent capability model - agents declare what they can do,
 * Commander selects agents by task requirements + capabilities.
 * 
 * Part of OpenCode-System Phase B: External Capability Inheritance
 */

import { getCapabilityRegistry, CapabilityStatus } from './capability-registry.mjs';

/**
 * Standard capability types
 */
export const CapabilityType = {
  CODE_EDITING: 'code-editing',
  SHELL_EXECUTION: 'shell-execution',
  FILE_OPERATIONS: 'file-operations',
  REPOSITORY_EXPLORATION: 'repository-exploration',
  ISSUE_RESOLUTION: 'issue-resolution',
  PR_GENERATION: 'pr-generation',
  TEST_EXECUTION: 'test-execution',
  DEPLOYMENT: 'deployment',
  CODE_SEARCH: 'code-search',
  WEB_SEARCH: 'web-search',
  CONTEXT_SUMMARIZATION: 'context-summarization',
  MCP_INTEGRATION: 'mcp-integration',
  PERMISSION_CHECKING: 'permission-checking',
  COST_TRACKING: 'cost-tracking',
  DIAGNOSTICS: 'diagnostics',
};

/**
 * Agent Capability Declaration
 */
export class AgentCapabilityDeclaration {
  constructor(agentId, capabilities = []) {
    this.agentId = agentId;
    this.capabilities = capabilities;
    this.declaredAt = Date.now();
  }

  /**
   * Check if agent has a specific capability
   * @param {string} capabilityType - Capability type to check
   * @returns {boolean} Has capability
   */
  has(capabilityType) {
    return this.capabilities.includes(capabilityType);
  }

  /**
   * Check if agent has all required capabilities
   * @param {Array} requiredCapabilities - Required capability types
   * @returns {object} Result with missing capabilities
   */
  hasAll(requiredCapabilities) {
    const missing = requiredCapabilities.filter(cap => !this.has(cap));
    return {
      complete: missing.length === 0,
      missing,
      has: this.capabilities.filter(cap => requiredCapabilities.includes(cap)),
    };
  }

  /**
   * Get capability score (how many capabilities the agent has)
   * @param {Array} requiredCapabilities - Required capabilities
   * @returns {number} Score 0-1
   */
  score(requiredCapabilities) {
    if (requiredCapabilities.length === 0) return 1;
    const matched = requiredCapabilities.filter(cap => this.has(cap)).length;
    return matched / requiredCapabilities.length;
  }

  /**
   * Serialize to JSON
   */
  toJSON() {
    return {
      agentId: this.agentId,
      capabilities: this.capabilities,
      declaredAt: this.declaredAt,
    };
  }

  /**
   * Deserialize from JSON
   */
  static fromJSON(data) {
    return new AgentCapabilityDeclaration(data.agentId, data.capabilities);
  }
}

/**
 * Agent Capability Manager
 * 
 * Manages capability declarations for all agents.
 * Provides agent selection based on task requirements.
 */
export class AgentCapabilityManager {
  _agents = new Map();
  _registry = null;

  constructor() {
    this._registry = getCapabilityRegistry();
  }

  /**
   * Register an agent with its capabilities
   * @param {AgentCapabilityDeclaration} declaration - Agent capabilities
   */
  registerAgent(declaration) {
    this._agents.set(declaration.agentId, declaration);
  }

  /**
   * Unregister an agent
   * @param {string} agentId - Agent ID
   */
  unregisterAgent(agentId) {
    this._agents.delete(agentId);
  }

  /**
   * Get agent declaration
   * @param {string} agentId - Agent ID
   * @returns {AgentCapabilityDeclaration|null}
   */
  getAgent(agentId) {
    return this._agents.get(agentId) || null;
  }

  /**
   * Get all registered agents
   * @returns {Array} Agent declarations
   */
  getAllAgents() {
    return [...this._agents.values()];
  }

  /**
   * Find best agent for a task
   * @param {object} taskRequirements - Task requirements
   * @param {Array} taskRequirements.capabilities - Required capability types
   * @param {Array} taskRequirements.preferredCapabilities - Preferred capability types
   * @param {number} taskRequirements.riskLevel - Risk level (0-1)
   * @param {number} taskRequirements.budgetMs - Budget in milliseconds
   * @returns {object} Best agent with score
   */
  selectAgent(taskRequirements) {
    const {
      capabilities = [],
      preferredCapabilities = [],
      riskLevel = 0.5,
      budgetMs = 60000,
    } = taskRequirements;

    let bestAgent = null;
    let bestScore = -1;
    const candidates = [];

    for (const [agentId, declaration] of this._agents) {
      const requiredResult = declaration.hasAll(capabilities);
      if (!requiredResult.complete) continue; // Skip agents missing required capabilities

      // Score based on required capabilities (must have all)
      let score = declaration.score(capabilities) * 0.7;

      // Bonus for preferred capabilities
      const preferredScore = declaration.score(preferredCapabilities);
      score += preferredScore * 0.2;

      // Bonus for lower risk agents
      score += (1 - riskLevel) * 0.1;

      candidates.push({
        agentId,
        declaration,
        score,
        missing: requiredResult.missing,
        matched: requiredResult.has,
      });

      if (score > bestScore) {
        bestScore = score;
        bestAgent = { agentId, declaration, score };
      }
    }

    return {
      best: bestAgent,
      candidates: candidates.sort((a, b) => b.score - a.score),
      totalCandidates: candidates.length,
    };
  }

  /**
   * Get capability requirements for a task type
   * @param {string} taskType - Task type
   * @returns {object} Capability requirements
   */
  static getTaskCapabilityRequirements(taskType) {
    const requirements = {
      'code-edit': {
        capabilities: [CapabilityType.CODE_EDITING],
        preferredCapabilities: [CapabilityType.TEST_EXECUTION, CapabilityType.DIAGNOSTICS],
      },
      'bug-fix': {
        capabilities: [CapabilityType.CODE_EDITING, CapabilityType.TEST_EXECUTION],
        preferredCapabilities: [CapabilityType.REPOSITORY_EXPLORATION, CapabilityType.CODE_SEARCH],
      },
      'feature': {
        capabilities: [CapabilityType.CODE_EDITING, CapabilityType.TEST_EXECUTION],
        preferredCapabilities: [CapabilityType.DIAGNOSTICS, CapabilityType.CONTEXT_SUMMARIZATION],
      },
      'issue-resolve': {
        capabilities: [CapabilityType.ISSUE_RESOLUTION, CapabilityType.CODE_EDITING],
        preferredCapabilities: [CapabilityType.PR_GENERATION, CapabilityType.TEST_EXECUTION],
      },
      'deploy': {
        capabilities: [CapabilityType.DEPLOYMENT, CapabilityType.SHELL_EXECUTION],
        preferredCapabilities: [CapabilityType.CONTEXT_SUMMARIZATION],
      },
      'research': {
        capabilities: [CapabilityType.REPOSITORY_EXPLORATION, CapabilityType.WEB_SEARCH],
        preferredCapabilities: [CapabilityType.CODE_SEARCH, CapabilityType.CONTEXT_SUMMARIZATION],
      },
      'test': {
        capabilities: [CapabilityType.TEST_EXECUTION],
        preferredCapabilities: [CapabilityType.DIAGNOSTICS],
      },
      'refactor': {
        capabilities: [CapabilityType.CODE_EDITING, CapabilityType.TEST_EXECUTION],
        preferredCapabilities: [CapabilityType.DIAGNOSTICS, CapabilityType.REPOSITORY_EXPLORATION],
      },
    };

    return requirements[taskType] || {
      capabilities: [],
      preferredCapabilities: [],
    };
  }

  /**
   * Check if required external capabilities are available
   * @param {Array} capabilityTypes - Required capability types
   * @returns {object} Availability check
   */
  checkExternalCapabilityAvailability(capabilityTypes) {
    const registry = this._registry;
    const results = [];

    for (const capType of capabilityTypes) {
      // Find capabilities in registry that provide this type
      const matching = registry.query({
        status: CapabilityStatus.INTEGRATED,
      }).filter(cap => 
        cap.metadata && cap.metadata.providesType === capType
      );

      results.push({
        type: capType,
        available: matching.length > 0,
        providers: matching.map(m => m.id),
      });
    }

    return {
      allAvailable: results.every(r => r.available),
      results,
    };
  }

  /**
   * Export all agent declarations
   * @returns {object} Serialized declarations
   */
  export() {
    return {
      agents: [...this._agents.entries()].map(([id, decl]) => decl.toJSON()),
      exportedAt: Date.now(),
    };
  }

  /**
   * Import agent declarations
   * @param {object} data - Serialized declarations
   */
  import(data) {
    if (data.agents) {
      for (const agentData of data.agents) {
        const decl = AgentCapabilityDeclaration.fromJSON(agentData);
        this._agents.set(decl.agentId, decl);
      }
    }
  }
}

// Singleton
let _instance = null;
export function getAgentCapabilityManager() {
  if (!_instance) {
    _instance = new AgentCapabilityManager();
  }
  return _instance;
}



