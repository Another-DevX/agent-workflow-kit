---
description: Start a NORMAL delegated iteration for the given request.
agent: orchestrator
---

Requested work (NORMAL iteration):

$ARGUMENTS

Follow `docs/agent-workflow/orchestration.md` and the orchestrator lifecycle:
confirm the baseline, classify the iteration, decompose the request into a
dependency DAG, create one isolated worktree per delegated implementation task
with an explicit base, delegate workers (background when independent), integrate
deliberately, run `./scripts/verify.sh`, then drive the review session.

Before delegating, read `.agent-workflow/project.json` and the configured
`scopeDocument` when present.

Default to `ITERATION_PROFILE=NORMAL`. Only use QUICKFIX with explicit human
approval.

At promotion, commit the review evidence under `.review/` before running the
final `./scripts/verify.sh` on the exact HEAD, and only then move `known-good`.
