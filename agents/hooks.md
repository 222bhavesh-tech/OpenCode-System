# Hook System — Lifecycle Hooks

## Purpose
Deterministic lifecycle hooks for system events.

## Architecture
```
EVENT TRIGGERED
    │
    ▼
CHECK HOOK REGISTRY
    │
    ▼
EXECUTE REGISTERED HOOKS
    │
    ▼
COLLECT RESULTS
    │
    ▼
CONTINUE MAIN FLOW
```

## Hook Definitions

### Task Hooks
```text
before_task
    ├── When: Before starting a task
    ├── Input: Task definition
    ├── Output: Modified task or approval
    └── Use: Validate task, set context

after_task
    ├── When: After completing a task
    ├── Input: Task result
    ├── Output: Post-processing
    └── Use: Collect evidence, update state
```

### Agent Hooks
```text
before_agent
    ├── When: Before spawning an agent
    ├── Input: Agent definition
    ├── Output: Modified agent or approval
    └── Use: Validate agent, set permissions

after_agent
    ├── When: After agent completes
    ├── Input: Agent result
    ├── Output: Post-processing
    └── Use: Collect results, update state
```

### Tool Hooks
```text
before_tool
    ├── When: Before using a tool
    ├── Input: Tool call
    ├── Output: Modified call or approval
    └── Use: Validate tool use, log

after_tool
    ├── When: After tool use
    ├── Input: Tool result
    ├── Output: Post-processing
    └── Use: Log result, validate
```

### Git Hooks
```text
before_commit
    ├── When: Before git commit
    ├── Input: Commit data
    ├── Output: Modified commit or approval
    └── Use: Validate commit, add info

after_commit
    ├── When: After git commit
    ├── Input: Commit result
    ├── Output: Post-processing
    └── Use: Update state, notify
```

### Review Hooks
```text
before_review
    ├── When: Before code review
    ├── Input: Review scope
    ├── Output: Modified scope or approval
    └── Use: Set review context

after_review
    ├── When: After code review
    ├── Input: Review result
    ├── Output: Post-processing
    └── Use: Collect feedback, update state
```

### System Hooks
```text
on_failure
    ├── When: On any failure
    ├── Input: Failure details
    ├── Output: Recovery action
    └── Use: Classify, retry, escalate

on_completion
    ├── When: On mission completion
    ├── Input: Mission result
    ├── Output: Post-processing
    └── Use: Final audit, cleanup

on_context_compaction
    ├── When: When context is compacted
    ├── Input: Context state
    ├── Output: Compacted context
    └── Use: Save state, compress

on_session_resume
    ├── When: When session resumes
    ├── Input: Saved state
    ├── Output: Restored context
    └── Use: Restore state, re-anchor
```

## Hook Rules

### Determinism
```text
Hooks must be deterministic
    │
    ├── Same input → Same output
    ├── No random behavior
    └── No external dependencies (unless documented)
```

### No Recursion
```text
Hooks must not recursively trigger themselves
    │
    ├── Track hook depth
    └── Maximum depth: 3
```

### Budget
```text
Hooks must complete within budget
    │
    ├── Time: 5 seconds max
    ├── Tokens: 1000 max
    └── Tool calls: 10 max
```

### Safety
```text
Hooks must not modify state unsafely
    │
    ├── Read-only by default
    ├── Write requires explicit permission
    └── No destructive operations
```

### Documentation
```text
All hooks must be documented
    │
    ├── Purpose
    ├── Input
    ├── Output
    ├── Side effects
    └── Limitations
```

## Hook Registry
```text
Hook Registry
    ├── Hook Name
    ├── Hook Type
    ├── Handler Function
    ├── Priority
    ├── Enabled
    └── Documentation
```

## Hook Execution
```text
Event Triggered
    │
    ▼
Look up registered hooks
    │
    ▼
Sort by priority
    │
    ▼
Execute each hook
    │
    ├── Check budget
    ├── Execute
    ├── Check result
    └── Continue or abort
    │
    ▼
Collect all results
    │
    ▼
Return to main flow
```
