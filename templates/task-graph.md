# TASK GRAPH

## Project
<!-- Project or Epic name -->

## Task Graph ID
<!-- Unique identifier: TG-YYYY-MM-DD-NNN -->

## Tasks

### TASK-001: [Title]
- **Status:** PENDING | IN_PROGRESS | BLOCKED | COMPLETE | FAILED
- **Priority:** CRITICAL | HIGH | MEDIUM | LOW
- **Assigned To:** [Agent/Specialist]
- **Dependencies:** [] (list task IDs this depends on)
- **Blocks:** [] (list task IDs this blocks)
- **Parallelizable:** YES | NO
- **Estimated Effort:** XS | S | M | L | XL
- **Acceptance Criteria:**
  - [ ] Criterion 1
- **Evidence:**
  - [ ] Evidence 1
- **Notes:**

### TASK-002: [Title]
- **Status:** PENDING
- **Priority:** MEDIUM
- **Assigned To:** [Agent/Specialist]
- **Dependencies:** [TASK-001]
- **Blocks:** []
- **Parallelizable:** YES
- **Estimated Effort:** M
- **Acceptance Criteria:**
  - [ ] Criterion 1
- **Evidence:**
  - [ ] Evidence 1
- **Notes:**

## Dependency Map
```
TASK-001 ──► TASK-002 ──► TASK-003
                  │
                  └──► TASK-004
```

## Parallel Execution Groups
- **Group 1 (No deps):** TASK-001
- **Group 2 (After Group 1):** TASK-002, TASK-004
- **Group 3 (After Group 2):** TASK-003

## Critical Path
<!-- Longest dependency chain -->

## Status Summary
- Total Tasks: 0
- Pending: 0
- In Progress: 0
- Blocked: 0
- Complete: 0
- Failed: 0
