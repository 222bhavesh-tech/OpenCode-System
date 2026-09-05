# Flow-Next — Task Graph DAG Engine

## Purpose
Project-level task orchestration with dependency-aware scheduling.

## Architecture
```
PROJECT / EPIC
    │
    ▼
TASK GRAPH (DAG)
    │
    ├── Tasks
    ├── Dependencies
    ├── Priority
    ├── Parallel Groups
    └── Critical Path
    │
    ▼
SCHEDULER
    │
    ├── Ready Tasks (no blockers)
    ├── Parallel Execution
    ├── Dependency Resolution
    └── Priority Ordering
    │
    ▼
EXECUTION
    │
    ├── Assign to Specialists
    ├── Monitor Progress
    ├── Handle Blockers
    └── Update State
```

## Task Graph Structure

### Task Definition
```text
Task
    ├── Task ID (TASK-NNN)
    ├── Title
    ├── Description
    ├── Status (PENDING, IN_PROGRESS, BLOCKED, COMPLETE, FAILED)
    ├── Priority (CRITICAL, HIGH, MEDIUM, LOW)
    ├── Assigned To (agent/specialist)
    ├── Dependencies (list of task IDs)
    ├── Blocks (list of task IDs)
    ├── Parallelizable (YES/NO)
    ├── Estimated Effort (XS, S, M, L, XL)
    ├── Acceptance Criteria
    ├── Evidence Required
    └── Notes
```

### Dependency Types
```text
FINISH_TO_START (default)
    Task B starts after Task A finishes

START_TO_START
    Task B starts when Task A starts

FINISH_TO_FINISH
    Task B finishes when Task A finishes

START_TO_FINISH
    Task B finishes when Task A starts
```

### Parallel Group Detection
```text
Task Graph Analyzed
    │
    ▼
Identify independent tasks
    │
    ├── No dependencies
    └── Not blocking others
    │
    ▼
Group into parallel sets
    │
    ▼
Schedule for concurrent execution
```

### Critical Path Analysis
```text
Task Graph Analyzed
    │
    ▼
Calculate longest path
    │
    ├── Sum task durations
    └── Find maximum path
    │
    ▼
Mark critical tasks
    │
    ▼
Prioritize critical path
```

## DAG Operations

### Add Task
```text
Add Task(task_data)
    │
    ▼
Validate task data
    │
    ▼
Add to graph
    │
    ▼
Update dependencies
    │
    ▼
Recalculate critical path
```

### Complete Task
```text
Complete Task(task_id, evidence)
    │
    ▼
Mark task complete
    │
    ▼
Store evidence
    │
    ▼
Check blocked tasks
    │
    ▼
Unblock ready tasks
    │
    ▼
Update schedule
```

### Fail Task
```text
Fail Task(task_id, error)
    │
    ▼
Mark task failed
    │
    ▼
Store failure
    │
    ▼
Determine impact
    │
    ├── Can retry → Retry
    ├── Can skip → Skip
    ├── Blocks others → Escalate
    └── Critical → Abort mission
```

## Scheduler

### Ready Task Detection
```text
For each task:
    │
    ▼
Check dependencies
    │
    ├── All dependencies complete → READY
    └── Any dependency incomplete → WAITING
    │
    ▼
Filter READY tasks
    │
    ▼
Sort by priority
    │
    ▼
Assign to available specialists
```

### Priority Scheduling
```text
CRITICAL tasks first
    │
    ▼
HIGH tasks second
    │
    ▼
MEDIUM tasks third
    │
    ▼
LOW tasks last
```

### Parallel Scheduling
```text
Ready tasks identified
    │
    ▼
Check for conflicts
    │
    ├── No conflicts → Parallel execution
    └── Conflicts → Serialize
    │
    ▼
Assign to specialists
    │
    ▼
Monitor execution
```

## State Management

### Task State
```text
Task State
    ├── Task ID
    ├── Status
    ├── Assigned To
    ├── Start Time
    ├── End Time
    ├── Duration
    ├── Attempts
    ├── Evidence
    └── Notes
```

### Project State
```text
Project State
    ├── Total Tasks
    ├── Completed
    ├── In Progress
    ├── Blocked
    ├── Failed
    ├── Pending
    ├── Critical Path
    ├── Parallel Groups
    └── Progress %
```

## Evidence Tracking
```text
Task Complete
    │
    ▼
Collect evidence
    │
    ├── Test results
    ├── Build logs
    ├── Screenshots
    ├── API responses
    └── Code changes
    │
    ▼
Store in evidence store
    │
    ▼
Link to task
    │
    ▼
Make available for review
```

## Re-anchoring
```text
Context Lost
    │
    ▼
Load project state
    │
    ▼
Load task graph
    │
    ▼
Identify current position
    │
    ▼
Reconstruct context
    │
    ▼
Resume execution
```
