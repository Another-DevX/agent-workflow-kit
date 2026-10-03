# Review Session State

This document defines the persisted state of a **review session** — the
incremental, batched review lifecycle described in the Agent Development
Contract sections 11–12.

A review session replaces the "fresh reviewer over the whole diff after every
corrective iteration" model. It lets the reviewer pause on a batch of blocking
findings, recheck the fixes, and resume where it stopped instead of starting
over.

## Location

State is written per iteration:

```text
.review/
└── iteration-<id>/
    ├── state.yaml
    ├── findings.yaml
    └── evidence/
```

`<id>` is the iteration's identifier chosen by the orchestrator (for example a
monotonic number, a short slug, or the candidate short SHA).

The **orchestrator owns this directory** and writes it. The reviewer is
read-only and returns an updated state block; the orchestrator persists it.
Because the review session is the evidence that justifies promotion, the
directory is tracked in Git and committed **before** the final verification, so
the promoted tag points at a commit containing the evidence (see the development
contract section 15).

## `state.yaml`

```yaml
iteration: iteration-42
profile: NORMAL           # NORMAL | QUICKFIX (docs/agent-workflow/iteration-profiles.md)
known_good: 5f5ab9d       # or "none" during bootstrap
candidate: def4567        # exact HEAD under review
mode: discovery           # discovery | recheck | resume | targeted
reviewed_scopes:
  auth: complete
  database: complete
  frontend: partial
  contracts: not_applicable
active_findings: [F1, F2, F3]
resolved_findings: []
next_finding_id: F4
recheck_attempts:
  F1: 0
  F2: 0
  F3: 0
review_complete: false
verdict: review_failed     # review_passed | review_failed | review_incomplete
```

Field notes:

| Field | Meaning |
|---|---|
| `profile` | Iteration profile the session belongs to (`NORMAL` or `QUICKFIX`). |
| `known_good` | Baseline tag SHA the session is measured against; `none` during bootstrap. |
| `candidate` | Exact HEAD SHA currently under review. |
| `mode` | Mode of the most recent reviewer run. `targeted` is the bounded QUICKFIX mode. |
| `reviewed_scopes` | `complete`, `partial`, or `not_applicable` per scope. |
| `active_findings` | Open finding ids in the current batch. |
| `resolved_findings` | Findings closed by a later recheck. |
| `next_finding_id` | Next id to assign; ids are stable for the whole session. |
| `recheck_attempts` | Recheck attempts per finding, against the circuit breaker. |
| `review_complete` | True only when every scope is reviewed and no blocker is open. |
| `verdict` | Last verdict returned by the reviewer. |

## `findings.yaml`

```yaml
- id: F1
  severity: FAIL              # WARN | FAIL (FAIL is the blocking severity)
  scope: frontend
  title: "A documented capability is not actually implemented"
  evidence: "README.md:84, src/feature/impl.ts:551"
  failure_mode: "An operator trusts the documentation and skips the manual step the code still requires."
  materiality: "Factually false claim about shipped behavior."
  status: open               # open | resolved | invalidated
  introduced_by: def4567
  resolved_by: null          # SHA of the corrective commit, when resolved
  recheck_attempts: 0
- id: F2
  severity: WARN
  scope: database
  title: "New retry path has no integration coverage"
  evidence: "src/db/retry.ts:12"
  failure_mode: "A regression in the retry path would not be caught by the suite."
  materiality: "Coverage gap, not a demonstrated defect."
  status: open
  introduced_by: def4567
  resolved_by: null
  recheck_attempts: 0
```

Only `FAIL` findings count toward the three-per-batch limit and gate promotion.
`WARN` findings are recorded but do not block.

## Lifecycle

```text
DISCOVERY ──(≥1 blocker)──► batch of ≤3 ──► fix ──► RECHECK
    │                                                  │
    │                                          ┌───────┴────────┐
    │                                        FAIL             RESOLVED
    │                                          │                 │
    │                                          └──► fix ◄────    │
    │                                                             │
    │◄──────────────────── RESUME ◄───────────────────────────────┘
    │
    └──(0 blockers, all scopes complete)──► REVIEW PASSED
```

Rules:

1. `DISCOVERY` stops at three blockers. `review_complete` stays `false`.
2. A corrective commit may invalidate scopes it touched (see the reviewer's
   corrective-diff invalidation rule); mark them `partial`.
3. `RECHECK` closes or reopens the batch findings only. A still-open finding
   increments its `recheck_attempts` (limit 2).
4. When the batch is resolved, `RESUME` continues discovery for the scopes that
   are not `complete`.
5. `review_complete: true` and `verdict: review_passed` are set only when every
   scope is `complete` or `not_applicable`, no `FAIL` finding is open, and no
   scope remains invalidated by later corrective work.
6. Promotion requires a completed session, the evidence committed **before** a
   final mechanical verification on the exact promoted HEAD, and only then the
   tag move.

## TARGETED mode

`TARGETED` is the bounded review mode for a `QUICKFIX` iteration
(`docs/agent-workflow/iteration-profiles.md`). It is not a replacement for
`DISCOVERY` on a NORMAL iteration.

- It examines the quickfix diff, directly affected behavior, and immediately
  adjacent effects only.
- It records a single bounded scope (for example `quickfix`) in
  `reviewed_scopes`; it must not enumerate or re-audit the whole repository.
- It may produce blocking findings; corrections follow targeted recheck
  semantics (`RECHECK` limited to the batch, then `TARGETED` again).
- If the diff proves not to be bounded, the reviewer stops and reports that
  escalation to NORMAL is required; the orchestrator must not silently upgrade.
- The verdicts are unchanged: `review_passed`, `review_failed`,
  `review_incomplete`. Only the reviewer lead issues them.

## Bootstrap sessions

During bootstrap (no `known-good` yet) the session runs in the normal modes but
with `known_good: none` and the initial seed as the untrusted candidate; scopes
cover the whole tree. See `docs/agent-workflow/bootstrap.md`.
