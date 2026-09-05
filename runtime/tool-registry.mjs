import { ShellTool, FileReadTool, FileWriteTool, FileEditTool, GlobTool, GrepTool, PatchTool } from './base-tool.mjs';

const TOOL_SETS = {
  full: ['shell', 'file_read', 'file_write', 'file_edit', 'glob', 'grep', 'patch'],
  readOnly: ['file_read', 'glob', 'grep'],
  editOnly: ['file_read', 'file_write', 'file_edit', 'patch'],
  minimal: ['file_read'],
};

export class ToolRegistry {
  constructor() {
    this._tools = new Map();
    this._agentToolSets = new Map();
    this._initializeBuiltinTools();
  }
  _initializeBuiltinTools() {
    this.register(new ShellTool(['shell:execute']));
    this.register(new FileReadTool());
    this.register(new FileWriteTool(['file:write']));
    this.register(new FileEditTool(['file:edit']));
    this.register(new GlobTool());
    this.register(new GrepTool());
    this.register(new PatchTool(['file:edit']));
  }
  register(tool) { this._tools.set(tool.info().name, tool); }
  unregister(toolName) { this._tools.delete(toolName); }
  get(toolName) { return this._tools.get(toolName) || null; }
  getAll() { return [...this._tools.values()]; }
  getToolNames() { return [...this._tools.keys()]; }
  setAgentToolSet(agentRole, toolNames) {
    for (const name of toolNames) { if (!this._tools.has(name)) throw new Error('Tool not found: ' + name); }
    this._agentToolSets.set(agentRole, toolNames);
  }
  getToolsForAgent(agentRole) {
    const names = this._agentToolSets.get(agentRole) || TOOL_SETS.full;
    return names.map(n => this._tools.get(n)).filter(Boolean);
  }
  getToolsBySet(setName) {
    return (TOOL_SETS[setName] || TOOL_SETS.full).map(n => this._tools.get(n)).filter(Boolean);
  }
  getToolInfos() { return [...this._tools.values()].map(t => ({ name: t.info().name, description: t.info().description })); }
  async execute(toolCall) {
    const tool = this._tools.get(toolCall.name);
    if (!tool) throw new Error('Tool not found: ' + toolCall.name);
    return tool.safeRun(toolCall);
  }
  export() { return { tools: this.getToolNames(), agentToolSets: Object.fromEntries(this._agentToolSets) }; }
}

let _instance = null;
export function getToolRegistry() { if (!_instance) _instance = new ToolRegistry(); return _instance; }