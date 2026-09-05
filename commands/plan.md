# /plan — Flow-Next Task Graph

## Purpose
Create a dependency-aware task graph for the current mission.

## Usage
```
/plan
/plan --from <mission-id>
/plan --from-current
```

## Flow
1. Get current mission or specified mission
2. Analyze requirements
3. Decompose into tasks
4. Map dependencies
5. Identify parallel groups
6. Create task graph (from templates/task-graph.md)
7. Identify critical path
8. Present to Commander for approval

## Output
- Task graph created
- Dependencies mapped
- Parallel groups identified
- Critical path identified
- Commander approval requested

## Task Graph Structure
```
TASK-001 ──► TASK-002 ──► TASK-003
                  │
                  └──► TASK-004
```

## Task Properties
- Status: PENDING | IN_PROGRESS | BLOCKED | COMPLETE | FAILED
- Priority: CRITICAL | HIGH | MEDIUM | LOW
- Dependencies: [list of task IDs]
- Parallelizable: YES | NO
- Assigned To: [agent/specialist]
- Effort: XS | S | M | L | XL
