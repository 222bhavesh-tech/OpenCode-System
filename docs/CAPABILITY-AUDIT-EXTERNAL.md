# External Capability Audit: OpenHands + OpenCode
## Date: 2026-09-05
## Status: COMPLETE
## Location: C:\Users\bhavesh jeengar\OpenCode-System\docs\CAPABILITY-AUDIT-EXTERNAL.md

---

## SOURCE 1: OpenHands (All-Hands-AI/OpenHands)
- **Repository**: https://github.com/All-Hands-AI/OpenHands
- **Language**: Python (agent SDK) + TypeScript/React (web UI)
- **License**: MIT (runtime); Apache-2.0 (openhands-resolver)
- **Architecture**: Docker sandbox + EventStream agent loop + CodeActAgent

### Capabilities Discovered
1. **Action/Observation Pattern** (HIGH) - Typed actions/observations for agent execution
2. **Runtime Lifecycle Hooks** (MEDIUM) - Pre/post-flight for worker execution context
3. **Retry with Backoff** (HIGH) - 5 retries with backoff between attempts
4. **Issue/PR Resolution Pipeline** (HIGH) - Issue to patch to PR automated pipeline
5. **Success Guessing with LLM** (MEDIUM) - LLM-based success evaluation
6. **Multi-Process Parallel Resolution** (MEDIUM) - Parallel issue resolution
7. **Sandbox Isolation** (LOW) - Docker-based isolation (SKIP - no Docker)

---

## SOURCE 2: OpenCode (opencode-ai/opencode)
- **Repository**: https://github.com/opencode-ai/opencode
- **Language**: Go
- **License**: MIT
- **Architecture**: TUI + Agent loop + Tool system + MCP integration + LSP

### Capabilities Discovered
1. **Tool Execution Loop** (HIGH) - Streaming tool execution with finish reasons
2. **BaseTool Interface** (HIGH) - Standardized tool interface (Info + Run)
3. **Permission System** (HIGH) - Per-tool permission verification
4. **MCP Tool Integration** (HIGH) - Dynamic MCP tool discovery
5. **Session Management** (MEDIUM) - Sessions with cost/token tracking
6. **Context Summarization** (MEDIUM) - LLM-based conversation compression
7. **Agent Delegation** (MEDIUM) - Tool-restricted sub-agent spawning
8. **Tool Registry** (MEDIUM) - Agent-specific tool sets
9. **Cost Tracking** (LOW) - Per-session cost calculation
10. **Sourcegraph Integration** (LOW) - Code search (SKIP - use Firecrawl)
11. **Diagnostics/LSP** (LOW) - LSP-based diagnostics
12. **Fetch Tool** (LOW) - Already covered by Fetch MCP

---

## ARCHITECTURAL CONFLICT ANALYSIS
- No second orchestrator/scheduler/state store/memory/permission created
- All integrations through adapter boundaries behind ControlPlane
- OpenHands and OpenCode are capability sources, NOT authorities

---

## RECOMMENDED INTEGRATION ORDER
Phase 3: Capability Registry (runtime/capability-registry.mjs)
Phase 4: Agent Capability Model (agents declare capabilities)
Phase 5: Core Adapters (base-tool.mjs, tool-registry.mjs, mcp-adapter.mjs)
Phase 6: Enhancement Adapters (backoff, typed observations, permissions)
Phase 7: Advanced Adapters (issue-resolver.mjs, context-summarizer.mjs)
Phase 8: Conflict Detection System
Phase 9: Dynamic Capability Selection in DecisionEngine
Phase 10: Verification

---

## CAPABILITY COUNT
- OpenHands: 7 capabilities (3 HIGH, 3 MEDIUM, 1 LOW, 1 SKIP)
- OpenCode: 12 capabilities (4 HIGH, 4 MEDIUM, 4 LOW)
- Total: 19 capabilities (7 HIGH, 7 MEDIUM, 5 LOW)

## FILES TO CREATE
1. runtime/capability-registry.mjs
2. runtime/base-tool.mjs
3. runtime/tool-registry.mjs
4. runtime/mcp-adapter.mjs
5. runtime/issue-resolver.mjs
6. runtime/context-summarizer.mjs
7. test/capability-inheritance.test.mjs

## FILES TO MODIFY
1. runtime/failure-strategy.mjs - Add backoff
2. runtime/worker.mjs - Add typed observations + permissions
3. runtime/decision-engine.mjs - Add capability-based selection
4. AGENTS.md - Document Phase B
5. docs/PRD.md - Update with capability inheritance
