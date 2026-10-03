# Installation

The kit has **zero runtime dependencies** and requires **Node.js >= 20**. There
is no build step and no install step required to run it.

## Status of distribution channels

- **GitHub:** available now.
- **npm registry (`@another-devx/agent-workflow`):** **not published yet.**
  Registry authentication is not available in the current environment. npm
  instructions are therefore marked *after npm publication*.
- **License:** MIT.

## From GitHub with `npx` or `bunx`

`npx` and `bunx` can run a package directly from a git repository. Pinning a tag
is recommended.

```sh
# npm
npx github:Another-DevX/agent-workflow-kit#v0.1.0 init --verify "npm test"

# Bun (optional)
bunx github:Another-DevX/agent-workflow-kit#v0.1.0 init --verify "npm test"
```

Without the `#v0.1.0` suffix, the default branch is used.

> The `v0.1.0` tag must exist on the repository for the pinned form to work.
> This install path is the intended one and will be validated against the
> published tag.

## From a local clone

```sh
git clone https://github.com/Another-DevX/agent-workflow-kit.git
cd agent-workflow-kit

# Operate on another project…
node bin/workflow.mjs init --target /path/to/project --verify "npm test"

# …or on the clone itself.
node bin/workflow.mjs init --verify "npm test"
```

The CLI can be run directly with `node bin/workflow.mjs` from the clone; no
`npm install` is needed.

### Authenticated clone

If you are working from a private fork or need authenticated access:

```sh
git clone git@github.com:Another-DevX/agent-workflow-kit.git
# or
gh repo clone Another-DevX/agent-workflow-kit
```

## After npm publication (not available yet)

> **These commands do not work today.** They are provided so the workflow is
> ready once the package is published.

```sh
# One-off
npx @another-devx/agent-workflow@0.1.0 init --verify "npm test"
bunx @another-devx/agent-workflow@0.1.0 init --verify "npm test"

# As a dev dependency
npm install --save-dev @another-devx/agent-workflow
npx agent-workflow init --verify "npm test"
```

## Requirements

| Requirement | Notes |
| --- | --- |
| Node.js >= 20 | Required. |
| git | Required; the workflow is built on repositories and worktrees. |
| bash | Required for the shell harness and verification scripts. Git Bash works on Windows. |
| OpenCode V2 | Required to use the generated agents and commands. |
| Bun | Optional alternative runner. |
