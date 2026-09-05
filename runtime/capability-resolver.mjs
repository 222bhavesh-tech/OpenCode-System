import { getCapabilityRegistry, CapabilityStatus } from './capability-registry.mjs';
import { getAgentCapabilityManager, CapabilityType } from './agent-capabilities.mjs';
import { getToolRegistry } from './tool-registry.mjs';
import { getConflictDetectionSystem } from './capability-conflict-detection.mjs';

export class CapabilityResolver {
  constructor() {
    this._registry = getCapabilityRegistry();
    this._agentManager = getAgentCapabilityManager();
    this._toolRegistry = getToolRegistry();
    this._conflictDetector = getConflictDetectionSystem();
  }
  resolve(task) {
    var type = task.type || 'code-edit';
    var capabilities = task.capabilities || [];
    var riskLevel = task.riskLevel || 0.5;
    var budgetMs = task.budgetMs || 60000;
    var stdReqs = this._agentManager.constructor.getTaskCapabilityRequirements(type);
    var allRequired = stdReqs.capabilities.concat(capabilities).filter(function(v, i, a) { return a.indexOf(v) === i; });
    var allPreferred = stdReqs.preferredCapabilities.filter(function(v, i, a) { return a.indexOf(v) === i; });
    var agentSelection = this._agentManager.selectAgent({ capabilities: allRequired, preferredCapabilities: allPreferred, riskLevel: riskLevel, budgetMs: budgetMs });
    var tools = agentSelection.best ? this._toolRegistry.getToolsForAgent(type) : this._toolRegistry.getToolsBySet('readOnly');
    var conflictCheck = this._conflictDetector.checkAll();
    return { taskType: type, requiredCapabilities: allRequired, preferredCapabilities: allPreferred, agent: agentSelection.best, candidates: agentSelection.candidates, tools: tools.map(function(t) { return { name: t.info().name, description: t.info().description }; }), conflicts: conflictCheck, safe: conflictCheck.safe, timestamp: Date.now() };
  }
  getSummary(task) {
    var resolution = this.resolve(task);
    return { taskType: task.type, agent: resolution.agent ? resolution.agent.agentId : 'none', toolCount: resolution.tools.length, requiredCapabilities: resolution.requiredCapabilities, safe: resolution.safe };
  }
}

let _instance = null;
export function getCapabilityResolver() { if (!_instance) _instance = new CapabilityResolver(); return _instance; }