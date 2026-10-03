# Agent Workflow Kit

Implement bounded tasks in isolated worktrees. The orchestrator owns integration,
verification, review evidence and promotion. Workers must not push or move tags.
Preserve user files during installation and updates; report conflicts explicitly.
Use Node.js >=20 with no runtime dependencies. Canonical verification:

```sh
./scripts/verify.sh
```

Require independent review and final verification of the exact commit before
creating or moving `known-good`. The initial seed is not a verified baseline;
bootstrap review covers the complete initial implementation.
