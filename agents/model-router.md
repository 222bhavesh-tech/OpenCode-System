# Model Router — Multi-Model Routing

## Purpose
Route different tasks to appropriate models based on capability, cost, and reliability.

## Architecture
```
REQUEST
    │
    ▼
TASK CLASSIFICATION
    │
    ├── Reasoning
    ├── Coding
    ├── Fast
    ├── Creative
    ├── Research
    ├── Review
    ├── Security
    ├── Documentation
    └── Vision
    │
    ▼
MODEL SELECTION
    │
    ├── Check Primary Provider
    ├── Check OmniRoute
    ├── Check Free Providers
    └── Check Paid (with approval)
    │
    ▼
ROUTE TO MODEL
    │
    ▼
RETURN RESULT
```

## Provider Priority

### Priority 1: OpenCode Native
```text
Provider: OpenCode default
Model: OpenCode selected model
Use for: All standard requests
Cost: User's subscription
```

### Priority 2: OmniRoute
```text
Provider: OmniRoute (localhost:20128)
Model: Best available free model
Use for: Fallback when primary unavailable
Cost: Free
```

### Priority 3: Free Providers
```text
Provider: Various free providers
Model: Best available free model
Use for: When OmniRoute unavailable
Cost: Free
```

### Priority 4: Paid Providers
```text
Provider: Various paid providers
Model: Best available model
Use for: Only with explicit user approval
Cost: Paid
```

## Task Classification

### Reasoning Tasks
```text
Characteristics:
    ├── Complex logic
    ├── Multi-step planning
    ├── Architecture decisions
    └── Debugging complex issues

Model Preference:
    ├── Reasoning-optimized model
    └── Large context window
```

### Coding Tasks
```text
Characteristics:
    ├── Code generation
    ├── Code modification
    ├── Refactoring
    └── Bug fixes

Model Preference:
    ├── Code-optimized model
    ├── Strong type system understanding
    └── Good with language idioms
```

### Fast Tasks
```text
Characteristics:
    ├── Simple queries
    ├── Quick lookups
    ├── Formatting
    └── Simple transformations

Model Preference:
    ├── Fast model
    ├── Low latency
    └── Cheap/free
```

### Creative Tasks
```text
Characteristics:
    ├── Documentation writing
    ├── README creation
    ├── Naming suggestions
    └── Design brainstorming

Model Preference:
    ├── Creative model
    └── Good writing ability
```

### Research Tasks
```text
Characteristics:
    ├── Web research
    ├── Documentation analysis
    ├── Technology evaluation
    └── Best practices

Model Preference:
    ├── Research-capable model
    ├── Good with external info
    └── Web-aware
```

### Review Tasks
```text
Characteristics:
    ├── Code review
    ├── Security review
    ├── Architecture review
    └── Quality assessment

Model Preference:
    ├── Independent model (not the builder)
    ├── Strong analysis
    └── Critical thinking
```

### Security Tasks
```text
Characteristics:
    ├── Vulnerability analysis
    ├── Security audit
    ├── Threat modeling
    └── Dependency review

Model Preference:
    ├── Security-aware model
    ├── Knowledge of OWASP
    └── Good with security patterns
```

### Documentation Tasks
```text
Characteristics:
    ├── API documentation
    ├── User guides
    ├── Architecture docs
    └── Changelog

Model Preference:
    ├── Efficient model
    ├── Good writing
    └── Cost-effective
```

### Vision Tasks
```text
Characteristics:
    ├── Screenshot analysis
    ├── UI verification
    ├── Visual comparison
    └── Image understanding

Model Preference:
    ├── Multimodal model
    └── Vision capabilities
```

## Routing Logic

### Standard Route
```text
Request
    │
    ▼
Classify task
    │
    ▼
Check primary provider
    │
    ├── Available → Use primary
    └── Unavailable ↓
Check OmniRoute
    │
    ├── Available → Use free model
    └── Unavailable ↓
Check free providers
    │
    ├── Available → Use free provider
    └── Unavailable ↓
STOP → Report to user
```

### Paid Route (requires approval)
```text
Request classified as needing paid model
    │
    ▼
Request user approval
    │
    ├── Approved → Use paid model
    └── Rejected → Use best free alternative
```

## State Tracking
```text
Router State
    ├── PRIMARY_HEALTHY: true/false
    ├── PRIMARY_LIMITED: true/false
    ├── PRIMARY_EXHAUSTED: true/false
    ├── FALLBACK_ACTIVE: true/false
    ├── LAST_SWITCH: timestamp
    ├── SWITCH_COUNT: number
    └── CURRENT_PROVIDER: string
```

## Rules
1. Never silently switch providers
2. Never use paid without approval
3. Track all provider switches
4. Report failures to user
5. Prefer free-first
6. Respect user's model selection
7. Log all routing decisions
