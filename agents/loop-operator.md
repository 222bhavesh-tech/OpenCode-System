# Loop Operator — Autonomous Scheduler Wrapper

## Purpose
Autonomous loop management: monitoring, recovery, replanning, and budget enforcement.
Extends the Scheduler with intelligence — not just task execution, but adaptive control.

## Architecture
```
LOOP OPERATOR
    │
    ├── Wraps Scheduler
    ├── Monitors task execution
    ├── Detects failures and stalls
    ├── Triggers recovery actions
    ├── Replans when blocks found
    └── Enforces budgets
```

## Capabilities

### 1. Autonomous Monitoring
```text
Monitor Loop
    │
    ├── Track task progress
    ├── Detect stalled tasks (no progress > N seconds)
    ├── Detect repeated failures (same task failing N times)
    ├── Track resource usage (time, tokens, iterations)
    └── Report anomalies
```

### 2. Recovery Actions
```text
Recovery Hierarchy
    │
    ├── RETRY: Same task, same approach (1-3 times)
    ├── ESCALATE: Change approach (different executor, different command)
    ├── SKIP: Mark task as blocked, move to next
    ├── REPLAN: Rebuild task graph from current state
    └── ABORT: Halt loop, report to commander
```

### 3. Stall Detection
```text
Stall Detection
    │
    ├── Task running > timeout → kill + classify
    ├── Same task failed 3+ times → escalate or skip
    ├── No tasks ready for > 60s → replan
    ├── Budget 80% consumed → warn
    └── Budget 100% consumed → stop
```

### 4. Adaptive Replanning
```text
When blocked:
    │
    ├── Analyze failure pattern
    ├── Identify root cause (CODE, DEPENDENCY, NETWORK, etc.)
    ├── Suggest alternative approach
    ├── Create replacement tasks
    └── Resume loop
```

## Usage
```text
# CLI
node runtime/cli.mjs loop --project . --max 50 --timeout 600000

# In code
import { LoopOperator } from './loop-operator.mjs';
const loop = new LoopOperator(plane, { maxIterations: 50 });
const result = await loop.run();
```

## Events
```text
loop:start       — Loop begins
loop:iteration   — Each iteration
loop:task-done   — Task completed
loop:task-fail   — Task failed
loop:recovery    — Recovery action taken
loop:replan      — Replanning triggered
loop:stall       — Stall detected
loop:budget      — Budget warning
loop:complete    — Loop finished
loop:abort       — Loop aborted
```

## Recovery Strategies

### Code Errors
```text
Code error detected
    │
    ├── Read error message
    ├── Search for similar past failures in memory
    ├── If pattern found → apply known fix
    ├── If new → create diagnostic task
    └── Retry with fix
```

### Dependency Errors
```text
Dependency error detected
    │
    ├── Check if package exists
    ├── Try install/reinstall
    ├── Check version compatibility
    └── If unresolvable → skip + report
```

### Network Errors
```text
Network error detected
    │
    ├── Wait with exponential backoff
    ├── Retry up to 3 times
    ├── Check if service is available
    └── If persistent → skip + report
```

### Timeout Errors
```text
Timeout detected
    │
    ├── Kill long-running task
    ├── Check if progress was made
    ├── Split into smaller tasks
    └── Resume with smaller scope
```

## Budget Enforcement
```text
Budget Check (every iteration)
    │
    ├── Iterations remaining?
    ├── Time remaining?
    ├── Token budget remaining?
    │
    ├── All OK → continue
    ├── Warning (>80%) → emit warning
    └── Exhausted → stop loop
```

## Integration with Control Plane
```text
Loop Operator
    │
    ├── Reads: project state, task graph, failures
    ├── Writes: recovery tasks, replanned tasks
    ├── Events: progress, failures, completions
    └── Reports: summary, recommendations
```
