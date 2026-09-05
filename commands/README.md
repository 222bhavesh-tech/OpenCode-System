# COMMANDS

## OpenCode System CLI Commands

### Core Commands
| Command | Description | Usage |
|---------|-------------|-------|
| `/task <objective>` | Start a mission | `/task fix login bug` |
| `/stop` | Stop active mission | `/stop` |
| `/status` | Show system status | `/status` |
| `/verify` | Run verification | `/verify` |

### NOCTURNE Commands
| Command | Description | Usage |
|---------|-------------|-------|
| `/issue <url>` | Import GitHub Issue | `/issue https://github.com/...` |
| `/branch` | Create branch from issue | `/branch` |
| `/pr` | Create Pull Request | `/pr` |
| `/merge` | Merge approved PR | `/merge` |

### Flow-Next Commands
| Command | Description | Usage |
|---------|-------------|-------|
| `/plan` | Create task graph | `/plan` |
| `/graph` | Show task graph | `/graph` |
| `/next` | Get next task | `/next` |
| `/parallel` | Show parallel tasks | `/parallel` |

### Swarm Commands
| Command | Description | Usage |
|---------|-------------|-------|
| `/swarm` | Spawn specialist team | `/swarm` |
| `/specialist <role>` | Spawn specific specialist | `/specialist architect` |
| `/team` | Show active team | `/team` |

### Verification Commands
| Command | Description | Usage |
|---------|-------------|-------|
| `/gate` | Run evidence gate | `/gate` |
| `/review` | Request code review | `/review` |
| `/security` | Security review | `/security` |

### State Commands
| Command | Description | Usage |
|---------|-------------|-------|
| `/save` | Save current state | `/save` |
| `/restore` | Restore saved state | `/restore` |
| `/context` | Show context snapshot | `/context` |
| `/memory` | Show memory state | `/memory` |

### Model Commands
| Command | Description | Usage |
|---------|-------------|-------|
| `/model` | Show current model | `/model` |
| `/router` | Show model router | `/router` |
