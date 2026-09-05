# NOCTURNE Branch Creator

## Purpose
Create Git branches from NOCTURNE tickets.

## Input
- NOCTURNE Ticket with branch plan

## Branch Creation Flow

### 1. Validate Prerequisites
```bash
# Check we're in a Git repo
git rev-parse --is-inside-work-tree

# Check branch doesn't exist
git branch --list {branch_name}

# Check working directory is clean
git status --porcelain
```

### 2. Create Branch
```bash
# Fetch latest
git fetch origin

# Create and switch to branch
git checkout -b {branch_name} origin/{base_branch}
```

### 3. Link to Issue
```bash
# Create initial commit linking to issue
git commit --allow-empty -m "chore: create branch for issue #{number}

Automated by NOCTURNE:
- Ticket: {ticket_id}
- Issue: {issue_url}
- Type: {issue_type}
- Priority: {issue_priority}"
```

### 4. Update Ticket
```markdown
## Status
BRANCH_CREATED

## Timestamps
- Issue Created: {issue_created_at}
- Ticket Created: {ticket_created_at}
- Branch Created: {now}
```

## Branch Naming Rules
| Type | Pattern | Example |
|---|---|---|
| Feature | `feature/issue-{N}-{slug}` | `feature/issue-42-dark-mode` |
| Fix | `fix/issue-{N}-{slug}` | `fix/issue-42-login-timeout` |
| Enhancement | `enhance/issue-{N}-{slug}` | `enhance/issue-42-performance` |
| Docs | `docs/issue-{N}-{slug}` | `docs/issue-42-api-readme` |
| Refactor | `refactor/issue-{N}-{slug}` | `refactor/issue-42-auth-module` |

## Base Branch Selection
| Condition | Base Branch |
|---|---|
| No develop branch | main |
| develop exists | develop |
| Issue specifies | Issue-specified branch |
| Default | main |

## Error Handling
| Error | Action |
|---|---|
| Branch exists | Append `-2`, `-3`, etc. |
| Not a Git repo | Abort, report error |
| Dirty working dir | Stash changes, create branch |
| Network error | Retry once, then abort |
| Permission denied | Report to user |

## Post-Creation
1. Verify branch exists
2. Verify correct base
3. Update ticket status
4. Report to Commander
5. Begin execution
