export const ToolResponseType = { TEXT: 'text', IMAGE: 'image', ERROR: 'error' };

export class ToolResponse {
  constructor(type, content, metadata, isError) {
    this.type = type || ToolResponseType.TEXT;
    this.content = content || '';
    this.metadata = metadata || null;
    this.isError = isError || false;
  }
  static text(content, metadata) { return new ToolResponse(ToolResponseType.TEXT, content, metadata); }
  static error(content, metadata) { return new ToolResponse(ToolResponseType.ERROR, content, metadata, true); }
  static image(content, metadata) { return new ToolResponse(ToolResponseType.IMAGE, content, metadata); }
}

export class ToolInfo {
  constructor(name, description, parameters, required) {
    this.name = name;
    this.description = description;
    this.parameters = parameters || {};
    this.required = required || [];
  }
}

export class ToolCall {
  constructor(id, name, input) {
    this.id = id;
    this.name = name;
    this.input = typeof input === 'string' ? JSON.parse(input) : (input || {});
  }
}

export class BaseTool {
  constructor(info, permissions) {
    if (new.target === BaseTool) throw new Error('BaseTool is abstract');
    this._info = info instanceof ToolInfo ? info : new ToolInfo(info.name, info.description, info.parameters, info.required);
    this._permissions = permissions || [];
  }
  info() { return this._info; }
  getPermissions() { return this._permissions.slice(); }
  canRun(toolCall) { return true; }
  async run(toolCall) { throw new Error('run() must be implemented by subclass'); }
  async safeRun(toolCall) {
    try {
      if (!this.canRun(toolCall)) return ToolResponse.error('Permission denied for tool: ' + this._info.name);
      return await this.run(toolCall);
    } catch (error) {
      return ToolResponse.error('Tool execution failed: ' + error.message);
    }
  }
}

export class ShellTool extends BaseTool {
  constructor(permissions) {
    super(new ToolInfo('shell', 'Execute a shell command', { command: { type: 'string' }, workdir: { type: 'string' }, timeout: { type: 'number' } }, ['command']), permissions);
  }
  async run(toolCall) {
    return ToolResponse.text('Shell execution: ' + toolCall.input.command);
  }
}

export class FileReadTool extends BaseTool {
  constructor(permissions) {
    super(new ToolInfo('file_read', 'Read file contents', { path: { type: 'string' }, offset: { type: 'number' }, limit: { type: 'number' } }, ['path']), permissions);
  }
  async run(toolCall) {
    return ToolResponse.text('File read: ' + toolCall.input.path);
  }
}

export class FileWriteTool extends BaseTool {
  constructor(permissions) {
    super(new ToolInfo('file_write', 'Write content to a file', { path: { type: 'string' }, content: { type: 'string' } }, ['path', 'content']), permissions);
  }
  async run(toolCall) {
    return ToolResponse.text('File written: ' + toolCall.input.path);
  }
}

export class FileEditTool extends BaseTool {
  constructor(permissions) {
    super(new ToolInfo('file_edit', 'Edit file contents', { path: { type: 'string' }, oldText: { type: 'string' }, newText: { type: 'string' } }, ['path', 'oldText', 'newText']), permissions);
  }
  async run(toolCall) {
    return ToolResponse.text('File edited: ' + toolCall.input.path);
  }
}

export class GlobTool extends BaseTool {
  constructor() {
    super(new ToolInfo('glob', 'Find files by pattern', { pattern: { type: 'string' }, path: { type: 'string' } }, ['pattern']));
  }
  async run(toolCall) { return ToolResponse.text('Glob: ' + toolCall.input.pattern); }
}

export class GrepTool extends BaseTool {
  constructor() {
    super(new ToolInfo('grep', 'Search file contents', { pattern: { type: 'string' }, path: { type: 'string' }, include: { type: 'string' } }, ['pattern']));
  }
  async run(toolCall) { return ToolResponse.text('Grep: ' + toolCall.input.pattern); }
}

export class PatchTool extends BaseTool {
  constructor(permissions) {
    super(new ToolInfo('patch', 'Apply unified diff patch', { patch: { type: 'string' } }, ['patch']), permissions);
  }
  async run(toolCall) { return ToolResponse.text('Patch applied'); }
}