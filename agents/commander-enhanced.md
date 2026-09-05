# Commander Enhancement — Single Orchestration Authority

## Purpose
Upgrade Commander to be the single master orchestrator with hooks, background agents, and state persistence.

## Architecture
```
COMMANDER (SINGLE AUTHORITY)
    │
    ├── Mission Control
    │   ├── Goal Intake
    │   ├── Mission State
    │   ├── Progress Tracking
    │   └── Completion Detection
    │
    ├── Agent Management
    │   ├── Agent Selection
    │   ├── Agent Spawning
    │   ├── Agent Monitoring
    │   ├── Agent Termination
    │   └── Background Agents
    │
    ├── Task Orchestration
    │   ├── Task Decomposition
    │   ├── Dependency Resolution
    │   ├── Parallel Scheduling
    │   └── Critical Path
    │
    ├── Hook System
    │   ├── before_task
    │   ├── after_task
    │   ├── before_agent
    │   ├── after_agent
    │   ├── on_failure
    │   ├── on_completion
    │   └── on_context_compaction
    │
    ├── State Management
    │   ├── Project State
    │   ├── Mission State
    │   ├── Agent States
    │   └── Persistent Storage
    │
    └── Recovery
        ├── Failure Detection
        ├── Failure Classification
        ├── Retry Logic
        ├── Escalation
        └── State Restoration
```

## Commander Loop
```
INTAKE
    │
    ▼
UNDERSTAND
    │
    ├── Research (via Researcher)
    ├── Explore (via Explorer)
    └── Requirements (via Requirements Agent)
    │
    ▼
PLAN
    │
    ├── Brainstorm (via Superpowers)
    ├── Specify (via Superpowers)
    ├── Design (via Architect)
    ├── Task Graph (via Flow-Next)
    └── Plan Review (via Reviewer)
    │
    ▼
DELEGATE
    │
    ├── Select Agents (via Swarm)
    ├── Assign Tasks
    ├── Set Budgets
    └── Start Execution
    │
    ▼
EXECUTE
    │
    ├── Monitor Progress
    ├── Handle Failures
    ├── Manage Background Agents
    └── Update State
    │
    ▼
VERIFY
    │
    ├── Run Tests
    ├── Browser Verification
    ├── Security Review
    ├── Code Review
    └── Evidence Collection
    │
    ▼
DECIDE
    │
    ├── PASS → COMMIT → NEXT TASK
    └── FAIL → DEBUG → FIX → RE-VERIFY
```

## Hook System

### Hook Definitions
```text
before_task         → Before starting a task
after_task          → After completing a task
before_agent        → Before spawning an agent
after_agent         → After agent completes
before_tool         → Before using a tool
after_tool          → After tool use
before_commit       → Before git commit
after_commit        → After git commit
before_review       → Before code review
after_review        → After code review
on_failure          → On any failure
on_completion       → On mission completion
on_context_compaction → When context is compressed
on_session_resume   → When session resumes
```

### Hook Rules
1. Hooks must be deterministic
2. Hooks must not recursively trigger themselves
3. Hooks must complete within budget
4. Hooks must not modify state unsafely
5. Hooks must be documented

### Hook Implementation
```text
Event Triggered
    │
    ▼
Check hook registry
    │
    ▼
Execute registered hooks
    │
    ▼
Collect results
    │
    ▼
Continue main flow
```

## Background Agents

### What Are Background Agents
Agents that continue working while the main flow proceeds:

```text
Commander
    │
    ├── Main Task → Agent A
    ├── Background Research → Agent B (continues independently)
    ├── Background Testing → Agent C (continues independently)
    └── Monitor all agents
```

### Background Agent Rules
1. Background agents must report progress
2. Background agents must have timeouts
3. Background agents must be cancellable
4. Background agent results must be collected
5. Background agents must not conflict with main flow

### Agent State Tracking
```text
Agent State
    ├── Agent ID
    ├── Agent Type
    ├── Current Task
    ├── Status (running, paused, completed, failed)
    ├── Progress
    ├── Start Time
    ├── Last Update
    ├── Budget Remaining
    └── Results
```

## State Management

### Project State
```text
Project State
    ├── Project Name
    ├── Project Path
    ├── Technology Stack
    ├── Architecture
    ├── Active Mission
    ├── Task Progress
    ├── Evidence Store
    ├── Failure History
    ├── Decisions Made
    └── Next Actions
```

### Mission State
```text
Mission State
    ├── Mission ID
    ├── Objective
    ├── Status (planning, executing, verifying, complete)
    ├── Current Phase
    ├── Active Tasks
    ├── Completed Tasks
    ├── Failed Tasks
    ├── Active Agents
    ├── Evidence
    └── Timestamps
```

## Recovery System

### Failure Detection
```text
Action Executed
    │
    ▼
Check result
    │
    ├── Success → Continue
    └── Failure → Classify
```

### Failure Classification
```text
CODE        → Syntax, logic, runtime errors
DEPENDENCY  → Missing packages, version conflicts
CONFIG      → Configuration errors
ENVIRONMENT → Missing tools, wrong versions
NETWORK     → Connection failures
DATABASE    → Query errors, migration failures
API         → API errors, rate limiting
TEST        → Test failures
BUILD       → Build errors
ARCHITECTURE → Design issues
SECURITY    → Vulnerability found
EXTERNAL    → Third-party service failures
```

### Retry Logic
```text
Failure Classified
    │
    ▼
Check retry count
    │
    ├── Under limit → Retry with fix
    └── Over limit → Escalate
```

### Escalation
```text
Escalation Needed
    │
    ▼
Determine escalation type
    │
    ├── Alternative specialist
    ├── Alternative approach
    ├── User intervention
    └── Mission abort
```
