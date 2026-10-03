# Agent Workflow

This project uses the portable agent workflow kit. Before modifying the
repository, read and follow:

```text
docs/agent-workflow/DEVELOPMENT_CONTRACT.md
```

Operational mechanics for delegated execution live in:

```text
docs/agent-workflow/orchestration.md
docs/agent-workflow/iteration-profiles.md
docs/agent-workflow/review-state.md
```

Project scope for the current increment is defined in:

```text
{{SCOPE_DOCUMENT}}
```

Canonical mechanical verification:

```sh
{{VERIFY_COMMAND}}
```

Rules:

- One delegated implementation task = one branch = one worktree.
- The orchestrator owns worktrees, integration, verification and promotion.
- Workers never integrate themselves, move `known-good`, push or deploy.
- Review is independent, incremental and evidence-based.
- Never build new work on a suspected broken foundation.
- Do not move `known-good` until an iteration passes verification and review.
- Preserve user content outside the managed block below.
