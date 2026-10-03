#!/usr/bin/env bash
#
# Orchestrator-owned task worktrees.
#
#   1 delegated implementation task = 1 branch = 1 worktree
#
# Git worktrees are the fallback below OpenCode-native worktrees
# (docs/agent-workflow/orchestration.md). This helper is non-destructive:
# removal always refuses to discard uncommitted or untracked work, even with
# --force, and it detects cherry-pick integration instead of requiring force.
#
# Base selection is explicit. The helper never silently falls back to HEAD or
# known-good: the orchestrator must name the exact integration base.
#
# Usage:
#   worktree.sh create <task-id> <base-ref>   create branch task/<id> + worktree
#   worktree.sh list                          list worktrees
#   worktree.sh path <task-id>                print the worktree path
#   worktree.sh base <task-id>                print the worktree HEAD sha
#   worktree.sh status                        dirty/integrated summary per worktree
#   worktree.sh remove <task-id> [--force]    remove a safely disposable worktree
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

TREES_DIR=".worktrees"

die() { printf 'error: %s\n' "$1" >&2; exit 1; }
info() { printf '%s\n' "$1"; }
note() { printf 'note: %s\n' "$1" >&2; }

# A task id becomes a branch name and a path segment. Reject empty, "." and
# "..", a leading dash (option injection), and anything outside [A-Za-z0-9._-].
valid_id() {
  case "$1" in
    ''|.|..) return 1 ;;
    -*|*[!A-Za-z0-9._-]*) return 1 ;;
    *) return 0 ;;
  esac
}

branch_for() { printf 'task/%s' "$1"; }
path_for() { printf '%s/%s' "$TREES_DIR" "$1"; }

usage() {
  sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'
}

cmd_create() {
  local id="${1:-}" base="${2:-}"
  [ -n "$id" ] || die "create requires a task id"
  valid_id "$id" || die "invalid task id: $id (use [A-Za-z0-9._-]; \".\" and \"..\" are rejected)"
  [ -n "$base" ] || die "create requires an explicit base ref (no implicit HEAD/known-good fallback)"
  git rev-parse --verify -q "$base^{commit}" >/dev/null \
    || die "base ref not found: $base"

  local branch path
  branch="$(branch_for "$id")"
  path="$(path_for "$id")"

  git show-ref --verify -q "refs/heads/$branch" \
    && die "branch already exists: $branch"
  [ -e "$path" ] && die "path already exists: $path"

  mkdir -p "$TREES_DIR"
  git worktree add -b "$branch" "$path" "$base" >/dev/null

  local base_sha
  base_sha="$(git -C "$path" rev-parse HEAD)"
  info "created"
  info "task_id:   $id"
  info "branch:    $branch"
  info "worktree:  $path"
  info "base:      $base"
  info "base_sha:  $base_sha"
}

cmd_list() { git worktree list; }

cmd_path() {
  local id="${1:-}"
  [ -n "$id" ] || die "path requires a task id"
  valid_id "$id" || die "invalid task id: $id"
  info "$(path_for "$id")"
}

cmd_base() {
  local id="${1:-}"
  [ -n "$id" ] || die "base requires a task id"
  valid_id "$id" || die "invalid task id: $id"
  local path
  path="$(path_for "$id")"
  [ -d "$path" ] || die "no worktree for task: $id"
  git -C "$path" rev-parse HEAD
}

# Is every commit unique to the branch already present on a trusted ref, by
# ancestry or by cherry-pick patch equivalence?
is_integrated() {
  local branch="$1" ref tip plus
  tip="$(git rev-parse --verify -q "$branch^{commit}" 2>/dev/null)" || return 1
  for ref in known-good HEAD main origin/main; do
    git rev-parse --verify -q "$ref^{commit}" >/dev/null 2>&1 || continue
    if git merge-base --is-ancestor "$tip" "$ref" 2>/dev/null; then
      return 0
    fi
    # `git cherry` prints "-" for patch-equivalent commits and "+" for commits
    # still missing from the trusted ref. No "+" lines means fully integrated.
    plus="$(git cherry "$ref" "$tip" 2>/dev/null | grep '^+' || true)"
    if [ -z "$plus" ]; then
      return 0
    fi
  done
  return 1
}

cmd_status() {
  local found=0 path="" branch=""
  # --porcelain keeps paths intact even when they contain spaces.
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      "worktree "*) path="${line#worktree }" ;;
      "branch refs/heads/"*) branch="${line#branch refs/heads/}" ;;
      "")
        if [ -n "$path" ] && [ "$path" != "${path#"$ROOT/$TREES_DIR"/}" ]; then
          found=1
          local dirty="clean" integrated="integrated"
          if [ -n "$(git -C "$path" status --porcelain 2>/dev/null)" ]; then
            dirty="dirty"
          fi
          if [ -n "$branch" ] && ! is_integrated "$branch"; then
            integrated="unmerged"
          fi
          info "$(basename "$path"): $dirty, $integrated"
        fi
        path=""; branch=""
        ;;
    esac
  done < <(git worktree list --porcelain; printf '\n')
  [ "$found" -eq 1 ] || info "no task worktrees under $TREES_DIR"
}

cmd_remove() {
  local id="${1:-}" force="${2:-}"
  [ -n "$id" ] || die "remove requires a task id"
  valid_id "$id" || die "invalid task id: $id"
  local branch path
  branch="$(branch_for "$id")"
  path="$(path_for "$id")"
  [ -d "$path" ] || die "no worktree for task: $id"

  # Never discard uncommitted or untracked work, even with --force.
  if [ -n "$(git -C "$path" status --porcelain 2>/dev/null)" ]; then
    die "worktree $path has uncommitted work; commit it or move it to a safe place (--force cannot discard it)"
  fi

  # Cherry-picked commits are detected by is_integrated, so a cherry-pick
  # integration never needs --force. --force exists only for work that is
  # deliberately preserved elsewhere.
  if git show-ref --verify -q "refs/heads/$branch" && ! is_integrated "$branch"; then
    [ "$force" = "--force" ] \
      || die "branch $branch has unintegrated commits; integrate it, or pass --force only after confirming the work is preserved elsewhere"
    note "forcing removal of unintegrated branch: $branch"
  fi

  git worktree remove "$path" >/dev/null 2>&1 || git worktree remove --force "$path" >/dev/null
  if git show-ref --verify -q "refs/heads/$branch"; then
    git branch -D "$branch" >/dev/null
  fi
  info "removed worktree and branch for task: $id"
}

main() {
  local cmd="${1:-}"
  shift || true
  case "$cmd" in
    create) cmd_create "$@" ;;
    list)   cmd_list "$@" ;;
    path)   cmd_path "$@" ;;
    base)   cmd_base "$@" ;;
    status) cmd_status "$@" ;;
    remove) cmd_remove "$@" ;;
    ''|-h|--help|help) usage ;;
    *) die "unknown command: $cmd" ;;
  esac
}

main "$@"
