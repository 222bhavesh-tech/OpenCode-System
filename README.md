# OpenCode-System

**Source of Truth** for your custom OpenCode environment.

## Executable control plane (Phase A/B)

`runtime/control-plane.mjs` is the single local authority for persistent mission
state. It is model- and provider-neutral: OpenCode remains the provider/model
source of truth, while the control plane records operational facts, task
dependencies, failures, evidence, and checkpoints.

State belongs to the project being engineered, not to this repository:

```text
target-project/.opencode-system/state.json
```

Run it directly while OpenCode adapters are being added:

```powershell
node C:\Users\bhavesh jeengar\OpenCode-System\runtime\cli.mjs init --project C:\work\my-project --goal "Add account recovery"
node C:\Users\bhavesh jeengar\OpenCode-System\runtime\cli.mjs add-task --project C:\work\my-project --json '{"id":"plan","title":"Create plan","requiredEvidence":["review"]}'
node C:\Users\bhavesh jeengar\OpenCode-System\runtime\cli.mjs start plan --project C:\work\my-project
node C:\Users\bhavesh jeengar\OpenCode-System\runtime\cli.mjs evidence plan --project C:\work\my-project --json '{"type":"review","summary":"Plan reviewed"}'
node C:\Users\bhavesh jeengar\OpenCode-System\runtime\cli.mjs complete plan --project C:\work\my-project
node C:\Users\bhavesh jeengar\OpenCode-System\runtime\cli.mjs status --project C:\work\my-project
```

Available operations: `init`, `add-task`, `ready`, `start`, `evidence`,
`complete`, `fail`, `checkpoint`, `status`, and `doctor`. Verify it with
`npm test`.

The audit and capability plan are in `docs/PHASE-0-AUDIT.md` and
`docs/CAPABILITY-GAP-MATRIX.md`. Remaining work is tracked as adapters and
execution features rather than represented as capability claims.

This directory is **NEVER touched by OpenCode updates**. All custom configuration lives here and is synced to OpenCode's config directory via scripts.

## Architecture

```
OpenCode-System/          ← SOURCE OF TRUTH (Git versioned)
    ↓
scripts/install.ps1      ← Sync to OpenCode
scripts/repair.ps1       ← Restore after update
scripts/verify.ps1       ← Check system health
    ↓
~/.config/opencode/      ← RUNTIME ONLY (OpenCode reads from here)
```

## Five Primary Agents

| Agent | Role | Source |
|-------|------|--------|
| **workspace** | Project discovery & capability selection | `agents/workspace.md` |
| **commander** | Mission orchestration & delegation | `agents/commander.md` |
| **plan** | Deep investigation & planning | `config/opencode.jsonc` |
| **build** | Implementation & coding | `config/opencode.jsonc` |
| **reviewer** | Independent verification | `agents/reviewer.md` |

## Quick Start

### After OpenCode Update
```powershell
.\scripts\repair.ps1
```

### Verify System
```powershell
.\scripts\verify.ps1
```

### Backup Current State
```powershell
.\scripts\backup.ps1 -Description "pre-update"
```

### Full Install/Restore
```powershell
.\scripts\install.ps1
```

## Directory Structure

```
OpenCode-System/
├── agents/              ← Agent definitions (markdown)
│   ├── workspace.md
│   ├── commander.md
│   ├── planner.md
│   ├── build.md
│   └── reviewer.md
├── config/              ← Master configuration
│   └── opencode.jsonc
├── mcp/                 ← MCP server configurations
│   └── mcp.jsonc
├── plugins/             ← Plugin manifest
│   └── manifest.json
├── skills/              ← Skills manifest
│   └── manifest.json
├── scripts/             ← Automation scripts
│   ├── install.ps1
│   ├── repair.ps1
│   ├── backup.ps1
│   ├── verify.ps1
│   └── update.ps1
├── templates/           ← Templates for new agents
├── backups/             ← Timestamped backups
├── .gitignore           ← Secrets exclusion
├── README.md            ← This file
└── AGENTS.md            ← Master agent instructions
```

## Update Workflow

```
1. OpenCode updates (EXE replacement)
2. Run: .\scripts\repair.ps1
3. All 5 agents restored
4. Continue working
```

## Backup Workflow

```
1. Run: .\scripts\backup.ps1
2. Timestamped backup created
3. Git tracks all changes
4. Recovery possible at any time
```

## Version Control

Git tracks all changes to:
- Agent definitions
- Configuration
- Scripts
- Manifests

Excludes:
- API keys
- OAuth tokens
- Passwords
- Secrets

## Recovery

If OpenCode update breaks configuration:
```powershell
.\scripts\repair.ps1
```

If you need to start fresh:
```powershell
.\scripts\install.ps1 -Force
```

## Safety

- Never store secrets in Git
- Always backup before changes
- Verify after every operation
- Source of truth is independent of OpenCode installation
