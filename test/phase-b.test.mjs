import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CapabilityRegistry, getCapabilityRegistry, CapabilityStatus, CapabilityPriority, ConflictRisk } from '../runtime/capability-registry.mjs';
import { AgentCapabilityDeclaration, AgentCapabilityManager, CapabilityType } from '../runtime/agent-capabilities.mjs';
import { BaseTool, ShellTool, FileReadTool, ToolResponse, ToolInfo, ToolCall, ToolResponseType } from '../runtime/base-tool.mjs';
import { ToolRegistry, getToolRegistry } from '../runtime/tool-registry.mjs';
import { retryWithBackoff, BackoffStrategy, withRetry } from '../runtime/retry-backoff.mjs';
import { PermissionService, PermissionDeniedError, PermissionLevel } from '../runtime/permission-wrapper.mjs';
import { MCPAdapter } from '../runtime/mcp-adapter.mjs';
import { ContextSummarizer } from '../runtime/context-summarizer.mjs';
import { Observation, ShellOutputObservation, ErrorObservation, TimeoutObservation, ObservationCollector, wrapAsObservation, ObservationType } from '../runtime/typed-observations.mjs';
import { ConflictDetectionSystem, ConflictType, ConflictSeverity } from '../runtime/capability-conflict-detection.mjs';
import { CapabilityResolver } from '../runtime/capability-resolver.mjs';

describe('Capability Registry', function() {
  it('should create a new registry', function() {
    const registry = new CapabilityRegistry();
    const stats = registry.getStats();
    assert.ok(stats.total > 0, 'Should have built-in capabilities');
  });

  it('should have OpenHands capabilities', function() {
    const registry = getCapabilityRegistry();
    const ohCaps = registry.query({ source: 'openhands' });
    assert.ok(ohCaps.length >= 3, 'Should have at least 3 OpenHands capabilities');
  });

  it('should have OpenCode capabilities', function() {
    const registry = getCapabilityRegistry();
    const ocCaps = registry.query({ source: 'opencode' });
    assert.ok(ocCaps.length >= 4, 'Should have at least 4 OpenCode capabilities');
  });

  it('should register custom capabilities', function() {
    const registry = new CapabilityRegistry();
    const result = registry.register({ id: 'test.cap', name: 'Test', source: 'test', priority: CapabilityPriority.HIGH, integrationMethod: 'adapter', conflictRisk: ConflictRisk.LOW });
    assert.strictEqual(result, true);
  });

  it('should get statistics', function() {
    const registry = getCapabilityRegistry();
    const stats = registry.getStats();
    assert.ok(stats.total > 0);
    assert.ok(typeof stats.bySource === 'object');
  });
});

describe('Agent Capability Model', function() {
  it('should create agent declarations', function() {
    const decl = new AgentCapabilityDeclaration('agent-1', [CapabilityType.CODE_EDITING, CapabilityType.SHELL_EXECUTION]);
    assert.strictEqual(decl.agentId, 'agent-1');
  });

  it('should check capabilities', function() {
    const decl = new AgentCapabilityDeclaration('agent-1', [CapabilityType.CODE_EDITING]);
    assert.strictEqual(decl.has(CapabilityType.CODE_EDITING), true);
    assert.strictEqual(decl.has(CapabilityType.DEPLOYMENT), false);
  });

  it('should select best agent', function() {
    const manager = new AgentCapabilityManager();
    manager.registerAgent(new AgentCapabilityDeclaration('coder', [CapabilityType.CODE_EDITING, CapabilityType.SHELL_EXECUTION]));
    manager.registerAgent(new AgentCapabilityDeclaration('researcher', [CapabilityType.REPOSITORY_EXPLORATION]));
    const selection = manager.selectAgent({ capabilities: [CapabilityType.CODE_EDITING] });
    assert.strictEqual(selection.best.agentId, 'coder');
  });
});

describe('BaseTool', function() {
  it('should create tool response', function() {
    const resp = ToolResponse.text('hello');
    assert.strictEqual(resp.type, ToolResponseType.TEXT);
    assert.strictEqual(resp.content, 'hello');
  });

  it('should create error response', function() {
    const resp = ToolResponse.error('fail');
    assert.strictEqual(resp.isError, true);
  });

  it('should execute tool safely', async function() {
    const tool = new FileReadTool();
    const call = new ToolCall('id-1', 'file_read', { path: '/test' });
    const result = await tool.safeRun(call);
    assert.ok(result !== null);
  });

  it('should handle tool execution errors', async function() {
    class BadTool extends BaseTool {
      constructor() { super(new ToolInfo('bad', 'Bad tool')); }
      async run() { throw new Error('Tool error'); }
    }
    const tool = new BadTool();
    const call = new ToolCall('id-1', 'bad', {});
    const result = await tool.safeRun(call);
    assert.strictEqual(result.isError, true);
  });
});

describe('Tool Registry', function() {
  it('should create registry with built-in tools', function() {
    const registry = new ToolRegistry();
    const names = registry.getToolNames();
    assert.ok(names.length >= 5);
  });

  it('should execute tool calls', async function() {
    const registry = new ToolRegistry();
    const call = new ToolCall('id-1', 'file_read', { path: '/test' });
    const result = await registry.execute(call);
    assert.ok(result !== null);
  });
});

describe('Retry Backoff', function() {
  it('should retry failed operations', async function() {
    let attempts = 0;
    const result = await retryWithBackoff(async function() {
      attempts++;
      if (attempts < 3) throw new Error('Not yet');
      return 'done';
    }, { maxRetries: 5, initialDelayMs: 10 });
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.value, 'done');
  });

  it('should fail after max retries', async function() {
    const result = await retryWithBackoff(async function() {
      throw new Error('Always fail');
    }, { maxRetries: 2, initialDelayMs: 10 });
    assert.strictEqual(result.success, false);
  });
});

describe('Permission Wrapper', function() {
  it('should create permission service', function() {
    const service = new PermissionService();
    assert.ok(service !== null);
  });

  it('should check permissions', function() {
    const service = new PermissionService();
    const result = service.checkPermission('shell', ['shell:execute']);
    assert.ok(result.needsApproval === true || result.allowed === true);
  });
});

describe('MCP Adapter', function() {
  it('should create MCP adapter', function() {
    const adapter = new MCPAdapter();
    assert.ok(adapter !== null);
  });

  it('should register servers', function() {
    const adapter = new MCPAdapter();
    adapter.registerServer('test', { listTools: async function() { return []; } });
    assert.strictEqual(adapter.getServerCount(), 1);
  });
});

describe('Context Summarizer', function() {
  it('should create summarizer', function() {
    const summarizer = new ContextSummarizer();
    assert.ok(summarizer !== null);
  });

  it('should detect when summarization needed', function() {
    const summarizer = new ContextSummarizer(null, { maxTokensBeforeSummarize: 100 });
    const messages = [{ content: 'x'.repeat(500) }];
    assert.strictEqual(summarizer.needsSummarization(messages), true);
  });
});

describe('Typed Observations', function() {
  it('should create shell output observation', function() {
    const obs = new ShellOutputObservation('output', 0);
    assert.strictEqual(obs.type, ObservationType.SHELL_OUTPUT);
    assert.strictEqual(obs.success, true);
  });

  it('should create error observation', function() {
    const obs = new ErrorObservation('error', 'test-error');
    assert.strictEqual(obs.type, ObservationType.ERROR);
    assert.strictEqual(obs.success, false);
  });

  it('should collect observations', function() {
    const collector = new ObservationCollector();
    collector.add(new ShellOutputObservation('out', 0));
    collector.add(new ErrorObservation('err', 'test'));
    const stats = collector.getStats();
    assert.strictEqual(stats.total, 2);
    assert.strictEqual(stats.failed, 1);
  });
});

describe('Conflict Detection', function() {
  it('should detect second orchestrator', function() {
    const detector = new ConflictDetectionSystem();
    const result = detector.checkCapability({ id: 'test', name: 'Mission Orchestrator', description: 'A second orchestrator' });
    assert.strictEqual(result.hasConflict, true);
  });

  it('should allow safe capabilities', function() {
    const detector = new ConflictDetectionSystem();
    const result = detector.checkCapability({ id: 'test', name: 'File Reader', description: 'Reads files' });
    assert.strictEqual(result.hasConflict, false);
  });
});

describe('Capability Resolver', function() {
  it('should resolve task requirements', function() {
    const resolver = new CapabilityResolver();
    const result = resolver.resolve({ type: 'code-edit' });
    assert.strictEqual(result.taskType, 'code-edit');
    assert.ok(result.tools !== undefined);
  });

  it('should get summary', function() {
    const resolver = new CapabilityResolver();
    const summary = resolver.getSummary({ type: 'code-edit' });
    assert.strictEqual(summary.taskType, 'code-edit');
  });
});
