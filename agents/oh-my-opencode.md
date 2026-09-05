# Oh-My-OpenCode — Discovery, Context, Memory Layer

## Purpose
Intelligent project discovery, context management, and memory system inspired by Oh-My-OpenCode.

## Architecture
```
WORKSPACE
    │
    ▼
DISCOVERY ENGINE
    ├── Project Type Detection
    ├── Entry Point Analysis
    ├── Architecture Detection
    ├── Dependency Mapping
    ├── Test Discovery
    └── Configuration Analysis
    │
    ▼
CONTEXT ENGINE
    ├── Retrieval
    ├── Compression
    ├── Re-anchoring
    ├── Session Recovery
    └── Context Rotation
    │
    ▼
MEMORY SYSTEM
    ├── Global Memory
    ├── User Preferences
    ├── Project Memory
    ├── Repository Memory
    ├── Epic Memory
    ├── Task Memory
    ├── Session Memory
    └── Current Context
```

## Components

### 1. Discovery Engine
Automatically detect project characteristics:

```text
Repository
    │
    ▼
Detect Project Type
    ├── Language (Node, Python, Go, Rust, etc.)
    ├── Framework (React, Next.js, Django, etc.)
    ├── Package Manager (npm, yarn, pip, etc.)
    ├── Build System (webpack, vite, etc.)
    ├── Test Framework (jest, pytest, etc.)
    ├── Database (postgres, mysql, mongo, etc.)
    ├── CI System (GitHub Actions, etc.)
    └── Deployment (Docker, Vercel, etc.)
    │
    ▼
Identify Entry Points
    ├── Main files
    ├── Config files
    ├── Route handlers
    ├── API endpoints
    └── Test files
    │
    ▼
Build Context Map
    ├── Module graph
    ├── Dependency tree
    ├── File relationships
    └── Architecture patterns
```

### 2. Context Engine
Construct context dynamically for each agent/task:

```text
Task Received
    │
    ▼
Context Construction
    ├── Current Task
    ├── Relevant Files (by path/grep)
    ├── Relevant Symbols (by LSP/AST)
    ├── Architecture Summary
    ├── Requirements
    ├── Previous Decisions
    ├── Task History
    ├── Relevant Failures
    ├── Tests
    ├── Documentation
    └── Evidence
    │
    ▼
Context Delivery
    ├── Primary Context (essential)
    ├── Secondary Context (helpful)
    └── Tertiary Context (reference)
```

### 3. Memory System
Layered persistent memory:

```text
GLOBAL MEMORY
    │
    ▼
USER PREFERENCES
    │
    ▼
PROJECT MEMORY
    │
    ▼
REPOSITORY MEMORY
    │
    ▼
EPIC MEMORY
    │
    ▼
TASK MEMORY
    │
    ▼
SESSION MEMORY
    │
    ▼
CURRENT CONTEXT
```

## Discovery Patterns

### Language Detection
```text
package.json → Node.js
requirements.txt → Python
go.mod → Go
Cargo.toml → Rust
pom.xml → Java
*.csproj → .NET
composer.json → PHP
```

### Framework Detection
```text
next.config → Next.js
nuxt.config → Nuxt
django.settings → Django
fastapi → FastAPI
rails → Ruby on Rails
spring → Spring Boot
```

### Test Detection
```text
jest.config → Jest
vitest.config → Vitest
pytest.ini → Pytest
*_test.go → Go test
*.test.ts → TypeScript test
*.spec.ts → Spec file
```

## Context Construction Rules

### For Researchers
- Web search context
- Documentation links
- Similar implementations
- Best practices

### For Architects
- Repository structure
- Module dependencies
- Architecture patterns
- Design decisions

### For Builders
- Task requirements
- Relevant source files
- Test files
- Configuration
- Dependencies

### For Testers
- Test framework
- Existing tests
- Coverage reports
- Bug reports

### For Security
- Dependencies
- Authentication code
- Input handling
- Configuration files

## Memory Operations

### Write
```text
Event occurs
    │
    ▼
Determine memory layer
    │
    ▼
Store with timestamp
    │
    ▼
Index for retrieval
```

### Read
```text
Query received
    │
    ▼
Search relevant layers
    │
    ▼
Rank by relevance
    │
    ▼
Return context
```

### Compress
```text
Context too large
    │
    ▼
Identify old/stale entries
    │
    ▼
Summarize
    │
    ▼
Store compressed version
    │
    ▼
Clear detailed version
```

## Session Recovery
```text
Session Interrupted
    │
    ▼
Save current state
    │
    ▼
Save context snapshot
    │
    ▼
Save memory state
    │
    ▼
New Session
    │
    ▼
Load last state
    │
    ▼
Load context snapshot
    │
    ▼
Resume from checkpoint
```
