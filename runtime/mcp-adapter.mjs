import { BaseTool, ToolResponse, ToolInfo } from './base-tool.mjs';

export class MCPToolAdapter extends BaseTool {
  constructor(mcpServer, toolSchema) {
    super(new ToolInfo('mcp_' + toolSchema.name, toolSchema.description || 'MCP tool', toolSchema.inputSchema || {}, Object.keys(toolSchema.inputSchema || {})));
    this._mcpServer = mcpServer;
    this._toolSchema = toolSchema;
  }
  async run(toolCall) {
    try {
      const result = await this._mcpServer.callTool(this._toolSchema.name, toolCall.input);
      return ToolResponse.text(JSON.stringify(result));
    } catch (error) {
      return ToolResponse.error('MCP tool error: ' + error.message);
    }
  }
}

export class MCPAdapter {
  constructor() {
    this._servers = new Map();
    this._tools = new Map();
  }
  registerServer(serverName, server) { this._servers.set(serverName, server); }
  unregisterServer(serverName) {
    this._servers.delete(serverName);
    for (const [toolId, tool] of this._tools) {
      if (tool.serverName === serverName) this._tools.delete(toolId);
    }
  }
  async discoverTools() {
    const discovered = [];
    for (const [serverName, server] of this._servers) {
      try {
        if (server.listTools) {
          const tools = await server.listTools();
          for (const tool of tools) {
            const toolId = 'mcp_' + serverName + '_' + tool.name;
            this._tools.set(toolId, { id: toolId, serverName: serverName, name: tool.name, adapter: new MCPToolAdapter(server, tool), discoveredAt: Date.now() });
            discovered.push(toolId);
          }
        }
      } catch (error) { console.error('Failed to discover tools from ' + serverName + ': ' + error.message); }
    }
    return discovered;
  }
  getTools() { return [...this._tools.values()].map(function(t) { return t.adapter; }); }
  getTool(toolId) { const entry = this._tools.get(toolId); return entry ? entry.adapter : null; }
  getToolCount() { return this._tools.size; }
  getServerCount() { return this._servers.size; }
}

let _instance = null;
export function getMCPAdapter() { if (!_instance) _instance = new MCPAdapter(); return _instance; }