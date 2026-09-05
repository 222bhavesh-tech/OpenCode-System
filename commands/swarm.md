# /swarm — Specialist Team

## Purpose
Spawn a specialist team for parallel execution.

## Usage
```
/swarm                          # Spawn full team
/swarm --specialists <list>     # Spawn specific specialists
/swarm --list                   # List available specialists
```

## Available Specialists
| Role | Expertise |
|------|-----------|
| architect | System design, architecture decisions |
| backend | Server-side, APIs, business logic |
| frontend | Client-side, UI/UX, browser |
| security | Security review, vulnerability assessment |
| database | Schema design, queries, data modeling |
| qa | Test strategy, test implementation |
| devops | Deployment, CI/CD, infrastructure |
| research | Deep research, documentation analysis |
| docs | Documentation creation, API docs |

## Flow
1. Parse specialist requirements
2. Create swarm config (from templates/swarm-config.md)
3. Spawn specialist agents
4. Assign parallel tasks
5. Monitor execution
6. Collect results
7. Merge outputs

## Output
- Swarm config created
- Specialists spawned
- Tasks assigned
- Parallel execution started
- Results collected

## Rules
- Max concurrent specialists: 5
- Max total specialists: 9
- Timeout per specialist: 10 minutes
- Retry limit: 3
- Commander controls all specialists
