# Agent Workflow Kit — templates

Portable OpenCode V2 workflow templates. This directory is the source the CLI
copies into a target repository.

`templates/core/AGENTS.md` and `templates/core/.gitignore.tmpl` are the bodies
the CLI installs into **managed marker blocks** inside the target's own
`AGENTS.md` and `.gitignore`, preserving everything the user wrote around them.
The `.tmpl` suffix on the ignore file is deliberate: npm strips a real
`.gitignore` from the published tarball, so the template ships renamed and the
CLI maps it back (`stripTemplateSuffix`).

## Install mapping

```text
templates/core/            ->  <repo root>/
  docs/agent-workflow/*.md ->  docs/agent-workflow/*.md
  scripts/harness/*        ->  scripts/harness/*
  scripts/verify.sh        ->  scripts/verify.sh
  scripts/verify-full.sh   ->  scripts/verify-full.sh

templates/opencode/        ->  .opencode/
  agents/*.md              ->  .opencode/agents/*.md
  commands/*.md            ->  .opencode/commands/*.md
```

Keep the destination of `templates/opencode/**` relative to `.opencode`: an
agent at `templates/opencode/agents/orchestrator.md` installs to
`.opencode/agents/orchestrator.md`.

## `.agent-workflow/project.json` (created by the CLI)

The CLI creates the project configuration. Fields:

```jsonc
{
  "verifyCommand": "<required, non-empty: the normal mechanical gate>",
  "verifyFullCommand": "<optional: expensive integration/E2E/release checks>",
  "setupCommand": "<optional, opt-in: setup for a fresh checkout/worktree>",
  "scopeDocument": "<optional: path to the project scope document>"
}
```

- `verifyCommand` is required. The wrappers fail clearly when it is missing or
  empty.
- `verifyFullCommand` is optional. `verify-full.sh` runs `verifyCommand` first
  and aborts if it fails; when no full command is configured it says so
  explicitly and passes on the normal gate alone.
- `setupCommand` and `scopeDocument` are read by agents, never by the
  verification wrappers.
- The CLI must not hardcode or token-replace project commands into the
  templates. The wrappers are generic and read this file at run time.

## Verification wrapper contract

```bash
./scripts/verify.sh        # -> node scripts/harness/verify.mjs
./scripts/verify-full.sh   # -> node scripts/harness/verify.mjs --full
```

`scripts/harness/verify.mjs` runs the configured commands from the repository
root, sets a recursion marker for children, and rejects a command that points
back at a wrapper. Therefore **never set `verifyCommand` to
`./scripts/verify.sh`, `./scripts/verify-full.sh`, or
`scripts/harness/verify.mjs`** — that would recurse.

### Existing `scripts/verify.sh`

If the target repository already has its own `scripts/verify.sh`, the CLI
**should preserve it** rather than overwrite user files. The contract in that
case:

- `verifyCommand` must name the project's real gate (for example
  `npm run verify` or the preserved script's own command), not the workflow
  wrapper path.
- The workflow's generic wrappers may still be installed under different names,
  or the CLI may leave the project's `scripts/verify.sh` as the canonical
  `./scripts/verify.sh`; either way the development contract's canonical
  interface is `./scripts/verify.sh` and it must run the real gate.
- Report the preserved-file collision explicitly rather than silently skipping
  or overwriting.

## Runtime state and Git

- `.orchestration/` — ephemeral orchestrator state, git-ignored.
- `.worktrees/` — task worktrees, git-ignored.
- `.review/<iteration>/` — review-session evidence; **tracked** and committed
  before the final verification.

The CLI installs the managed `.gitignore` block (from
`templates/core/.gitignore.tmpl`) that ignores the first two and keeps the
third tracked.

## Worktree helper

`scripts/harness/worktree.sh` owns one branch/worktree per delegated task:

```bash
worktree.sh create <task-id> <base-ref>   # base is explicit; no implicit fallback
worktree.sh list
worktree.sh path <task-id>
worktree.sh base <task-id>
worktree.sh status
worktree.sh remove <task-id> [--force]
```

Safety: ids reject `.`, `..`, leading dashes, and unsafe characters; paths with
spaces work; removal always refuses uncommitted/untracked work even with
`--force`; cherry-picked commits are detected as integrated so a cherry-pick
integration never needs `--force`.
