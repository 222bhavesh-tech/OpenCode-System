# /issue — NOCTURNE Import

## Purpose
Import a GitHub Issue and convert it into an actionable mission.

## Usage
```
/issue <github-url>
/issue <owner/repo/issues/number>
```

## Flow
1. Parse GitHub Issue URL
2. Fetch issue via GitHub MCP
3. Analyze issue content
4. Create NOCTURNE Ticket (from templates/nocturne-ticket.md)
5. Generate branch plan
6. Create task graph
7. Commander initiates execution

## Output
- NOCTURNE Ticket created
- Branch name generated
- Task graph created
- Execution started

## Examples
```
/issue https://github.com/222bhavesh-tech/OpenCode-System/issues/1
/issue 222bhavesh-tech/OpenCode-System/issues/5
```
