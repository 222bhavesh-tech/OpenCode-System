# Harness Optimizer — Config Analysis & Optimization

## Purpose
Analyzes the OpenCode-System harness configuration for cost, quality, and performance improvements.
Inspired by opencode-agent-kit's harness-optimizer agent.

## Architecture
```
HARNESS OPTIMIZER
    │
    ├── Read current config
    ├── Analyze agent definitions
    ├── Analyze skill definitions
    ├── Analyze MCP usage
    ├── Analyze model routing
    ├── Identify bloat
    ├── Identify gaps
    └── Generate optimization report
```

## Analysis Dimensions

### 1. Cost Analysis
```text
Cost Check
    │
    ├── Count active agents (more = more context tokens)
    ├── Count active skills (more = more instructions loaded)
    ├── Count active MCPs (more = more tools available)
    ├── Estimate token usage per task
    ├── Identify unnecessary overhead
    └── Suggest reductions
```

### 2. Quality Analysis
```text
Quality Check
    │
    ├── Are verification gates present?
    ├── Are evidence requirements enforced?
    ├── Are reviews independent?
    ├── Is memory being used effectively?
    ├── Are failures being learned from?
    └── Suggest improvements
```

### 3. Performance Analysis
```text
Performance Check
    │
    ├── Context window usage (too much = slow)
    ├── Redundant tools (same capability in multiple MCPs)
    ├── Unnecessary agent spawning
    ├── Task granularity (too fine = overhead, too coarse = no progress)
    └── Suggest optimizations
```

### 4. Completeness Analysis
```text
Completeness Check
    │
    ├── All phases have tasks?
    ├── All tasks have evidence gates?
    ├── All critical paths identified?
    ├── All dependencies mapped?
    ├── All risks documented?
    └── Suggest additions
```

## Usage
```text
# CLI
node runtime/cli.mjs optimize --project .

# In code
import { HarnessOptimizer } from './harness-optimizer.mjs';
const optimizer = new HarnessOptimizer(projectRoot);
const report = await optimizer.analyze();
```

## Output Format
```json
{
  "score": 85,
  "dimensions": {
    "cost": { "score": 70, "issues": [...], "recommendations": [...] },
    "quality": { "score": 90, "issues": [...], "recommendations": [...] },
    "performance": { "score": 80, "issues": [...], "recommendations": [...] },
    "completeness": { "score": 95, "issues": [...], "recommendations": [...] }
  },
  "summary": "Overall: Good. Main issue: too many active agents for current project size.",
  "quickWins": [...],
  "criticalIssues": [...]
}
```

## Optimization Strategies

### Agent Consolidation
```text
If project < 1000 lines:
    │
    ├── Use 2-3 agents max (workspace, build, review)
    ├── Skip swarm/flow-next/forge
    └── Keep planner for complex tasks only

If project 1000-10000 lines:
    │
    ├── Use 4-5 agents
    ├── Add planner, context-engine
    └── Skip nocturne (single-developer)

If project > 10000 lines:
    │
    ├── Use full agent set
    ├── Add swarm for parallelization
    └── Add nocturne for multi-session
```

### Skill Pruning
```text
Skills loaded per task:
    │
    ├── Must have: superpowers, systematic-debugging
    ├── Should have: agent-task-workflow
    ├── May have: language-specific skill
    └── Don't load: 50+ skills simultaneously

Rule: Load only skills relevant to current task
```

### MCP Optimization
```text
MCPs active at any time:
    │
    ├── Must have: filesystem
    ├── Should have: context7 (for docs)
    ├── May have: chrome-devtools (for visual)
    └── Don't activate: all 10 MCPs simultaneously

Rule: Activate MCPs on demand, not at session start
```
