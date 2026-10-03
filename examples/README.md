# Examples

Realistic starting points for wiring an existing project into the workflow.

| Example | Stack | Verification |
| --- | --- | --- |
| [node/](./node) | Node.js + `node:test` | `npm test` / `npm run verify:full` |
| [python/](./python) | Python + pytest + ruff | `pytest -q` / `pytest -q && ruff check .` |

Each example shows the `.agent-workflow/project.json` the kit writes and the
`init` invocation that produces it. Copy the values that match your project.

See [installation.md](../docs/installation.md) for the available install paths
and [configuration.md](../docs/configuration.md) for every configuration key.
