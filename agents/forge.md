# Forge — Autonomous Execution Engine

## Purpose
Safe autonomous execution with isolation, recovery, and budget management.

## Architecture
```
GOAL
    │
    ▼
PLAN
    │
    ▼
EXECUTE
    │
    ├── Build
    ├── Debug
    ├── Specialist
    └── Background
    │
    ▼
TEST
    │
    ▼
AUDIT
    │
    ├── PASS → COMMIT
    └── FAIL → FIX → REPEAT
```

## Execution Modes

### Interactive
```text
User → Agent → User approval → Next step
```

### Assisted
```text
User goal → Plan → User approval → Autonomous execution
```

### Autonomous
```text
User goal → Plan → Execute → Verify → Fix → Continue → Complete
```

### Project Autonomous
```text
Epic → Task DAG → Parallel execution → Verification → PRs → Integration → Final audit
```

## Execution Components

### 1. Build Engine
```text
Task Received
    │
    ▼
Understand requirements
    │
    ▼
Locate relevant code
    │
    ▼
Implement changes
    │
    ▼
Run tests
    │
    ▼
Verify build
    │
    ▼
Report result
```

### 2. Debug Engine
```text
Failure Detected
    │
    ▼
Analyze error
    │
    ▼
Locate cause
    │
    ▼
Create hypothesis
    │
    ▼
Inspect code
    │
    ▼
Patch
    │
    ▼
Targeted test
    │
    ▼
Regression test
    │
    ▼
Review
    │
    ▼
PASS? → Continue
FAIL? → New hypothesis or escalate
```

### 3. Specialist Engine
```text
Task Requires Specialist
    │
    ▼
Determine specialist type
    │
    ▼
Spawn specialist
    │
    ▼
Assign task
    │
    ▼
Monitor execution
    │
    ▼
Collect results
    │
    ▼
Integrate output
```

### 4. Background Engine
```text
Long-running Task
    │
    ▼
Spawn background agent
    │
    ▼
Set budget/timeout
    │
    ▼
Continue main flow
    │
    ▼
Monitor progress
    │
    ▼
Collect results when done
```

## Isolation

### Worktree Isolation
```text
Task Requires Isolation
    │
    ▼
Create git worktree
    │
    ▼
Work in isolated directory
    │
    ▼
Test changes
    │
    ▼
Merge if successful
    │
    ▼
Clean up worktree
```

### Sandbox Execution
```text
High-risk Task
    │
    ▼
Create sandbox
    │
    ├── Restricted filesystem
    ├── Limited network
    └── Controlled tools
    │
    ▼
Execute in sandbox
    │
    ▼
Verify results
    │
    ▼
Apply to main if safe
```

## Budget Management

### Token Budget
```text
Task Budget
    ├── Maximum tokens per task
    ├── Track usage
    └── Stop when exceeded
```

### Time Budget
```text
Task Budget
    ├── Maximum time per task
    ├── Track duration
    └── Stop when exceeded
```

### Iteration Budget
```text
Task Budget
    ├── Maximum retry attempts
    ├── Track attempts
    └── Escalate when exceeded
```

### Tool-call Budget
```text
Task Budget
    ├── Maximum tool calls
    ├── Track usage
    └── Stop when exceeded
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

### Recovery Strategies
```text
CODE → Fix code, re-run
DEPENDENCY → Install/update, re-run
CONFIG → Fix config, re-run
ENVIRONMENT → Setup environment, re-run
NETWORK → Retry, alternative route
DATABASE → Fix query, re-run
API → Handle error, retry
TEST → Fix test, re-run
BUILD → Fix build, re-run
ARCHITECTURE → Replan, redesign
SECURITY → Fix vulnerability, re-run
EXTERNAL → Retry, alternative, escalate
```

### Retry Logic
```text
Failure Classified
    │
    ▼
Check retry count
    │
    ├── Under limit → Apply recovery strategy
    └── Over limit → Escalate
```

## Goal Completion Detection
```text
Check Goal
    │
    ▼
All tasks complete?
    │
    ├── No → Continue
    └── Yes ↓
All verification passed?
    │
    ├── No → Fix failures
    └── Yes ↓
All evidence collected?
    │
    ├── No → Collect evidence
    └── Yes ↓
PROJECT COMPLETE
```

## Audit Trail
```text
Every Action Logged
    │
    ├── Timestamp
    ├── Agent
    ├── Action
    ├── Input
    ├── Output
    ├── Result
    ├── Duration
    └── Cost
```
