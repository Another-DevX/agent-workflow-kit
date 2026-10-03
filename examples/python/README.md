# Python example

A project that uses pytest for its fast check and adds ruff to the full check.

## Expected tooling

```
requirements.txt      # runtime + test dependencies (pytest)
requirements-dev.txt  # ruff and other dev tools (optional)
pyproject.toml        # ruff configuration
```

## Generate the configuration

```sh
# From GitHub (available now)
npx github:Another-DevX/agent-workflow-kit#v0.1.1 init \
  --verify "pytest -q" \
  --verify-full "bash scripts/verify-full.sh" \
  --setup "python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt"

# From a local clone
node /path/to/agent-workflow-kit/bin/workflow.mjs init \
  --verify "pytest -q" \
  --verify-full "bash scripts/verify-full.sh" \
  --setup "python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt"
```

> The `setupCommand` is shell-specific. On Windows, use the equivalent
> activation command for `.venv\Scripts\activate` under Git Bash.

## Resulting `.agent-workflow/project.json`

```json
{
  "verifyCommand": "pytest -q",
  "verifyFullCommand": "bash scripts/verify-full.sh",
  "setupCommand": "python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt",
  "scopeDocument": "docs/agent-workflow/scope.md"
}
```

## Full verification script

[`verify-full.sh`](./verify-full.sh):

```sh
#!/usr/bin/env bash
set -euo pipefail
pytest -q
ruff check .
```

## Validate the bootstrap

```sh
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
node bin/workflow.mjs doctor
./scripts/verify.sh
```
