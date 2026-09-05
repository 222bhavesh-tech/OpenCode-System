# Phase 0 — Read-only Audit

Audited 2026-09-05 against OpenCode v1.18.27.

## Confirmed architecture

- Source of truth: `C:\Users\bhavesh jeengar\OpenCode-System` on `master`, commit `bacdd2f`; clean when audited.
- Live configuration: `C:\Users\bhavesh jeengar\.config\opencode\opencode.jsonc`.
- OpenCode CLI: `C:\Users\bhavesh jeengar\AppData\Roaming\npm\opencode.ps1`, version `1.18.27`.
- The repository has 20 agent briefs, 9 command prompts, 10 templates, 166 skill definitions, one installed plugin declaration, and 5 PowerShell lifecycle scripts.

## Live versus source

- Live agent configuration names: `workspace`, `commander`, `plan`, `build`, `reviewer`, plus built-ins.
- Only `workspace.md`, `commander.md`, and `reviewer.md` are deployed as custom agent files. `build` and `plan` are configured but their source files are absent from the live agents directory; source instead contains `build.md` and `planner.md`.
- 17 MCPs are configured; 14 are enabled. The live skill directory contains 166 skills.
- The repository `verify.ps1`, `install.ps1`, `repair.ps1`, `update.ps1`, and `backup.ps1` hard-code the live configuration directory. The verifier stopped at that directory under the audit sandbox; it does not test runtime orchestration.

## Implemented today versus pre-existing claims

Before this change, all Flow/Forge/Ralph/Swarm/verification capabilities existed only as prompts, templates, or prose. There was no task graph implementation, persistent state schema, scheduler, event log, evidence decision, failure memory, executable loop, test suite, or runtime integration.

## Risks and conflicts

- The configured `plan` agent and source `planner.md` naming diverge.
- Source configuration enables CMS and social MCPs by default, widening authority beyond ordinary engineering work.
- The script verifier checks presence and config names, not operation, compatibility, state recovery, MCP health, or model routing.
- `repair.ps1` assigns live agent/MCP fields into the source object before comparing, making its comparison unable to detect those differences.
- No explicit OpenCode plugin package or command-to-runtime binding exists.

## Git state

`master` tracks `origin/master` at `bacdd2f`; no user changes were reported by `git status --short --branch` during the audit.
