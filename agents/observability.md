# Observability Layer — Execution History

## Purpose
Transparent execution history for debugging, review, and auditing.

## Architecture
```
EXECUTION
    │
    ▼
EVENT CAPTURE
    │
    ├── Agent Events
    ├── Tool Events
    ├── Task Events
    ├── System Events
    └── User Events
    │
    ▼
EVENT STORAGE
    │
    ├── Event Log
    ├── Event Index
    └── Event Summary
    │
    ▼
OBSERVABILITY
    │
    ├── Dashboard
    ├── Logs
    ├── Metrics
    └── Alerts
```

## Event Types

### Agent Events
```text
Agent Events
    ├── agent_spawned
    │   ├── Agent ID
    │   ├── Agent Type
    │   ├── Task
    │   └── Timestamp
    │
    ├── agent_completed
    │   ├── Agent ID
    │   ├── Result
    │   ├── Duration
    │   └── Timestamp
    │
    ├── agent_failed
    │   ├── Agent ID
    │   ├── Error
    │   ├── Attempts
    │   └── Timestamp
    │
    └── agent_action
        ├── Agent ID
        ├── Action
        ├── Input
        ├── Output
        └── Timestamp
```

### Tool Events
```text
Tool Events
    ├── tool_called
    │   ├── Tool Name
    │   ├── Input
    │   ├── Agent
    │   └── Timestamp
    │
    ├── tool_completed
    │   ├── Tool Name
    │   ├── Output
    │   ├── Duration
    │   └── Timestamp
    │
    └── tool_failed
        ├── Tool Name
        ├── Error
        └── Timestamp
```

### Task Events
```text
Task Events
    ├── task_created
    │   ├── Task ID
    │   ├── Title
    │   ├── Priority
    │   └── Timestamp
    │
    ├── task_started
    │   ├── Task ID
    │   ├── Assigned To
    │   └── Timestamp
    │
    ├── task_completed
    │   ├── Task ID
    │   ├── Result
    │   ├── Duration
    │   └── Timestamp
    │
    ├── task_failed
    │   ├── Task ID
    │   ├── Error
    │   └── Timestamp
    │
    └── task_blocked
        ├── Task ID
        ├── Blocker
        └── Timestamp
```

### System Events
```text
System Events
    ├── mission_started
    │   ├── Mission ID
    │   ├── Objective
    │   └── Timestamp
    │
    ├── mission_completed
    │   ├── Mission ID
    │   ├── Result
    │   ├── Duration
    │   └── Timestamp
    │
    ├── context_compacted
    │   ├── Context Size
    │   ├── New Size
    │   └── Timestamp
    │
    ├── state_saved
    │   ├── State Type
    │   ├── Size
    │   └── Timestamp
    │
    └── error
        ├── Error Type
        ├── Message
        └── Timestamp
```

## Observability Dashboard

### Current Status
```text
Current Status
    ├── Active Mission
    ├── Current Task
    ├── Active Agents
    ├── Running Tools
    ├── Model Used
    ├── Token Usage
    ├── Cost
    ├── Tests Status
    ├── Review Status
    └── Remaining Tasks
```

### History
```text
Execution History
    ├── Completed Tasks
    ├── Failed Tasks
    ├── Agent Performance
    ├── Tool Usage
    ├── Error Frequency
    └── Duration Trends
```

### Metrics
```text
Metrics
    ├── Tasks per hour
    ├── Average task duration
    ├── Success rate
    ├── Failure rate
    ├── Retry rate
    ├── Token usage
    └── Cost
```

## Log Format
```json
{
    "timestamp": "ISO 8601",
    "event_type": "agent_spawned",
    "agent_id": "agent-001",
    "agent_type": "builder",
    "task_id": "TASK-001",
    "details": {},
    "duration_ms": 1234,
    "tokens_used": 500,
    "cost_usd": 0.01
}
```

## Alert Rules
```text
Alerts
    ├── Task failed 3 times → Alert
    ├── Agent timeout → Alert
    ├── Budget exceeded → Alert
    ├── Error rate > 50% → Alert
    └── Mission stuck → Alert
```
