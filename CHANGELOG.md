# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-10-03

Initial release of the Agent Workflow Kit.

### Added

- `agent-workflow` CLI with the `init`, `update`, `doctor`, and `help` commands.
- Options: `--target <path>`, `--dry-run`, `--verify "<command>"`,
  `--verify-full "<command>"`, `--setup "<command>"`, and `--scope <document>`.
- Scaffolding for managed templates under `docs/agent-workflow/`,
  `scripts/harness/`, `scripts/verify.sh`, `scripts/verify-full.sh`, and
  `.opencode/` agents (`orchestrator`, `reviewer`, `subreviewer`) and commands
  (`iterate`, `quickfix`, `bootstrap`).
- Project configuration at `.agent-workflow/project.json`
  (`verifyCommand`, `verifyFullCommand`, `setupCommand`, `scopeDocument`).
- Manifest at `.agent-workflow/manifest.json` recording the kit version and
  content hashes used to detect local edits.
- Managed blocks in `AGENTS.md` and `.gitignore` that preserve user content.
- Reuse of an existing `scripts/verify.sh` instead of overwriting it.
- Safety guarantees: conflict preflight with no partial writes, symlink escape
  refusal, drift refusal on `update`, and write-free `--dry-run`.
- Canonical `scripts/verify.sh` that syntax-checks JavaScript and shell and runs
  the black-box `node:test` suite.
- Black-box test suite covering scaffolding, idempotency, data preservation,
  conflicts, symlinks, drift, and `doctor`.
- GitHub Actions workflow running Node.js 20 and 22 on Ubuntu and macOS.
- Documentation and realistic Node.js and Python examples.

### Notes

- Licensed under the MIT License.
- Requires Node.js >= 20; zero runtime dependencies.
- The npm package `@another-devx/agent-workflow` is **not published yet**
  (registry authentication was not available at release time). Until then, use
  the GitHub `npx`/`bunx` path or a local clone.

[Unreleased]: https://github.com/Another-DevX/agent-workflow-kit/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Another-DevX/agent-workflow-kit/releases/tag/v0.1.0
