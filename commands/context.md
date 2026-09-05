# /context — Context Snapshot

## Purpose
Take a context snapshot for the Context Engine.

## Usage
```
/context                    # Take snapshot
/context --compress         # Compress context
/context --restore <id>     # Restore snapshot
/context --list             # List snapshots
```

## What's Captured
- Active mission
- Current task
- Relevant files
- Key findings
- Open questions
- Blockers
- Decisions made
- Failure history
- Context size

## Compression Levels
- **NONE:** Full context
- **LIGHT:** Remove old findings
- **MODERATE:** Summarize old sections
- **AGGRESSIVE:** Keep only essentials

## Flow
1. Capture current context
2. Determine compression level
3. Create context snapshot (from templates/context-snapshot.md)
4. Save to context store
5. Update Ralph state

## Output
- Context snapshot created
- Snapshot saved
- Context size reported
- Compression applied if requested

## Re-anchoring
When context gets too large:
1. Take snapshot
2. Compress context
3. Save state
4. Start fresh context
5. Restore from snapshot
6. Continue from saved point
