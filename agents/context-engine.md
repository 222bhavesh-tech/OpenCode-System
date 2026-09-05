# Context Engine — Retrieval, Compression, Re-anchoring

## Purpose
Dynamic context construction, management, and recovery.

## Architecture
```
REQUEST FOR CONTEXT
    │
    ▼
RETRIEVAL
    │
    ├── By Task
    ├── By File
    ├── By Symbol
    ├── By History
    └── By Relevance
    │
    ▼
CONSTRUCTION
    │
    ├── Primary (essential)
    ├── Secondary (helpful)
    └── Tertiary (reference)
    │
    ▼
COMPRESSION
    │
    ├── Summarize
    ├── Prune
    └── Archive
    │
    ▼
DELIVERY
    │
    └── To Agent
```

## Retrieval Methods

### By Task
```text
Task ID provided
    │
    ▼
Look up task details
    │
    ▼
Find related files
    │
    ▼
Find related decisions
    │
    ▼
Find related failures
    │
    ▼
Assemble context
```

### By File
```text
File path provided
    │
    ▼
Read file content
    │
    ▼
Find imports/references
    │
    ▼
Find test files
    │
    ▼
Find documentation
    │
    ▼
Assemble context
```

### By Symbol
```text
Symbol name provided
    │
    ▼
Search for definition
    │
    ▼
Find usages
    │
    ▼
Find tests
    │
    ▼
Assemble context
```

### By History
```text
Recent history
    │
    ▼
Find recent decisions
    │
    ▼
Find recent changes
    │
    ▼
Find recent failures
    │
    ▼
Assemble context
```

### By Relevance
```text
Topic provided
    │
    ▼
Search across all sources
    │
    ▼
Rank by relevance
    │
    ▼
Select top results
    │
    ▼
Assemble context
```

## Context Construction

### Primary Context (Essential)
```text
Primary Context
    ├── Current task requirements
    ├── Relevant source files
    ├── Key architecture decisions
    └── Active blockers
```

### Secondary Context (Helpful)
```text
Secondary Context
    ├── Related code
    ├── Test files
    ├── Documentation
    └── Similar past tasks
```

### Tertiary Context (Reference)
```text
Tertiary Context
    ├── Full repository structure
    ├── Dependency tree
    ├── Configuration files
    └── Historical changes
```

## Compression

### When to Compress
```text
Context Size > Threshold
    │
    ▼
Trigger compression
```

### Compression Levels
```text
LIGHT
    ├── Remove old findings
    └── Summarize completed tasks

MODERATE
    ├── Summarize old sections
    ├── Prune irrelevant files
    └── Archive old decisions

AGGRESSIVE
    ├── Keep only current task
    ├── Keep only essential files
    └── Summarize everything else
```

### Compression Process
```text
Full Context
    │
    ▼
Identify stale entries
    │
    ├── Old decisions
    ├── Completed tasks
    ├── Irrelevant files
    └── Outdated information
    │
    ▼
Summarize sections
    │
    ▼
Remove stale entries
    │
    ▼
Compressed context
```

## Re-anchoring

### When to Re-anchor
```text
Context Lost / Compacted
    │
    ▼
Trigger re-anchoring
```

### Re-anchoring Process
```text
Re-anchor
    │
    ▼
Load last context snapshot
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
Verify position
    │
    ▼
Resume execution
```

## Session Recovery

### Save Session
```text
Session End / Compaction
    │
    ▼
Save context snapshot
    │
    ▼
Save project state
    │
    ▼
Save memory state
    │
    ▼
Save Ralph state
```

### Restore Session
```text
New Session
    │
    ▼
Load last snapshot
    │
    ▼
Restore project state
    │
    ▼
Restore task graph
    │
    ▼
Restore memory
    │
    ▼
Resume from checkpoint
```

## Context Limits
```text
Max Context Size: 100,000 tokens
Warning Threshold: 80,000 tokens
Compression Trigger: 90,000 tokens
Aggressive Compression: 95,000 tokens
```

## Context Quality Metrics
```text
Relevance Score
    ├── How relevant is this context to the task?
    └── 0-100 scale

Freshness Score
    ├── How recent is this information?
    └── 0-100 scale

Coverage Score
    ├── Does this context cover the task needs?
    └── 0-100 scale
```
