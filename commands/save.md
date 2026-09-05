# /save — Save State

## Purpose
Save current mission state for Ralph/OpenRalph persistence.

## Usage
```
/save                    # Save current state
/save --to <path>        # Save to specific path
/save --compress         # Compress context
```

## State Saved
- Project state
- Task progress
- Evidence store
- Failure history
- Context summary
- Active agents
- Open questions
- Decisions made

## Flow
1. Capture current state
2. Compress context if requested
3. Create state snapshot (from templates/ralph-state.md)
4. Save to persistent storage
5. Update Ralph state
6. Return state ID

## Output
- State snapshot created
- State saved to disk
- Ralph state updated
- State ID returned

## Ralph Loop
```
TASK → EXECUTE → VERIFY → SAVE STATE → FRESH CONTEXT
  ▲                                    │
  └────────────────────────────────────┘
```

## State Recovery
- State can be restored at any time
- Fresh context starts with compressed state
- Loop continues from saved point
- Completion detection checks saved state
