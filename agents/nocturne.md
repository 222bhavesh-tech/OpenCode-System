# NOCTURNE — Issue → Branch Automation

## Purpose
Automatically convert GitHub Issues into actionable branches with structured execution plans.

## Architecture
```
GitHub Issue → NOCTURNE Parser → Ticket → Branch Plan → Git Branch → Execution
```

## Components

### 1. Issue Parser
- Fetches issue via GitHub MCP
- Extracts: title, description, labels, priority, type
- Analyzes content for affected files
- Estimates effort

### 2. Ticket Generator
- Creates NOCTURNE Ticket from parsed issue
- Generates branch name
- Plans execution strategy
- Defines verification requirements

### 3. Branch Creator
- Creates Git branch from base
- Naming convention: `feature/ISSUE-NNN-slug` or `fix/ISSUE-NNN-slug`
- Links branch to issue

### 4. Execution Planner
- Decomposes issue into tasks
- Maps dependencies
- Identifies parallel work
- Creates task graph

### 5. Commit Tracker
- Tracks commits per issue
- Links commits to tasks
- Generates PR description

## Flow
```
1. User: /issue <github-url>
2. NOCTURNE: Fetch issue via GitHub MCP
3. NOCTURNE: Parse issue content
4. NOCTURNE: Create ticket
5. NOCTURNE: Generate branch plan
6. NOCTURNE: Create Git branch
7. NOCTURNE: Create task graph
8. Commander: Begin execution
```

## Branch Naming
- Feature: `feature/issue-{number}-{slug}`
- Fix: `fix/issue-{number}-{slug}`
- Enhancement: `enhance/issue-{number}-{slug}`
- Documentation: `docs/issue-{number}-{slug}`

## Issue Type Detection
| Label/Keyword | Type |
|---|---|
| bug, error, broken, fix | BUG |
| feature, add, implement | FEATURE |
| enhance, improve, optimize | ENHANCEMENT |
| docs, documentation, readme | DOCUMENTATION |
| refactor, clean, restructure | REFACTOR |

## Priority Derivation
| Source | Priority |
|---|---|
| critical, urgent, P0 | CRITICAL |
| high, important, P1 | HIGH |
| medium, normal, P2 | MEDIUM |
| low, nice-to-have, P3 | LOW |

## Files
- `nocturne.md` — This file (architecture)
- `parser.md` — Issue parsing logic
- `ticket.md` — Ticket generation logic
- `branch.md` — Branch creation logic
