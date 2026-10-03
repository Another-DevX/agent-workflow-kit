# Agent Workflow Kit

[![verify](https://github.com/Another-DevX/agent-workflow-kit/actions/workflows/verify.yml/badge.svg)](https://github.com/Another-DevX/agent-workflow-kit/actions/workflows/verify.yml)

A portable workflow kit that scaffolds a bounded, worktree-based agent workflow
into any repository: managed documentation, harness/verification scripts,
OpenCode agent and command definitions, and a project config that records your
verification commands.

- **Zero runtime dependencies.** Plain Node.js ESM against the standard library.
- **Node.js >= 20.**
- **Non-destructive by default.** User files and existing scripts are preserved;
  conflicts are reported before anything is written.

## Project status

| Aspect | Status |
| --- | --- |
| Source repository | Public on GitHub: [`Another-DevX/agent-workflow-kit`](https://github.com/Another-DevX/agent-workflow-kit) |
| License | [MIT](./LICENSE) |
| npm package `@anotherdev/agent-workflow` | Published on npm as [`@anotherdev/agent-workflow@0.1.1`](https://www.npmjs.com/package/@anotherdev/agent-workflow). |
| GitHub install (`npx` / `bunx` / clone) | The intended direct-install path. It requires the `v0.1.0` tag to exist on the repository. |

The package is published on the public npm registry, so the `npx`/`bunx` paths
below work directly. The GitHub and local-clone paths remain available as
alternatives.

## Requirements

- [Node.js](https://nodejs.org/) **>= 20**
- `git`
- a POSIX shell (`bash`); Git Bash works on Windows
- [OpenCode V2](https://opencode.ai/) to use the generated agents and commands
- [Bun](https://bun.sh/) **optional**, as an alternative package runner/agent runtime

No installation step is required: the kit has no runtime dependencies.

## Quick start

### 1. Directly from GitHub (available now)

`npx` and `bunx` can run a package straight from a GitHub repository. The
`#v0.1.1` suffix pins the release tag; without it, the repository's default
branch is used.

```sh
# npm / npx
npx github:Another-DevX/agent-workflow-kit#v0.1.1 init --verify "npm test"

# Bun / bunx (optional)
bunx github:Another-DevX/agent-workflow-kit#v0.1.1 init --verify "npm test"
```

### 2. From a local clone (available now)

```sh
git clone https://github.com/Another-DevX/agent-workflow-kit.git
cd agent-workflow-kit

# Scaffold another project…
node bin/workflow.mjs init --target /path/to/your/project --verify "npm test"

# …or scaffold the clone itself.
node bin/workflow.mjs init --verify "npm test"
```

For an authenticated clone (for example a private fork over SSH):

```sh
git clone git@github.com:Another-DevX/agent-workflow-kit.git
# or, with the GitHub CLI:
gh repo clone Another-DevX/agent-workflow-kit
```

### 3. After npm publication (not available yet)

> **These commands will not work until the package is published to npm.**
> They are documented here so the workflow is ready when registry
> authentication is available.

```sh
# One-off run
npx @anotherdev/agent-workflow@0.1.1 init --verify "npm test"
bunx @anotherdev/agent-workflow@0.1.1 init --verify "npm test"

# Install as a dev dependency
npm install --save-dev @anotherdev/agent-workflow
npx agent-workflow init --verify "npm test"
```

## Commands

The CLI binary is named `agent-workflow` (run `node bin/workflow.mjs` from a
clone).

| Command | Purpose |
| --- | --- |
| `init` | Scaffold the workflow into the target repository. |
| `update` | Refresh managed files, refusing to overwrite local edits. |
| `doctor` | Check that the project is bootstrapped and its baseline is sound. |
| `help` | Print usage. |

### Options

| Option | Description |
| --- | --- |
| `--target <path>` | Directory to operate on. Defaults to the current working directory. |
| `--dry-run` | Show what would change without writing anything. |
| `--verify "<command>"` | Fast verification command recorded as `verifyCommand`. |
| `--verify-full "<command>"` | Full verification command recorded as `verifyFullCommand`. |
| `--setup "<command>"` | Environment/bootstrap command recorded as `setupCommand`. |
| `--scope <document>` | Scope document path recorded as `scopeDocument`. |

At least one check command (`--verify`, `--verify-full`, or `--setup`) is
required; `init` is rejected otherwise.

```sh
node bin/workflow.mjs init \
  --verify "npm test" \
  --verify-full "npm run verify:full" \
  --setup "npm ci" \
  --scope docs/agent-workflow/scope.md
```

Run `init --dry-run` first to preview changes.

## What `init` writes

`init` creates managed templates and records their hashes so later updates can
detect local edits:

```
.agent-workflow/
  project.json        # verifyCommand, verifyFullCommand, setupCommand, scopeDocument
  manifest.json       # kit version + content hashes of managed files
docs/agent-workflow/  # managed workflow documentation
scripts/
  verify.sh           # canonical verification (reused if one already exists)
  verify-full.sh
  harness/            # harness helpers
.opencode/
  agents/             # orchestrator, reviewer, subreviewer
  commands/           # iterate, quickfix, bootstrap
AGENTS.md             # managed block appended, user content preserved
.gitignore            # managed block appended, user content preserved
```

Exact template filenames are an implementation detail; the directories above are
the stable contract.

## Configuration

`init` writes `.agent-workflow/project.json`:

```json
{
  "verifyCommand": "npm test",
  "verifyFullCommand": "npm run verify:full",
  "setupCommand": "npm ci",
  "scopeDocument": "docs/agent-workflow/scope.md"
}
```

| Key | Meaning |
| --- | --- |
| `verifyCommand` | Fast check used during iteration. |
| `verifyFullCommand` | Full check used before promoting a baseline. |
| `setupCommand` | Command that prepares the environment (dependencies, toolchain). |
| `scopeDocument` | Document that describes the bounded task and acceptance criteria. |

This file is user-owned. Unknown fields you add are preserved across `update`.

## Bootstrap usage

1. **Scaffold** into your repository:

   ```sh
   node bin/workflow.mjs init \
     --verify "npm test" \
     --verify-full "npm run verify:full" \
     --setup "npm ci"
   ```

2. **Run the setup command** recorded in the config (`--setup`) so the
   environment matches what `doctor` expects.

3. **Verify the bootstrap**:

   ```sh
   node bin/workflow.mjs doctor
   ```

   `doctor` fails while the project is missing its bootstrap or a known-good
   baseline, and passes once the scaffold is committed and tagged `known-good`.

4. **Commit and tag the baseline**, then drive work through the generated
   OpenCode agents (`orchestrator`, `reviewer`, `subreviewer`) and commands
   (`iterate`, `quickfix`, `bootstrap`).

5. **Run the canonical verification** before promoting anything:

   ```sh
   ./scripts/verify.sh
   ```

## Worktrees are not a sandbox

The workflow relies on **git worktrees** for isolation: each bounded task gets a
separate checkout so work does not collide. A worktree is **not a security
sandbox**. It does not restrict processes, filesystem access, network access, or
permissions. A worker in a worktree can still read and write outside that
directory.

Isolation properties (separate working directories, separate branches) are about
concurrency and clean integration — not containment. Treat verification,
independent review, and promotion controls as the real safety net.

## Upgrades

Managed files are tracked by hash in `.agent-workflow/manifest.json`.

- **From a clone:** pull the new version, then run `update`.
- **After npm publication:** run `npx @anotherdev/agent-workflow@<version> update`.
- **From GitHub:** `npx github:Another-DevX/agent-workflow-kit#v<version> update`.

```sh
node bin/workflow.mjs update
```

`update` will **refuse** to overwrite any managed file you have edited, and
reports the conflicting paths instead. Resolve the conflict deliberately (merge
your change or restore the managed version) and run `update` again. User files,
user configuration, and the user portions of managed blocks are never
overwritten.

## Verification and CI

Canonical verification is `./scripts/verify.sh`. It:

1. requires Node.js >= 20,
2. syntax-checks JavaScript and shell files,
3. runs the black-box `node:test` suite in `tests/`.

It never edits files and never creates or moves git tags.

GitHub Actions runs the same checks on Node.js 20 and 22 across Ubuntu and macOS
(`.github/workflows/verify.yml`).

## Repository layout

```
bin/            # CLI entry points
src/            # implementation
templates/      # scaffold content
tests/          # black-box node:test suite
scripts/        # verify.sh and harness helpers
docs/           # project documentation
examples/       # realistic Node.js and Python configurations
```

## License

MIT. See [LICENSE](./LICENSE).

See [CHANGELOG.md](./CHANGELOG.md) for release history.
