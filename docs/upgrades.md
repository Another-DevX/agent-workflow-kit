# Upgrades

Managed files are tracked by content hash in `.agent-workflow/manifest.json`.
Upgrades use those hashes to avoid clobbering your work.

## Upgrading the kit

1. Get the new version:
   - **From a clone:** `git pull` (or check out the desired tag).
   - **From GitHub:** run the desired tag with `npx`/`bunx`.
   - **After npm publication:** use the published version.
2. Run `update` against your project:

   ```sh
   node bin/workflow.mjs update
   ```

3. Run verification and `doctor`:

   ```sh
   ./scripts/verify.sh
   node bin/workflow.mjs doctor
   ```

## Handling drift

If you edited a managed file, `update` refuses to overwrite it and reports the
path. This is intentional: silent overwrites destroy local fixes.

Options:

- Merge your change into the new managed content, remove the drift, and re-run
  `update`.
- Restore the original managed file (for example, delete your edit) and re-run.

`update` never touches user files, user configuration, or the user portions of
managed blocks.

## Idempotency

`init` and `update` are idempotent. Running them repeatedly converges on the
same result and does not duplicate managed content or grow the manifest.

## Pin versions

Pin a tag for reproducible upgrades:

```sh
npx github:Another-DevX/agent-workflow-kit#v0.1.1 update
```

After npm publication:

```sh
npx @anotherdev/agent-workflow@0.1.1 update
```
