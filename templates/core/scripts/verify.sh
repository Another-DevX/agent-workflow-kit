#!/usr/bin/env bash
#
# Canonical mechanical verification wrapper.
#
#   exit 0       verification passed
#   non-zero     verification failed
#
# This wrapper is generic: it reads .agent-workflow/project.json and delegates
# to scripts/harness/verify.mjs. It performs no token replacement and knows
# nothing about the project's stack. Configure the real gate in project.json;
# never point verifyCommand back at this script (that would recurse, and the
# engine rejects it).
#
# See docs/agent-workflow/DEVELOPMENT_CONTRACT.md section 10.
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v node >/dev/null 2>&1; then
  printf 'error: node is required by scripts/verify.sh (scripts/harness/verify.mjs)\n' >&2
  exit 1
fi

exec node "$ROOT/scripts/harness/verify.mjs" "$@"
