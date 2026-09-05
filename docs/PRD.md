# Product Requirements Document — OpenCode-System

**Version:** 0.3.0  
**Status:** Active development  
**Product:** OpenCode-System Autonomous Engineering Platform  
**Owner:** Repository maintainer  
**Last updated:** 2026-09-05

## 1. Product summary

OpenCode-System is a local-first autonomous engineering platform built on top
of OpenCode. Its purpose is to turn a high-level software goal into a durable,
observable, evidence-backed engineering workflow:

```text
Goal → discovery → specification → plan → task DAG → execution
     → independent verification → evidence → review → next task → completion
```

It must preserve the user's existing OpenCode provider, OmniRoute fallback
policy, 166 skills, MCP configuration, commands, and safety plugin. It must
not become a second OpenCode fork or a set of competing orchestration engines.

## 2. Problem

The repository currently contains useful agent briefs, commands, templates,
skills, MCP declarations, and maintenance scripts. However, most autonomous
capabilities are descriptions rather than executable behavior. In particular,
there was no durable task graph, state machine, evidence gate, failure ledger,
or executable recovery loop.

This leads to four practical problems:

1. An agent can claim a task is complete without machine-readable evidence.
2. Session loss or context compaction can lose progress and repeat failed work.
3. Multiple prompts can each behave like an orchestrator without a shared state
   authority.
4. Existing external projects cannot be safely combined by simply installing
   them all; they may conflict in hooks, task state, context injection, and
   worker ownership.

## 3. Product goal

Provide one transparent, recoverable, and bounded control plane that lets
OpenCode use the strongest compatible capabilities from specialist projects
without duplicating their competing control planes.

### Success statement

For a non-trivial repository task, a user can start a mission, inspect its
durable plan and task graph, execute work through the selected agents, review
independent evidence, survive interruption, and resume to a correct final
state.

## 4. Non-goals

- Replacing OpenCode or forking it.
- Copying external projects wholesale.
- Automatically installing every skill, MCP, or plugin.
- Automatically merging pull requests, deploying production systems, changing
  credentials, or spending money.
- Storing chain-of-thought, credentials, access tokens, or secrets in state.
- Claiming browser, GitHub, sandbox, or multi-agent capabilities before an
  adapter has been implemented and tested.

## 5. Users and primary modes

| User | Need | Product mode |
| --- | --- | --- |
| Developer | Help with a focused change while retaining control | Interactive |
| Developer | Approve a plan, then let routine work proceed | Assisted |
| Project lead | Complete a bounded multi-task objective | Autonomous |
| Maintainer | Run a large, dependency-aware project safely | Project Autonomous |

All modes support `status`, `pause`, `resume`, and `stop`. The difference is
the level of approval required before execution, not the evidence required for
completion.

## 6. Design principles

1. **One control plane.** Commander is the sole mission authority; the durable
   `ControlPlane` state is the sole project-state authority.
2. **Evidence over claims.** A task is complete only after its required
   evidence passes.
3. **Smallest capable team.** Specialists are selected dynamically; no swarm is
   created merely because a task exists.
4. **Provider neutrality.** OpenCode remains the selected provider/model source
   of truth. OmniRoute remains a configured fallback.
5. **Least privilege.** Read operations are autonomous; external writes and
   high-impact actions require explicit safeguards.
6. **Recovery by design.** State, failures, decisions, and evidence survive
   fresh context, agent failure, and process restart.
7. **Executable before declarative.** Documentation describes observed runtime
   behavior and is never used as evidence that a feature exists.

## 7. External capability strategy

| Source | Adoptable capability | Integration rule |
| --- | --- | --- |
| Oh-My-OpenCode | Background agents, lifecycle hooks, LSP/AST, context/session recovery, compatibility | Use adapter-level capabilities only; never allow an additional orchestrator to own task state. |
| Superpowers | Brainstorming, plans, TDD, debugging, reviews, worktrees | Import/adapt workflows as skills and bind their results to control-plane tasks/evidence. |
| Flow-Next | Epics, task dependencies, priority, review flow | Use as the task/DAG domain model, implemented by the local control plane. |
| OpenCode Forge | Approved plan execution, worktrees, sandboxing, audit loops | Evaluate as the primary execution adapter; it must report receipts to the control plane. |
| OpenCode X | Provider/context guardrails and Claude-compatible patterns | Treat as design/reference source unless a compatible component has a clean boundary. |
| opencode-agent-kit | Visual dev loop, agent memory, loop operator, harness optimizer, hooks | Selectively integrate free components; replace paid services (agentmemory MCP) with file-based alternatives. |
| Agentic skill libraries | Specialist instructions and reusable methods | Load on demand; they cannot create a parallel loop or persistent state store. |

## 8. Functional requirements

### FR-1: Mission and project state

- The platform SHALL create one state directory per target project:
  `.opencode-system/state.json`.
- State SHALL contain mission metadata, mode, budgets, tasks, events, evidence,
  failures, checkpoints, and decisions.
- State writes SHALL be atomic and schema-validated before use.
- The system SHALL support `init`, `status`, `checkpoint`, `pause`, `resume`,
  and `stop` operations.

### FR-2: Epic and task DAG

- A task SHALL have an ID, title, owner/specialist, status, priority,
  dependencies, acceptance criteria, evidence requirements, and attempts.
- The system SHALL reject unknown dependencies and cyclic graphs.
- Only tasks with completed dependencies SHALL be ready for execution.
- The scheduler SHALL identify parallelizable ready tasks and prevent parallel
  execution when file ownership or declared resource conflicts overlap.
- The status view SHALL show progress, ready tasks, blocked tasks, and critical
  path information.

### FR-3: Dynamic team selection

- Commander SHALL select the smallest role set needed for the task.
- Supported roles SHALL include planner, architect, builder, tester, debugger,
  reviewer, security reviewer, researcher, documentation, DevOps, database,
  frontend, and accessibility specialists.
- Every worker SHALL have a task ID, timeout, budget, cancellation mechanism,
  and an operational result receipt.
- Workers SHALL not directly mark a mission complete.

### FR-4: Execution runtime

- A worker runtime SHALL use the loop: observe → plan → act → observe result →
  update state.
- It SHALL capture command, exit code, stdout/stderr locations, timeout,
  duration, and resulting state transition.
- It SHALL track background processes and ensure they can be stopped on task
  completion, failure, cancellation, or recovery.
- It SHALL implement time, iteration, tool-call, parallel-worker, and model
  budgets, stopping or escalating when a limit is exceeded.

### FR-5: Verification and evidence

- A builder SHALL submit implementation results but SHALL NOT be the final
  authority for its own task.
- The verification flow SHALL support tester → browser/UI when applicable →
  security → specification review → code review → evidence gate.
- Each evidence item SHALL state task, layer, verdict, summary, timestamp, and
  artifact/log location.
- A task SHALL not transition to `COMPLETE` unless each declared evidence type
  has a passing receipt.
- Evidence SHALL be reproducible or clearly identify why it is not.

### FR-6: Failure handling and recovery

- Failures SHALL be classified as syntax, type, dependency, environment,
  runtime, test, network, permission, configuration, logic, architecture,
  security, or unknown.
- Each failure SHALL record cause, attempted fixes, affected files/tests, and
  prevention when known.
- Retries SHALL be bounded per task; repeated failures SHALL trigger an
  alternative strategy or escalation instead of repeated blind retries.
- A checkpoint SHALL make the mission resumable in a fresh context/session.

### FR-7: Context and memory

- Context assembly SHALL retrieve only the current task, relevant files,
  symbols, requirements, decisions, failures, tests, and evidence.
- Project memory, task state, evidence, and failure memory SHALL be distinct.
- The context-rotation workflow SHALL checkpoint state before summary/renewal.
- No hidden reasoning, secrets, or credentials SHALL be written to memory.

### FR-8: Git, worktrees, and GitHub

- Parallel or high-risk implementation SHALL use isolated worktrees when
  appropriate.
- The system SHALL track worktree ownership and prevent simultaneous writes to
  the same files without coordination.
- GitHub issue → plan → branch/worktree → PR automation SHALL be optional and
  disabled until credentials and user authorization are confirmed.
- The system SHALL never auto-merge, deploy, force-push, delete branches, or
  perform destructive GitHub actions without explicit configuration.

### FR-9: Model routing

- The active OpenCode provider/model SHALL remain the default.
- OmniRoute SHALL be used only according to the existing explicit fallback
  policy following a verified provider-level failure.
- The route decision SHALL be observable, budget-aware, and never silently use
  a paid provider.

### FR-10: Observability and diagnostics

- `status` SHALL show mission, task progress, active workers, budgets,
  processes, tests, reviews, security state, evidence, failures, and next
  action.
- A doctor command SHALL verify configuration, deployment, plugin health,
  runtime compatibility, writable state, and runnable demonstrations.
- Presence of a directory, Markdown file, or configuration key SHALL NOT count
  as a successful diagnostic.

### FR-11: Persistent memory (agent-kit integration)

- The system SHALL provide file-based persistent memory that survives sessions.
- Memory entries SHALL have: id, category, content, metadata, timestamp.
- Categories: decision, pattern, failure, convention, insight.
- Memory SHALL support search, filter by category, and export to markdown.
- Memory SHALL NOT store secrets, credentials, or API keys.

### FR-12: Executable lifecycle hooks (agent-kit integration)

- The system SHALL execute registered hook functions on lifecycle events.
- Hook points: session:start, session:end, task:before, task:after, task:fail,
  evidence:recorded, checkpoint:saved.
- Before hooks can cancel actions by returning false.
- After hooks are observational and cannot cancel actions.
- Hooks SHALL be budgeted (5s time, 1000 tokens, 10 tool calls max).

### FR-13: Visual dev loop (agent-kit integration)

- The system SHALL support autonomous build→inspect→fix cycles for UI work.
- The loop SHALL: start dev server, navigate to URL, screenshot, evaluate JS,
  detect issues, create fix tasks, and repeat.
- The loop SHALL be budgeted (max iterations, timeouts) and stoppable.

### FR-14: Loop operator (agent-kit integration)

- The scheduler wrapper SHALL detect stalls (no progress > threshold).
- SHALL track failure counts per task and total.
- SHALL apply recovery hierarchy: retry → escalate → skip → abort.
- SHALL emit structured events for monitoring.

### FR-15: Harness optimizer (agent-kit integration)

- The system SHALL analyze its own configuration for improvements.
- Dimensions: cost, quality, performance, completeness.
- Output: scored report with issues, recommendations, quick wins, critical issues.

## 9. Architecture

```text
OpenCode user / command
        │
        ▼
Commander adapter ──► ControlPlane (.opencode-system/state.json)
        │                         │
        ▼                         ├── task DAG / budgets / checkpoints
Worker adapter                     ├── events / failures / decisions
  ├── shell executor               └── evidence references
  ├── file executor
  ├── test executor
  ├── manual executor
  └── visual dev loop
        │
        ▼
Scheduler ──► Loop Operator ──► Recovery actions
        │
        ▼
Independent verification adapters ──► Evidence gate ──► task transition
        │
        ▼
Memory (file-based) ◄──► Hooks (lifecycle) ◄──► Harness Optimizer
```

The control plane does not execute model calls or shell commands itself. It
defines the state and invariants; adapters do work and return receipts.

## 10. Milestones

### M0 — Audit and foundation ✅ COMPLETE

- Read-only audit and gap matrix.
- Dependency-free local control-plane runtime.
- Durable state, DAG validation, evidence gate, failure ledger, checkpoints,
  events, CLI, and automated tests.

### M1 — Worker and execution runtime ✅ COMPLETE

- WorkerAdapter with 4 executor types (shell, file, test, manual).
- Scheduler autonomous loop with budget enforcement.
- 13 unit tests, all passing.
- CLI with 13 commands.
- Evidence-gated task completion.
- Error classification (TIMEOUT, DEPENDENCY, NETWORK, SECURITY, CODE, TEST, UNKNOWN).

### M2 — Agent-Kit integration ✅ COMPLETE

- File-based persistent memory (memory.mjs).
- Executable lifecycle hooks (hooks.mjs).
- Visual dev loop executor (visual-dev-loop.mjs).
- Loop operator with stall detection and recovery (loop-operator.mjs).
- Harness optimizer for config analysis (harness-optimizer.mjs).
- CLI extended to 18 commands.
- 91 verification checks passing.

### M3 — OpenCode binding (next)

- Resolve deployed agent naming (`plan` versus `planner`) without overwriting
  user customizations.
- Add OpenCode commands that read/write control-plane state.
- Replace presence-only verification with a runnable doctor/demo.

### M4 — Verification adapters

- Run test/build/lint/type/security adapters.
- Add browser workflow/screenshot evidence for web projects.
- Implement independent spec/code/security review gates.

### M5 — Worktrees and sandbox

- Add worktree lifecycle with ownership, conflict detection, and cleanup.
- Evaluate and, if compatible, bind Forge's execution/sandbox capability.

### M6 — GitHub and compatibility

- Add explicitly authorized GitHub issue/PR adapters.
- Add compatible importers for Claude-style agents, commands, skills, hooks,
  and MCP configuration.

## 11. Acceptance criteria

The product is ready for its first production use only when a demonstrated
non-trivial project can:

1. Discover its repository and environment.
2. Produce requirements, architecture, a reviewed plan, and a persisted DAG.
3. Select the necessary specialists and run independent tasks safely.
4. Recover from an injected test or worker failure without losing task state.
5. Produce passing test/build evidence, browser evidence when relevant,
   security evidence, spec review, and code review.
6. Resume from a saved checkpoint in a fresh process/context.
7. Show all operational receipts in status.
8. Create an optional reviewable Git branch/PR only when GitHub access and user
   approval are configured.
9. Reach `PROJECT COMPLETE` only after every task and evidence gate passes.

## 12. Metrics

- Percentage of completed tasks with all required evidence.
- Number of failed tasks resumed successfully from checkpoints.
- Number of retries per failure category; repeated-strategy rate.
- Task completion time, worker timeouts, and budget escalations.
- Test/build/browser/security pass rates.
- Context size and retrieved-context relevance.
- Number of user approvals requested for high-impact actions.
- Memory entries stored/searched per session.
- Hook executions and cancellations.
- Visual dev loop iterations and fix success rate.

## 13. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Competing orchestration plugins | One state/control-plane contract; adapter boundary and explicit ownership. |
| Over-privileged MCPs | Demand-driven activation and role-specific permissions. |
| False completion | Evidence-gated state transitions and independent verification. |
| Context loss | Atomic checkpoints plus re-anchoring workflow. |
| Parallel file conflicts | Worktree/file-ownership declarations and scheduler conflict checks. |
| Hidden cost/provider change | Preserve OpenCode primary routing; explicit fallback and budget receipts. |
| Unsafe GitHub actions | External write approval and no auto-merge/deploy defaults. |
| Stale upstream integrations | Version-pinned adapters, doctor checks, and compatibility tests. |
| Memory bloat | File-based memory with max entry limit (5000) and category filtering. |
| Hook budget overrun | 5s timeout, 1000 token limit, 10 tool call max per hook. |
| Visual dev loop runaway | Max iteration budget, per-iteration timeout, stoppable. |

## 14. Current implementation status

### Implemented and tested (v0.3.0)

| Component | Status | Details |
| --- | --- | --- |
| Control Plane | ✅ Complete | State machine, DAG validation, evidence gates, failure ledger, checkpoints |
| Worker Adapter | ✅ Complete | 4 executors: shell, file, test, manual. Error classification. Timeout support. |
| Scheduler | ✅ Complete | Autonomous loop, budget enforcement, event emission |
| Loop Operator | ✅ Complete | Stall detection, failure tracking, recovery hierarchy (retry→escalate→skip→abort) |
| CLI | ✅ Complete | 18 commands: init, add-task, ready, start, evidence, complete, fail, checkpoint, status, run, step, schedule, loop, optimize, memory, hooks, vdl, doctor |
| Memory | ✅ Complete | File-based persistent memory with 5 categories, search, stats, markdown export |
| Hooks | ✅ Complete | Executable lifecycle hooks with 5 built-in hooks, priority ordering, one-shot support |
| Visual Dev Loop | ✅ Complete | Autonomous build→inspect→fix cycle framework |
| Harness Optimizer | ✅ Complete | Config analysis with 4 dimensions, scored report |
| Tests | ✅ 13/13 pass | DAG, evidence gates, failure/retry, cycle detection, shell/file execution, scheduler, events |
| Verification | ✅ 91 checks | Runtime files, exports, CLI commands, agent-kit integration, documentation |

### Not yet implemented

| Component | Priority | Depends on |
| --- | --- | --- |
| OpenCode command binding | High | M3 |
| Browser adapter (Playwright MCP) | Medium | M4 |
| GitHub adapter (gh CLI auth) | Medium | M6 |
| Worktree isolation | Low | M5 |
| Dashboard/status UI | Low | M3 |
| Multi-agent parallel execution | Medium | M3 |
| Context snapshot/retrieval | Medium | M3 |

## 15. File inventory

### Runtime modules (9)

| File | Lines | Purpose |
| --- | --- | --- |
| `runtime/control-plane.mjs` | 420 | State machine, DAG, evidence, failures, checkpoints |
| `runtime/worker.mjs` | 285 | WorkerAdapter, 4 executors, error classification |
| `runtime/scheduler.mjs` | 180 | Autonomous loop, budget, events |
| `runtime/cli.mjs` | 175 | 18-command CLI interface |
| `runtime/memory.mjs` | 197 | File-based persistent memory |
| `runtime/hooks.mjs` | 230 | Executable lifecycle hooks |
| `runtime/visual-dev-loop.mjs` | 151 | Visual dev loop framework |
| `runtime/loop-operator.mjs` | 170 | Scheduler wrapper with recovery |
| `runtime/harness-optimizer.mjs` | 220 | Config analysis and optimization |

### Agents (22)

| File | Purpose |
| --- | --- |
| `agents/workspace.md` | Project discovery |
| `agents/commander.md` | Mission orchestration |
| `agents/plan.md` | Planning |
| `agents/build.md` | Implementation |
| `agents/reviewer.md` | Verification |
| `agents/commander-enhanced.md` | Enhanced commander |
| `agents/oh-my-opencode.md` | Oh-My-OpenCode integration |
| `agents/swarm.md` | Multi-agent coordination |
| `agents/flow-next.md` | Flow-Next integration |
| `agents/forge.md` | Forge integration |
| `agents/ralph.md` | Ralph integration |
| `agents/verification-stack.md` | Verification stack |
| `agents/context-engine.md` | Context management |
| `agents/model-router.md` | Model routing |
| `agents/hooks.md` | Hook system (documentation) |
| `agents/observability.md` | Observability |
| `agents/nocturne.md` | Nocturne integration |
| `agents/nocturne-parser.md` | Nocturne parser |
| `agents/nocturne-ticket.md` | Nocturne tickets |
| `agents/nocturne-branch.md` | Nocturne branching |
| `agents/loop-operator.md` | Loop operator (agent-kit) |
| `agents/harness-optimizer.md` | Harness optimizer (agent-kit) |

### Other

| Path | Count | Purpose |
| --- | --- | --- |
| `templates/` | 10 | Task, mission, evidence, and state templates |
| `commands/` | 9 | Slash command definitions |
| `skills/manifest.json` | 1 | 166 skills manifest |
| `plugins/manifest.json` | 1 | damage-control plugin |
| `scripts/` | 5 | install, repair, backup, verify, update |
| `docs/` | 4 | PRD, audit, gap matrix, control-plane contract |
| `test/` | 1 | 13 unit tests |
