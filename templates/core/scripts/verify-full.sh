#!/usr/bin/env bash
#
# Full verification wrapper: the normal gate plus expensive integration/E2E/
# system checks, when the project configures them.
#
#   exit 0       verification passed
#   non-zero     verification failed
#
# This wrapper is generic: it reads .agent-workflow/project.json and delegates
# to scripts/harness/verify.mjs --full. If no verifyFullCommand is configured,
# full verification reports that clearly and passes on the normal gate alone.
#
# See docs/agent-workflow/DEVELOPMENT_CONTRACT.md section 10.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  printf 'error: node is required by scripts/verify-full.sh (scripts/harness/verify.mjs)\n' >&2
  exit 1
fi

exec node "$ROOT/scripts/harness/verify.mjs" --full "$@"
