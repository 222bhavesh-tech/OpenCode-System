# MODEL ROUTER CONFIGURATION

## Router ID
<!-- Unique identifier: ROUTER-YYYY-MM-DD-NNN -->

## Provider Priority
<!-- Order of provider preference -->

### Priority 1: OpenCode Native
- **Provider:** OpenCode default
- **Model:** OpenCode selected model
- **Use for:** All standard requests
- **Cost:** User's subscription

### Priority 2: OmniRoute
- **Provider:** OmniRoute (localhost:20128)
- **Model:** Best available free model
- **Use for:** Fallback when primary unavailable
- **Cost:** Free

### Priority 3: Free Providers
- **Provider:** Various free providers
- **Model:** Best available free model
- **Use for:** When OmniRoute unavailable
- **Cost:** Free

### Priority 4: Paid Providers
- **Provider:** Various paid providers
- **Model:** Best available model
- **Use for:** Only with explicit user approval
- **Cost:** Paid

## Model Selection Rules

### By Task Type
- **Reasoning:** Use reasoning-optimized model
- **Coding:** Use code-optimized model
- **Fast:** Use fast/cheap model for simple tasks
- **Creative:** Use creative-optimized model

### By Complexity
- **Simple:** Fast model
- **Medium:** Standard model
- **Complex:** Reasoning model
- **Critical:** Best available model

### By Cost
- **Free first:** Always try free providers first
- **Budget aware:** Track spending
- **User approval:** Required for paid usage

## Routing Logic

```
Request
  ↓
Check Primary Provider
  ↓ (if available)
Use Primary Provider
  ↓ (if unavailable)
Check OmniRoute
  ↓ (if available)
Use OmniRoute Free Model
  ↓ (if unavailable)
Check Free Providers
  ↓ (if available)
Use Free Provider
  ↓ (if unavailable)
STOP — Report to User
  ↓
User decides: Paid provider or abort
```

## State Tracking
- PRIMARY_HEALTHY: true/false
- PRIMARY_LIMITED: true/false
- PRIMARY_EXHAUSTED: true/false
- FALLBACK_ACTIVE: true/false
- LAST_SWITCH: timestamp

## Rules
1. Never silently switch providers
2. Never use paid without approval
3. Track all provider switches
4. Report failures to user
5. Prefer free-first
6. Respect user's model selection
