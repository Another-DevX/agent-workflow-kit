# Node.js example

A project that uses `node:test` for its fast check and adds a lint pass to the
full check.

## Project scripts

`package.json`:

```json
{
  "name": "example-service",
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "node --test",
    "lint": "node --check src/index.js",
    "verify:full": "npm test && npm run lint"
  }
}
```

## Generate the configuration

```sh
# From GitHub (available now)
npx github:Another-DevX/agent-workflow-kit#v0.1.1 init \
  --verify "npm test" \
  --verify-full "npm run verify:full" \
  --setup "npm ci"

# From a local clone
node /path/to/agent-workflow-kit/bin/workflow.mjs init \
  --verify "npm test" \
  --verify-full "npm run verify:full" \
  --setup "npm ci"
```

## Resulting `.agent-workflow/project.json`

```json
{
  "verifyCommand": "npm test",
  "verifyFullCommand": "npm run verify:full",
  "setupCommand": "npm ci",
  "scopeDocument": "docs/agent-workflow/scope.md"
}
```

## Validate the bootstrap

```sh
npm ci
node bin/workflow.mjs doctor
./scripts/verify.sh
```
