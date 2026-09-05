# Control Plane Contract

## Authority boundary

The control plane owns one durable state document per target project. It does
not choose a model, call an LLM, spawn an OpenCode agent, change GitHub, or run
a shell command. Those actions require adapters in later phases. This boundary
prevents a second hidden orchestration loop from appearing beside Commander.

## State invariants

- A task has a unique ID and all dependencies must already exist.
- The graph must be acyclic when state is loaded or changed.
- Only a `PENDING` task with completed dependencies can become `IN_PROGRESS`.
- A task can complete only from `IN_PROGRESS` and only with passing evidence for
  each of its declared evidence types.
- Every failure has a category and an operational record; attempts are bounded
  by `retriesPerTask` and end in `FAILED` after the limit.
- A project reaches `COMPLETE` only when every task is complete.
- State writes are atomic: JSON is written to a sibling temporary file and then
  renamed into place.

## Event and data safety

Events store timestamps, state transitions, identifiers, and caller-supplied
operational summaries. They do not store private reasoning. Secrets must never
be supplied as task descriptions, evidence summaries, or failure records.

## Adapter requirements

Every future adapter (OpenCode agent, terminal, browser, GitHub, or MCP) must:

1. Read the project state before work.
2. Register a start/observation/result/failure event.
3. Store inspectable evidence before requesting task completion.
4. Respect task status, retries, and budgets.
5. Remain cancellable and never alter task state after cancellation without an
   explicit recovery action.
