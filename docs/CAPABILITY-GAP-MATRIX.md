# Capability Gap Matrix

| Capability | Prior state | Gap | Phase-A/B implementation |
| --- | --- | --- | --- |
| One commander/control plane | Multiple agent prompts | No executable authority | `ControlPlane` is the sole state authority per project. |
| Project state / Ralph persistence | Markdown template | No durable schema or recovery | Atomic `.opencode-system/state.json`, checkpoints, validation. |
| Flow-style DAG | Markdown diagram | No dependency enforcement or ready queue | Task add, cycle checks, priority-ready scheduling, critical-path ranking. |
| Verification gate | Prompted checklist | Builder could self-assert completion | Required evidence types block completion. |
| Failure system | Prompted taxonomy | No retry ledger or escalation state | Classified failure history and bounded retries. |
| Observability | Agent brief | No operational receipts | Timestamped fact-only event history and status summary. |
| Swarm / parallelism | Prompted specialist table | No conflict-aware executor | Deferred until an OpenCode-compatible worker adapter exists; state already includes specialist and parallelizable fields. |
| OpenHands runtime/process/browser | Descriptive prose | No action executor/process registry | Deferred; must be built against supported OpenCode plugin hooks. |
| Model routing | Prompt policy | No runtime health/routing integration | Deferred deliberately: preserve native OpenCode provider and OmniRoute fallback policy. |
| GitHub workflow | Nocturne prompt/templates | No authenticated issue/PR adapter | Deferred; requires an explicit authenticated GitHub integration and user-approved external writes. |
| Claude compatibility | Described only | No importer/parser | Deferred until stable command/hook mappings are designed. |

## Source-informed design constraints

Oh-My-OpenCode demonstrates that hooks, background agents, LSP/AST tooling, configuration validation, and session recovery belong in executable plugin code—not agent prose. OpenHands demonstrates a separate runtime boundary for sandboxed actions and browser environments. This implementation therefore starts with a small local state/control plane and does not install or copy either project wholesale.

## Next increments

1. Bind the control-plane commands to OpenCode and correct the `plan`/`planner` deployment mismatch.
2. Add a worker adapter with cancellation, timeouts, process receipts, and explicit worktree ownership.
3. Add independent verification runners and evidence artifact storage.
4. Add GitHub and browser adapters only when their credentials and runtime dependencies are confirmed.
