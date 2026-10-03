# Commands

The binary is named `agent-workflow`. From a clone, invoke it as
`node bin/workflow.mjs`.

```
agent-workflow <init|update|doctor|help> [options]
```

## `init`

Scaffolds managed templates, merges managed blocks into `AGENTS.md` and
`.gitignore`, and writes `.agent-workflow/project.json` and
`.agent-workflow/manifest.json`.

At least one check command is required (`--verify`, `--verify-full`, or
`--setup`); otherwise `init` is rejected and writes nothing.

`init` is safe to re-run: it is idempotent and will not duplicate managed
content. An existing `scripts/verify.sh` is **reused**, not overwritten.

```sh
agent-workflow init \
  --verify "npm test" \
  --verify-full "npm run verify:full" \
  --setup "npm ci"
```

## `update`

Refreshes managed files from the current kit version.

- Managed files are compared against the hashes in
  `.agent-workflow/manifest.json`.
- If a managed file was edited locally, `update` **refuses** to overwrite it and
  reports the conflict. Resolve it deliberately, then re-run.
- User files, user configuration, and the user portions of managed blocks are
  preserved.

```sh
agent-workflow update
```

## `doctor`

Checks the health of a bootstrapped project. It fails while the project is
missing its bootstrap or its known-good baseline, and passes once the scaffold
has been committed and tagged `known-good` and the configured setup command
succeeds.

```sh
agent-workflow doctor
```

## `help`

Prints usage.

```sh
agent-workflow help
```

## Options

| Option | Argument | Default | Description |
| --- | --- | --- | --- |
| `--target` | `<path>` | current directory | Repository to operate on. |
| `--dry-run` | — | off | Report changes without writing anything. |
| `--verify` | `<command>` | — | Fast verification command (`verifyCommand`). |
| `--verify-full` | `<command>` | — | Full verification command (`verifyFullCommand`). |
| `--setup` | `<command>` | — | Environment/bootstrap command (`setupCommand`). |
| `--scope` | `<document>` | — | Scope document path (`scopeDocument`). |

Preview any change first:

```sh
agent-workflow init --dry-run --verify "npm test"
```

## Exit codes

The CLI uses a non-zero exit code to signal rejection, conflicts, or a failed
check. `0` always means success. Exact messages are not part of the stable
contract; the filesystem effects and exit status are.
