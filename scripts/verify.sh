#!/usr/bin/env bash
#
# Canonical verification for the agent-workflow-kit repository.
#
# What it does:
#   1. Requires Node.js >= 20.
#   2. Syntax-checks every JavaScript and shell file in the tree.
#   3. Runs the black-box node:test suite in tests/.
#
# What it never does:
#   * It never edits, creates or deletes project files.
#   * It never creates, moves or deletes git tags.
#
# Usage:
#   ./scripts/verify.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

log()  { printf 'verify: %s\n' "$1"; }
fail() { printf 'verify: ERROR: %s\n' "$1" >&2; exit 1; }

# --- Node.js >= 20 -----------------------------------------------------------

if ! command -v node >/dev/null 2>&1; then
  fail "node is required but was not found on PATH (need >= 20)"
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "${NODE_MAJOR}" -lt 20 ] 2>/dev/null; then
  fail "node >= 20 is required (found $(node --version))"
fi
log "using node $(node --version)"

# --- JavaScript syntax -------------------------------------------------------

# Collect JavaScript files, skipping vendored and generated locations.
js_files=()
while IFS= read -r -d '' file; do
  js_files+=("$file")
done < <(
  find . -type f \( -name '*.mjs' -o -name '*.cjs' -o -name '*.js' \) \
    -not -path './node_modules/*' \
    -not -path './.git/*' \
    -not -path './.worktrees/*' \
    -not -path './.orchestration/*' \
    -print0 2>/dev/null
)

if [ "${#js_files[@]}" -gt 0 ]; then
  for file in ${js_files[@]+"${js_files[@]}"}; do
    case "$file" in
      *.mjs|*.cjs)
        node --check "$file" || fail "syntax error in $file"
        ;;
      *.js)
        # A .js file may be CommonJS or ESM depending on package.json.
        # Try CommonJS first, then fall back to module parsing via stdin.
        if ! node --check "$file" >/dev/null 2>&1; then
          node --input-type=module --check - < "$file" \
            || fail "syntax error in $file"
        fi
        ;;
    esac
  done
fi
log "checked ${#js_files[@]} JavaScript file(s)"

# --- Shell syntax ------------------------------------------------------------

sh_files=()
while IFS= read -r -d '' file; do
  sh_files+=("$file")
done < <(
  find . -type f -name '*.sh' \
    -not -path './node_modules/*' \
    -not -path './.git/*' \
    -not -path './.worktrees/*' \
    -not -path './.orchestration/*' \
    -print0 2>/dev/null
)

if [ "${#sh_files[@]}" -gt 0 ]; then
  for file in ${sh_files[@]+"${sh_files[@]}"}; do
    bash -n "$file" || fail "syntax error in $file"
  done
fi
log "checked ${#sh_files[@]} shell file(s)"

# --- node:test suite ---------------------------------------------------------

test_files=()
if [ -d tests ]; then
  while IFS= read -r -d '' file; do
    test_files+=("$file")
  done < <(find tests -type f -name '*.test.mjs' -print0 2>/dev/null)
fi

if [ "${#test_files[@]}" -gt 0 ]; then
  # Pass explicit files: `node --test <dir>` behaves differently across major
  # Node versions, while explicit file paths are stable.
  log "running node:test suite (${#test_files[@]} file(s))"
  node --test ${test_files[@]+"${test_files[@]}"}
else
  log "no tests/*.test.mjs files found; skipping test run"
fi

log "all checks passed"
