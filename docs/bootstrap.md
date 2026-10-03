# Bootstrap

Bootstrapping turns a plain git repository into one that follows the bounded
workflow. The kit never assumes a bootstrap exists; `doctor` will tell you when
it does not.

## 1. Scaffold

Run `init` with the commands that describe how your project is verified:

```sh
node bin/workflow.mjs init \
  --verify "npm test" \
  --verify-full "npm run verify:full" \
  --setup "npm ci"
```

Preview first if you like:

```sh
node bin/workflow.mjs init --dry-run --verify "npm test"
```

## 2. Prepare the environment

Run the command you recorded as `setupCommand`. For the example above:

```sh
npm ci
```

Recording the setup command in configuration lets `doctor` reproduce the
environment when it validates the baseline.

## 3. Check the bootstrap

```sh
node bin/workflow.mjs doctor
```

Before the scaffold is committed and a baseline is established, `doctor` fails.
That is expected on a fresh repository.

## 4. Commit and tag the baseline

```sh
git add -A
git commit -m "chore: bootstrap agent workflow"
git tag known-good
```

The `known-good` tag marks a baseline that has passed verification and review.
Only the orchestrator promotes a baseline after independent verification of the
exact commit.

## 5. Verify again

```sh
node bin/workflow.mjs doctor
./scripts/verify.sh
```

## 6. Use the workflow

The scaffold installs OpenCode definitions:

- agents: `orchestrator`, `reviewer`, `subreviewer`
- commands: `iterate`, `quickfix`, `bootstrap`

Implement bounded tasks in isolated worktrees. The orchestrator owns
integration, verification, review evidence, and promotion; workers do not push
or move tags.

## See also

- [commands.md](./commands.md)
- [configuration.md](./configuration.md)
- [security-model.md](./security-model.md)
