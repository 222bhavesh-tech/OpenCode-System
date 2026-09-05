# RALPH STATE

## Ralph ID
<!-- Unique identifier: RALPH-YYYY-MM-DD-NNN -->

## Loop State
<!-- Current state of the persistent loop -->

### Current Task
<!-- Task currently being executed -->

### Loop Iteration
<!-- Current iteration number -->

### Max Iterations
<!-- Maximum iterations before escalation -->

## State Store
<!-- Persistent state that survives context refresh -->

### Project State
<!-- Current project state snapshot -->

### Task State
<!-- Current task progress -->

### Evidence Store
<!-- Collected evidence -->

### Failure History
<!-- What failed and how it was resolved -->

### Context Summary
<!-- Compressed context for fresh start -->

## Completion Detection
<!-- How the loop knows when to stop -->

### Completion Criteria
- [ ] All tasks complete
- [ ] All verification passed
- [ ] All evidence collected
- [ ] No remaining blockers

### Current Progress
- Tasks Done: 0 / 0
- Verification Passed: 0 / 0
- Evidence Collected: 0 / 0

## Recovery
<!-- How the loop recovers from failures -->

### Retry Count
<!-- Number of retries for current task -->

### Max Retries
<!-- Maximum retries before escalation -->

### Recovery Strategy
<!-- How failures are handled -->

## Timestamps
- Loop Started:
- Last Iteration:
- Last State Save:
- Expected Completion:
