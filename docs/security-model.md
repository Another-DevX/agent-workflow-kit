# Security model

Be precise about what the workflow isolates and what it does not.

## Worktrees are not a sandbox

The workflow uses **git worktrees** to give each bounded task its own checkout
and branch. This prevents concurrent work from colliding and keeps integration
clean.

However, a worktree is **not a security boundary**. It does not restrict:

- processes, users, or permissions;
- filesystem access outside the worktree;
- network access;
- environment variables or credentials.

A process running "in" a worktree can still read and write anywhere the
operating system allows. Treat worktrees as a concurrency and hygiene mechanism,
not as containment.

## What the CLI guarantees

The scaffold logic is written to be non-destructive:

- **Preflight before writes.** A path conflict (for example, a required
  directory blocked by a regular file) fails before any file is written, so a
  failed `init` leaves the tree untouched.
- **Symlink escape refusal.** A managed path that would be redirected outside
  the target through a symlink is refused.
- **Managed blocks.** `AGENTS.md` and `.gitignore` are shared files; only a
  delimited managed block is owned by the kit, and user content is preserved.
- **Reuse existing scripts.** An existing `scripts/verify.sh` is reused rather
  than overwritten.
- **Refuse drift.** `update` refuses to overwrite a managed file that was edited
  locally.
- **Dry runs write nothing.** `--dry-run` performs no filesystem writes.

## What the CLI does not guarantee

- It does not execute untrusted code in a sandbox.
- It does not encrypt or protect secrets.
- It does not replace code review.

## The real safety net

Because isolation is not containment, correctness rests on process:

1. verification of the exact commit, and
2. independent review before promotion.

The orchestrator owns integration, verification, review evidence, and promotion.
Workers must not push or move tags. The initial seed is not a verified baseline;
review covers the complete initial implementation.
