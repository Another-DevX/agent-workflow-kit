# Configuration

## `.agent-workflow/project.json`

This file is the project's source of truth for how it is verified and
bootstrapped. It is **user-owned**: fields you add are preserved across
`update`.

```json
{
  "verifyCommand": "npm test",
  "verifyFullCommand": "npm run verify:full",
  "setupCommand": "npm ci",
  "scopeDocument": "docs/agent-workflow/scope.md"
}
```

| Key | Type | Meaning |
| --- | --- | --- |
| `verifyCommand` | string | Fast check used during iteration. |
| `verifyFullCommand` | string | Full check run before promoting a baseline. |
| `setupCommand` | string | Command that prepares the environment. |
| `scopeDocument` | string | Document describing the bounded task and acceptance criteria. |

These keys are populated from the corresponding `init` options
(`--verify`, `--verify-full`, `--setup`, `--scope`).

## `.agent-workflow/manifest.json`

The manifest records the kit version and a content hash for every managed file.
It is how `update` detects local edits and refuses to clobber them.

The exact schema is an implementation detail and may evolve. Tooling should read
it defensively and must not assume a particular shape beyond the presence of a
version and file hashes.

## Managed blocks

`AGENTS.md` and `.gitignore` are shared with the user. The kit appends a managed
block delimited by markers; everything outside that block belongs to the user
and is preserved. The managed block is merged in once and is not duplicated by
repeated `init` runs.

## Conflict and safety rules

- Required directories that are blocked by a regular file cause a **preflight
  failure before any write**.
- Symlinks that would redirect managed writes outside the target are refused.
- A drifted (locally edited) managed file makes `update` refuse rather than
  overwrite.
- `--dry-run` never writes, including when it would otherwise succeed.
- JSONC settings (JSON with comments) are preserved semantically when they can
  be merged safely; when a safe merge is not possible, the operation fails safe
  rather than rewriting or discarding your comments.
