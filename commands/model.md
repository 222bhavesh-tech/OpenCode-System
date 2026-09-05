# /model — Model Router

## Purpose
Show and manage the model routing configuration.

## Usage
```
/model                    # Show current model
/model --router           # Show router config
/model --switch <model>   # Switch model (with approval)
/model --status           # Show provider status
```

## Provider Priority
1. OpenCode Native (primary)
2. OmniRoute (fallback)
3. Free Providers (secondary fallback)
4. Paid Providers (requires approval)

## Routing Logic
```
Request → Check Primary → Use if available
         ↓ (unavailable)
         Check OmniRoute → Use free model
         ↓ (unavailable)
         Check Free Providers → Use if available
         ↓ (unavailable)
         STOP — Report to User
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
