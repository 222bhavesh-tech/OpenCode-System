# NOCTURNE Ticket Generator

## Purpose
Generate structured tickets from parsed GitHub Issues.

## Input
- Parsed issue data from NOCTURNE Parser

## Ticket Structure

### Ticket ID
```
NOC-YYYY-MM-DD-NNN
```
Example: `NOC-2026-09-05-001`

### Branch Name
```
{type}/issue-{number}-{slug}
```
Example: `fix/issue-42-login-timeout`

### Slug Generation
```python
def generate_slug(title):
    # Convert to lowercase
    slug = title.lower()
    # Remove special characters
    slug = re.sub(r'[^a-z0-9\s-]', '', slug)
    # Replace spaces with hyphens
    slug = re.sub(r'\s+', '-', slug)
    # Limit to 50 characters
    slug = slug[:50]
    # Remove trailing hyphens
    slug = slug.rstrip('-')
    return slug
```

### Branch Type Mapping
| Issue Type | Branch Type |
|---|---|
| BUG | fix |
| FEATURE | feature |
| ENHANCEMENT | enhance |
| DOCUMENTATION | docs |
| REFACTOR | refactor |

## Ticket Template
```markdown
# NOCTURNE TICKET

## GitHub Issue
{issue_url}

## Ticket ID
{ticket_id}

## Issue Analysis
### Title
{title}

### Description
{description}

### Labels
{labels}

### Priority
{priority}

### Type
{type}

## Branch Plan
### Branch Name
{branch_name}

### Base Branch
main

### Files Likely Affected
{affected_files}

### Estimated Effort
{estimated_effort}

## Execution Strategy
### Approach
{approach}

### Steps
{steps}

### Parallelizable Tasks
{parallel_tasks}

### Sequential Tasks
{sequential_tasks}

## Verification Plan
### Tests Required
{tests_required}

### Review Requirements
{review_requirements}

## Status
CREATED

## Timestamps
- Issue Created: {issue_created_at}
- Ticket Created: {now}
```

## Approach Generation
```python
def generate_approach(ticket):
    if ticket.type == "BUG":
        return [
            "Reproduce the bug",
            "Identify root cause",
            "Implement fix",
            "Verify fix resolves issue",
            "Add regression test"
        ]
    elif ticket.type == "FEATURE":
        return [
            "Understand requirements",
            "Design implementation",
            "Implement feature",
            "Write tests",
            "Update documentation"
        ]
    elif ticket.type == "ENHANCEMENT":
        return [
            "Analyze current implementation",
            "Identify improvement areas",
            "Implement enhancements",
            "Verify improvements",
            "Update documentation"
        ]
    elif ticket.type == "DOCUMENTATION":
        return [
            "Identify documentation gaps",
            "Draft documentation",
            "Review for accuracy",
            "Publish documentation"
        ]
    elif ticket.type == "REFACTOR":
        return [
            "Analyze current code",
            "Design refactoring plan",
            "Implement refactoring",
            "Verify no regressions",
            "Update tests"
        ]
    return ["Analyze", "Implement", "Verify"]
```

## Output
- NOCTURNE Ticket created
- Branch name generated
- Execution strategy defined
- Verification plan created
