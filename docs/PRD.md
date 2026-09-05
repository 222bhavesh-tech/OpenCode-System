# Product Requirements Document — OpenCode-System

**Version:** 0.1.0  
**Status:** Draft for implementation  
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

## 9. Architecture

```text
OpenCode user / command
        │
        ▼
Commander adapter ──► ControlPlane (.opencode-system/state.json)
        │                         │
        ▼                         ├── task DAG / budgets / checkpoints
Worker adapter                     ├── events / failures / decisions
  ├── terminal                     └── evidence references
  ├── background agent
  ├── worktree/sandbox
  ├── browser
  └── GitHub (optional)
        │
        ▼
Independent verification adapters ──► Evidence gate ──► task transition
```

The control plane does not execute model calls or shell commands itself. It
defines the state and invariants; adapters do work and return receipts.

## 10. Milestones

### M0 — Audit and foundation (complete)

- Read-only audit and gap matrix.
- Dependency-free local control-plane runtime.
- Durable state, DAG validation, evidence gate, failure ledger, checkpoints,
  events, CLI, and automated tests.

### M1 — OpenCode binding

- Resolve deployed agent naming (`plan` versus `planner`) without overwriting
  user customizations.
- Add OpenCode commands that read/write control-plane state.
- Replace presence-only verification with a runnable doctor/demo.

### M2 — Worker and process runtime

- Add command execution receipts, bounded background workers, cancellation,
  process tracking, and recovery.
- Add file-ownership declarations and safe parallel scheduling.

### M3 — Verification adapters

- Run test/build/lint/type/security adapters.
- Add browser workflow/screenshot evidence for web projects.
- Implement independent spec/code/security review gates.

### M4 — Worktrees and sandbox

- Add worktree lifecycle with ownership, conflict detection, and cleanup.
- Evaluate and, if compatible, bind Forge’s execution/sandbox capability.

### M5 — Context, memory, model routing, observability

- Add context snapshots and retrieval.
- Add persistent failure/project memory.
- Add routing receipts, usage limits, and status dashboard.

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

## 14. Current implementation status

Implemented and tested: durable local project state, task creation, dependency
validation, cycle rejection, ready-task selection, task start, evidence
recording, evidence-gated completion, classified failure history, bounded
retries, checkpoints, event history, status, and CLI invocation.

Not yet implemented: OpenCode command binding, agents/workers, background
execution, process management, worktrees, sandboxing, browser/security/test
adapters, GitHub integration, dynamic model routing runtime, and dashboard.
