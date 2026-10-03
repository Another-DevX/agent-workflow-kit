# Verification

## Canonical script

`scripts/verify.sh` is the single entry point for verification. It:

1. requires Node.js >= 20;
2. syntax-checks every JavaScript and shell file in the tree;
3. runs the black-box `node:test` suite in `tests/`.

It **never** edits, creates, or deletes project files, and it **never** creates,
moves, or deletes git tags.

```sh
./scripts/verify.sh
```

## Test strategy

The suite is **black-box**. Each test spawns the CLI as a child process
(`process.execPath bin/workflow.mjs …`) inside a throwaway git repository and
observes:

- the process exit code, and
- the resulting filesystem (existence, content hashes, symlinks, snapshots).

Tests deliberately do **not** assert exact stdout/stderr wording, so the CLI can
improve its messages without breaking the suite.

The suite covers, among other things:

- a fresh `init` scaffold, configuration, and manifest;
- `--target`, `--dry-run`, and `--scope`;
- rejection when no check commands are supplied;
- idempotency (managed content is not duplicated);
- preservation of user `AGENTS.md`, `.gitignore`, and configuration;
- reuse of an existing `scripts/verify.sh`;
- conflict preflight with no partial writes;
- refusal to write through an escaping symlink;
- refusal to overwrite a locally edited managed file;
- `doctor` failing without a bootstrap and passing against a mock known-good.

## Running the suite directly

During local development you can point the suite at a CLI build without
installing anything:

```sh
AGENT_WORKFLOW_CLI=/path/to/workflow.mjs node --test tests/
```

Resolve named and streamed failures with the standard runners:

```sh
node --test tests/
node --test --test-name-pattern "idempotent" tests/
```

## Continuous integration

`.github/workflows/verify.yml` runs on Node.js 20 and 22 across Ubuntu and macOS.
Each job runs `npm test` (skipped gracefully when no test script is defined) and
then the canonical `./scripts/verify.sh`.

The package has zero runtime dependencies, so CI performs no install step.
