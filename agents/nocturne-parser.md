# NOCTURNE Parser

## Purpose
Parse GitHub Issues into structured data for ticket generation.

## Input
- GitHub Issue URL or number
- Repository context

## Parsing Steps

### 1. Fetch Issue
```
GitHub MCP → github_get_issue → Raw Issue Data
```

### 2. Extract Fields
| Field | Source | Fallback |
|---|---|---|
| title | issue.title | "Untitled Issue" |
| description | issue.body | "No description" |
| labels | issue.labels | [] |
| priority | labels + content analysis | MEDIUM |
| type | labels + keyword analysis | FEATURE |
| assignee | issue.assignee | None |
| milestone | issue.milestone | None |

### 3. Type Detection
```python
def detect_type(issue):
    text = (issue.title + " " + issue.body).lower()
    labels = [l.name.lower() for l in issue.labels]
    
    if any(x in labels + [text] for x in ["bug", "error", "broken", "fix"]):
        return "BUG"
    if any(x in labels + [text] for x in ["feature", "add", "implement"]):
        return "FEATURE"
    if any(x in labels + [text] for x in ["enhance", "improve", "optimize"]):
        return "ENHANCEMENT"
    if any(x in labels + [text] for x in ["docs", "documentation", "readme"]):
        return "DOCUMENTATION"
    if any(x in labels + [text] for x in ["refactor", "clean", "restructure"]):
        return "REFACTOR"
    return "FEATURE"
```

### 4. Priority Derivation
```python
def derive_priority(issue):
    labels = [l.name.lower() for l in issue.labels]
    text = (issue.title + " " + issue.body).lower()
    
    if any(x in labels for x in ["critical", "urgent", "p0"]):
        return "CRITICAL"
    if any(x in labels for x in ["high", "important", "p1"]):
        return "HIGH"
    if any(x in labels for x in ["low", "nice-to-have", "p3"]):
        return "LOW"
    return "MEDIUM"
```

### 5. Affected Files Estimation
```python
def estimate_files(issue):
    text = issue.title + " " + issue.body
    files = []
    
    # Look for file paths in issue
    import re
    paths = re.findall(r'[\w/]+\.\w+', text)
    files.extend(paths)
    
    # Look for component names
    components = re.findall(r'(?:component|module|service|api)[\s:]+(\w+)', text, re.I)
    files.extend(components)
    
    return list(set(files))
```

### 6. Effort Estimation
```python
def estimate_effort(issue):
    text = issue.title + " " + issue.body
    word_count = len(text.split())
    
    if word_count < 50:
        return "XS"
    if word_count < 150:
        return "S"
    if word_count < 300:
        return "M"
    if word_count < 600:
        return "L"
    return "XL"
```

## Output
```json
{
  "title": "Issue title",
  "description": "Issue body",
  "type": "BUG | FEATURE | ENHANCEMENT | DOCUMENTATION | REFACTOR",
  "priority": "CRITICAL | HIGH | MEDIUM | LOW",
  "labels": ["label1", "label2"],
  "affected_files": ["file1.js", "file2.ts"],
  "estimated_effort": "XS | S | M | L | XL",
  "assignee": "username or null",
  "milestone": "milestone name or null"
}
```
