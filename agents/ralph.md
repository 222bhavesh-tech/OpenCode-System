# Ralph / OpenRalph — Persistent Loop Engine

## Purpose
Persistent iterative execution that survives context limits, sessions, and failures.

## Architecture
```
TASK
    │
    ▼
EXECUTE
    │
    ▼
VERIFY
    │
    ▼
SAVE STATE
    │
    ▼
FRESH CONTEXT
    │
    ▼
RE-ANCHOR
    │
    ▼
NEXT TASK
    │
    ▼
REPEAT UNTIL COMPLETE
```

## Core Loop

### Loop State
```text
Loop State
    ├── Loop ID
    ├── Current Task
    ├── Loop Iteration
    ├── Max Iterations
    ├── State Store
    ├── Completion Criteria
    ├── Progress
    ├── Retry Count
    ├── Max Retries
    └── Timestamps
```

### Loop Operations

#### Start Loop
```text
Start Loop(task)
    │
    ▼
Initialize state
    │
    ▼
Set iteration = 0
    │
    ▼
Begin execution
```

#### Execute Iteration
```text
Execute Iteration()
    │
    ▼
Increment iteration
    │
    ▼
Execute task
    │
    ▼
Verify result
    │
    ▼
Save state
    │
    ▼
Check completion
    │
    ├── Complete → End loop
    └── Not complete → Continue
```

#### Save State
```text
Save State()
    │
    ▼
Capture current state
    │
    ├── Project state
    ├── Task progress
    ├── Evidence store
    ├── Failure history
    └── Context summary
    │
    ▼
Write to persistent storage
    │
    ▼
Update Ralph state
```

#### Fresh Context
```text
Fresh Context()
    │
    ▼
Compress context
    │
    ▼
Create context snapshot
    │
    ▼
Clear conversation
    │
    ▼
Load compressed state
    │
    ▼
Resume execution
```

#### Re-anchor
```text
Re-anchor()
    │
    ▼
Load last state
    │
    ▼
Load context snapshot
    │
    ▼
Reconstruct context
    │
    ▼
Verify position
    │
    ▼
Continue from checkpoint
```

## State Persistence

### What to Persist
```text
Persistent State
    ├── Loop ID
    ├── Current task ID
    ├── Iteration count
    ├── Task status
    ├── Evidence references
    ├── Failure history
    ├── Decisions made
    ├── Context summary
    └── Timestamps
```

### Where to Persist
```text
State Files
    ├── .opencode/ralph-state.json
    ├── .opencode/ralph-evidence/
    ├── .opencode/ralph-context/
    └── .opencode/ralph-history/
```

### State Recovery
```text
State Lost
    │
    ▼
Check persistent storage
    │
    ▼
Load last saved state
    │
    ▼
Reconstruct context
    │
    ▼
Resume from checkpoint
```

## Completion Detection

### Task Completion
```text
Task Complete?
    │
    ├── All subtasks done?
    ├── All evidence collected?
    ├── All verification passed?
    └── No remaining blockers?
```

### Project Completion
```text
Project Complete?
    │
    ├── All tasks complete?
    ├── All verification passed?
    ├── All PRs merged?
    ├── All evidence stored?
    └── Final audit passed?
```

## Failure Handling

### Retry Logic
```text
Failure Occurred
    │
    ▼
Check retry count
    │
    ├── Under max → Retry with fix
    └── Over max → Escalate
```

### Failure Memory
```text
Failure occurred
    │
    ▼
Record failure
    │
    ├── Failure type
    ├── Cause
    ├── Attempted solutions
    ├── Successful solution
    ├── Affected files
    └── Prevention
    │
    ▼
Store in failure memory
    │
    ▼
Reference before similar tasks
```

## Context Rotation

### When to Rotate
```text
Context Size > Threshold
    │
    ▼
Take snapshot
    │
    ▼
Compress context
    │
    ▼
Save state
    │
    ▼
Start fresh context
    │
    ▼
Load compressed state
    │
    ▼
Continue
```

### Compression Strategy
```text
Full Context
    │
    ▼
Keep essential info
    │
    ├── Current task
    ├── Relevant files
    ├── Key decisions
    └── Recent history
    │
    ▼
Summarize old sections
    │
    ▼
Remove stale entries
    │
    ▼
Compressed context
```

## Resumability

### Session Recovery
```text
Session Interrupted
    │
    ▼
State was saved
    │
    ▼
New session starts
    │
    ▼
Load Ralph state
    │
    ▼
Reconstruct context
    │
    ▼
Resume from last checkpoint
```

### Process Recovery
```text
Process Restarted
    │
    ▼
Check persistent files
    │
    ▼
Load last state
    │
    ▼
Verify state integrity
    │
    ▼
Resume execution
```

## Loop Limits
```text
Max Iterations: 100
Max Retries per task: 3
Max Context Rotations: 10
Max State Age: 24 hours
```

## Observability
```text
Loop Status
    ├── Current iteration
    ├── Tasks completed
    ├── Tasks remaining
    ├── Time elapsed
    ├── Estimated remaining
    ├── Failures encountered
    ├── Retries used
    └── Context rotations
```
