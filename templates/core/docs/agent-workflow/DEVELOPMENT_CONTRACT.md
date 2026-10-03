# Agent Development Contract

This document is the normative contract for all agent-assisted development work
in this repository. It is intentionally project-agnostic: product scope, stack,
and verification commands come from the project configuration, not from this
document.

## How to read this document

There are three distinct layers. Keep them separate:

- **Normative (this document and its siblings).** The rules that govern how work
  is verified, reviewed, and promoted. They must not be weakened by agent
  prompts, local configuration, or convenience.
- **Operational (`.opencode/agents`, `.opencode/commands`).** Adapters that carry
  out the normative rules in OpenCode. A prompt may add detail; it may never
  relax a guarantee here. When an agent prompt and this contract disagree, the
  contract governs.
- **Sandbox (runtime state).** `.orchestration/` and `.worktrees/` are ephemeral,
  git-ignored execution state. They are not evidence, they are not committed, and
  they are never a substitute for a commit or for the promoted tag.

**Project configuration** lives in `.agent-workflow/project.json`. Deployment,
scope, and the canonical verification commands are project concerns:

```jsonc
{
  // required: the normal mechanical gate
  "verifyCommand": "npm run verify",
  // optional: expensive integration/E2E/release checks
  "verifyFullCommand": "npm run verify:full",
  // optional, opt-in: bootstrap/setup for a fresh checkout or worktree
  "setupCommand": "npm ci",
  // optional: the document that defines what is in scope for the project
  "scopeDocument": "docs/scope.md"
}
```

Agents read this file before acting. `verifyCommand` must be a real project
command; the workflow wrapper `./scripts/verify.sh` reads this config and must
never be configured as the command itself (that recurses; the engine rejects it).

See also:

- `docs/agent-workflow/orchestration.md` — operational mechanics for delegated
  work.
- `docs/agent-workflow/iteration-profiles.md` — `NORMAL` and `QUICKFIX`
  lifecycles.
- `docs/agent-workflow/review-state.md` — review-session state schema.
- `docs/agent-workflow/bootstrap.md` — first-run behavior when no baseline
  exists.

## Prime Directive

Never build new work on top of a state known or suspected to be broken.

Before modifying the repository, establish a known-good baseline. After
modifying it, prove that the new state preserves the baseline behavior plus the
requested change.

- A passing state is evidence.
- An untested state is unknown.
- A failing state must not become the foundation for further work.
- A commit is not automatically a known-good state.

A state becomes known-good only after the complete development iteration has
passed both:

1. mechanical verification; and
2. independent reviewer/adversarial verification.

The Git tag `known-good` identifies the latest state that satisfied both gates.
It must never be advanced merely because an intermediate commit passes tests.

If the repository has no `known-good` tag yet, follow
`docs/agent-workflow/bootstrap.md`. An empty repository, an initial commit, and
an untested HEAD are all **untrusted candidates**, never a baseline.

## 1. Establish the Baseline

Before making changes:

1. Inspect repository status and recent history.
2. Identify the current known-good commit.
3. Run the project's canonical verification suite against the current state when
   appropriate.
4. Record the baseline result.
5. Identify the functionality and invariants relevant to the requested change.

The canonical mechanical verification commands are:

```bash
./scripts/verify.sh
./scripts/verify-full.sh   # when the project configures expensive checks
```

If the current state passes verification and corresponds to an already reviewed
state:

```text
BASELINE = known-good
```

If HEAD contains newer unreviewed work:

```text
BASELINE  = known-good
CANDIDATE = HEAD
```

Do not silently redefine HEAD as known-good.

If the baseline itself fails:

Do not immediately patch the failure. Determine whether the failure:

- predates the requested work;
- is environmental or flaky;
- represents a historical regression;
- indicates that the known-good assumption is no longer valid.

Use repository history, regression tests, and when appropriate `git bisect` to
investigate.

Do not build new functionality on top of an unresolved broken baseline.

## 2. Preserve Existing Behavior

Existing passing behavior is considered part of the contract unless the task
explicitly requires changing it.

Before changing behavior:

- identify existing tests protecting it;
- identify relevant contracts and invariants;
- add regression coverage when meaningful protection is missing;
- do not weaken or delete existing tests merely to make a change pass.

A test may only be changed when:

1. the requested behavior intentionally changes the contract; or
2. the test itself is demonstrably incorrect.

When an existing test is changed or removed, document why.

Passing tests are not proof that every behavior is correct, but existing passing
behavior must not be intentionally discarded without justification.

## 3. Regression-First Bug Fixing

When fixing a reproducible bug:

1. Reproduce the bug.
2. Reduce the reproduction to the smallest useful case when practical.
3. Add a regression test that fails because of the bug.
4. Verify that the regression test fails before the fix.
5. Determine whether the bug was introduced historically or by current
   uncommitted work.
6. Find the last known-good state when useful.
7. Understand the violated invariant or root cause before modifying the
   implementation.
8. Implement the smallest coherent fix.
9. Verify that the regression test passes.
10. Run the complete applicable verification suite.

Do not patch symptoms repeatedly. Prefer restoring the violated invariant or
correcting the original regression.

Every meaningful fixed regression should leave behind executable evidence that
prevents the same failure from silently returning.

## 4. Known-Good States

The repository uses the Git tag `known-good` as the canonical pointer to the
latest fully verified development state.

A known-good state means:

```text
mechanical verification PASS
    AND
reviewer/adversarial verification PASS
```

The tag is intentionally movable.

After a complete successful development iteration:

```bash
git tag -f known-good HEAD
```

may be used to advance it to the newly accepted state. The tag must not be moved:

- after every commit;
- before the development iteration is complete;
- when verification fails;
- when reviewer verification fails;
- while a regression remains unresolved.

Intermediate commits may be valid, useful, and intentionally granular without
being known-good. Therefore:

```text
COMMIT != KNOWN_GOOD
```

A typical iteration may look like:

```text
known-good
    |
    v
    A --- B --- C --- D
                    ^
                   HEAD
```

where A, B, C, and D are granular development commits. The reviewer does not
need to review each one independently. At the end of the iteration the complete
transition is evaluated:

```text
known-good -> HEAD
```

If verification and review pass, the tag may advance:

```text
                    known-good
                        |
                        v
    A --- B --- C --- D
```

## 5. Known-Good Recovery

When current code contains cascading, uncertain, or compensating fixes, do not
continue stacking patches. Prefer recovering causal understanding before adding
another modification.

The preferred investigation procedure is:

```text
current failure
     |
     v
reproduce failure
     |
     v
encode regression test
     |
     v
confirm failure at HEAD
     |
     v
confirm success at known-good
     |
     v
  git bisect
     |
     v
first bad commit
     |
     v
inspect introducing change
     |
     v
identify root cause / violated invariant
     |
     v
choose recovery strategy
     |
     +----------------------+
     |                      |
     v                      v
repair forward       rebuild from known-good
```

Do not reset, revert, rebase, checkout destructively, rewrite history, or discard
user work without explicit authorization. Historical commits may be inspected
freely.

Temporary checkouts performed as part of a controlled `git bisect` investigation
are allowed when the working tree is clean and user work is not at risk. If
uncommitted user work exists, protect it before any operation that could alter
the working tree.

## 6. Bisect Regression Protocol

Use `git bisect` when:

- a regression is reproducible;
- the current state is bad;
- an earlier known-good state is confirmed good;
- the regression's origin is unknown or materially useful to identify;
- an automated GOOD/BAD oracle can be constructed.

Do not use bisect mechanically for every failure. Before bisecting, classify and
reproduce the failure.

### 6.1 The Regression Oracle

Bisect requires a deterministic or sufficiently reliable command that determines
whether a historical commit exhibits the regression. Prefer a focused regression
test. The command should return:

```text
exit 0      behavior is GOOD
exit 1-127  behavior is BAD
exit 125    commit cannot be reliably tested
```

Before starting the bisect, verify against HEAD and the known-good baseline that
the oracle reports BAD and GOOD respectively. If both states produce the same
result, the range or the oracle is invalid and must be investigated.

### 6.2 Running the Bisect

```bash
git bisect start
git bisect bad HEAD
git bisect good known-good
git bisect run <regression-oracle>
```

After investigation:

```bash
git bisect reset
```

must restore the original working state.

### 6.3 Purpose of Bisect

Bisect reduces the debugging problem from "why is the current repository broken?"
to "what changed between the last good state and the first bad state that caused
this specific regression?" After it identifies the first bad commit, inspect it
and determine what behavior changed, which invariant was violated, whether the
change was intentional, whether later commits depend on the broken behavior, and
whether subsequent commits are primarily compensating patches.

## 7. Regression Recovery Strategy

After identifying the root cause, explicitly choose between:

```text
REPAIR FORWARD
REBUILD FROM KNOWN-GOOD
```

**Repair forward** when later commits contain valid independent work, the root
cause is localized, correcting it at HEAD preserves a coherent architecture, and
rebuilding would unnecessarily discard valuable work. Fix the root cause on top
of the current development state and preserve the legitimate subsequent work.

**Rebuild from known-good** when subsequent commits primarily patch or work
around the same underlying regression, when patches depend on earlier patches in
a fragile chain, when the implementation has accumulated contradictory fixes,
when current behavior is difficult to reason about, or when restoring the
original invariant is simpler and safer.

```text
GOOD                                GOOD
  |                                   |
  +-- bad implementation              +-- correct implementation
  +-- patch                           +-- preserved legitimate work
  +-- patch of patch                  |
  +-- workaround                    NEW HEAD
  |
 HEAD  (needs another patch?)     (rebuild here instead)
```

This decision concerns engineering strategy. It does not authorize destructive
Git operations. Any destructive reset, history rewrite, rebase, or removal of
user work still requires explicit authorization.

## 8. Commit Discipline

Commits must be small, coherent, and independently understandable. A commit
should represent one logical change. Prefer:

```text
test: reproduce duplicate-session regression
fix: preserve session during token refresh
test: cover refresh after page reload
```

Avoid committing unrelated refactors, formatting across unrelated files,
dependency upgrades, feature work, and bug fixes together unless technically
inseparable.

Granular commits are important for readability and for causal debugging. A clean
commit history makes `git bisect` substantially more useful. Intermediate commits
do not need independent adversarial review; the reviewer operates on the complete
iteration from the baseline to the candidate.

## 9. Minimal Change Principle

Make the smallest coherent change that solves the root problem.

Do not perform unrelated refactors while implementing a task. If a refactor is
necessary, isolate it in a separate commit whenever possible.

"Minimal" does not mean the smallest textual patch. A slightly larger change
that restores the correct invariant or removes a faulty patch chain is preferable
to a tiny workaround that increases structural fragility. Optimize for the
smallest coherent root-cause fix, not the smallest diff at any cost.

## 10. Verification Gate

A candidate is not ready for review until all applicable mechanical gates pass.
These may include tests, regression tests, typecheck, lint, build, relevant
integration tests, and relevant E2E tests.

Repository-specific verification commands must be defined in one canonical
location: `verifyCommand` (and optionally `verifyFullCommand`) in
`.agent-workflow/project.json`.

The canonical local verification interface is:

```bash
./scripts/verify.sh
```

Agents should prefer the canonical command over manually inventing subsets of the
verification process. The wrapper reads the project config; the configured
command runs from the repository root.

The verification command must:

- return exit code 0 when verification succeeds;
- return a non-zero exit code when verification fails;
- avoid modifying source code;
- avoid automatically fixing formatting or lint problems;
- avoid committing changes;
- never move the `known-good` tag;
- produce enough output to identify which gate failed.

When expensive system or E2E verification exists, the repository may
additionally define `verifyFullCommand`. The distinction is:

```text
verify.sh       fast enough for normal development,
                strong enough to establish mechanical confidence
verify-full.sh  expensive integration, E2E, system, or release-level
                verification
```

`verify-full.sh` runs the normal gate first and aborts if it fails; if no full
command is configured it says so explicitly and passes on the normal gate alone.

Passing mechanical verification does not promote a candidate to known-good. It
only makes the candidate eligible for reviewer/adversarial verification.

## 11. Development Iteration

An **iteration** is one attempt to move the repository from the current
known-good state to a new candidate state satisfying a coherent unit of requested
work. An iteration may contain several granular commits. The reviewer does not
run per commit:

```text
known-good
    |
    +-- commit A
    +-- commit B
    +-- commit C
             |
             v
           VERIFY
             |
             v
           REVIEW
```

The normal development loop is:

```text
understand task
     |
     v
identify invariants
     |
     v
implement
     |
     +--> granular commit
     +--> granular commit
     |
     v
mechanical verification
     |
     +------ FAIL ------> failure protocol (section 13)
     |
    PASS
     |
     v
reviewer/adversarial gate
     |
  +--+--+
  |     |
 FAIL  PASS
  |     |
  |     v
  |   evidence commit
  |     |
  |     v
  |   final verify on exact HEAD
  |     |
  |     v
  |   move known-good
  |
  v
review session: fix batch -> recheck -> resume
```

The iteration is a state machine, not a linear script:

```text
    IMPLEMENT
        |
        v
    VERIFY
      /   \
   FAIL   PASS
    |       |
    |       v
    |     REVIEW
    |     /    \
    |   FAIL   PASS
    |    |       |
    +----+       v
             PROMOTE
```

- **VERIFY FAIL** returns to IMPLEMENT after the failure protocol in section 13.
  The reviewer is not invoked.
- **REVIEW FAIL** pauses the review session on a batch of at most three blocking
  findings. The batch is corrected, verified, and rechecked; the session then
  resumes instead of starting over.
- The `known-good` tag stays fixed for the entire iteration. It must not move
  during IMPLEMENT, VERIFY failure recovery, or review recovery.

The reviewer always evaluates `git diff known-good...HEAD`, even across
corrective work, so all corrective work remains visible relative to the last
trusted baseline.

### 11.1 Review Session

Review is incremental. A **review session** spans one iteration and may run the
reviewer in several modes:

```text
DISCOVERY  find at most three blocking findings, then pause
RECHECK    confirm the batch fixes; no unrelated discovery
RESUME     continue discovery from the recorded state
TARGETED   bounded review of a QUICKFIX diff
```

The session is complete only when every scope has been reviewed, no blocking
finding is open, and no scope was invalidated by later corrective work. A fresh
full review is not required after each corrective batch; that would discard the
session's work and re-audit already-closed scopes.

Session state is persisted per `docs/agent-workflow/review-state.md`.

### 11.2 Circuit Breakers

An unbounded `while not reviewer_passes: fix()` loop is forbidden; it produces
exactly the patch-on-patch behavior this contract prohibits. The orchestrator
drives the cycle and runs root-cause recovery plus focused tests between every
batch.

Operational limits:

```text
MAX_BLOCKERS_PER_BATCH           = 3
MAX_RECHECK_ATTEMPTS_PER_FINDING = 2
MAX_FULL_REVIEW_RESTARTS         = 1
```

There is deliberately no limit on the number of healthy batches. A sequence such
as `3 blockers -> fix -> 2 blockers -> fix -> 0 blockers` is a healthy session.

A full `DISCOVERY` restart is permitted at most once, and only when corrective
work materially invalidates the session: the architecture or public interfaces
change, the schema changes substantially, a security boundary changes, earlier
reviewed assumptions no longer hold, or large unrelated implementation changes
are introduced. Otherwise the existing session continues with `RECHECK` then
`RESUME`.

When a limit is exceeded:

1. STOP;
2. report the repeated failure with evidence;
3. escalate to the human / change-control gate.

Do not keep patching.

## 12. Reviewer / Risk-Based Adversarial Gate

After the implementation loop is complete and mechanical verification passes,
the `reviewer` subagent must independently inspect the complete change from the
last known-good baseline to the current candidate state. The reviewer runs as a
single incremental review session per completed development iteration, not once
per commit.

The reviewer must initially operate read-only. Its job is not to modify the
implementation but to determine whether the candidate state can safely be
promoted to known-good. It acts both as a conventional code reviewer and as an
adversarial regression reviewer. "Adversarial" means actively looking for
realistic ways the change could violate existing behavior, contracts,
invariants, or the requested functionality. It does not mean pessimistic by
default, and the reviewer must not manufacture concerns merely to produce
findings.

A clean review is a valid and successful outcome. Saying `REVIEW PASSED` when the
evidence supports it fulfills the reviewer's function just as much as finding a
legitimate defect.

Findings should only be reported when supported by concrete evidence, a
plausible failure mode, a violated contract or invariant, or a meaningful
engineering risk.

### 12.1 Review Scope

The reviewer must compare `KNOWN_GOOD` against `CANDIDATE` and inspect the
complete iteration diff rather than reviewing commits independently. The primary
comparison should be equivalent to `git diff known-good...HEAD`. The reviewer
should use available evidence including task requirements, the complete
iteration diff, existing and new regression tests, mechanical verification
results, repository invariants, public contracts and interfaces, and relevant
implementation context.

### 12.2 Reviewer Responsibilities

The reviewer must consider regressions; unintended behavior changes; deleted or
unreachable functionality; API or contract changes; violated system invariants;
weakened, removed, or bypassed tests; missing meaningful regression coverage;
edge cases materially affected by the change; compatibility problems; suspicious
error handling; unnecessary scope expansion; unrelated changes; and cases where
tests pass but behavior may still be incorrect.

This list is assessed as risk dictates. The reviewer is not required to
exhaustively check every item; it prioritizes what the diff could plausibly
affect. The reviewer must distinguish "I can imagine a theoretical problem" from
"this change introduces a plausible or demonstrated problem". Only the latter
should normally become a finding.

### 12.3 Reviewer Checklist

The reviewer must produce a checklist containing meaningful positive and
negative findings. Example:

```text
Reviewer Checklist
[PASS] Requested behavior is covered by tests.
[PASS] Existing public API remains compatible.
[PASS] No unrelated files were modified.
[PASS] Existing regression suite passes.
[WARN] New retry path is not covered by an integration test.
[FAIL] Existing session invalidation behavior changed unexpectedly.
```

`PASS` items are meaningful evidence and must represent properties the reviewer
actually verified. `WARN` and `FAIL` items must include concrete reasoning.

### 12.4 Severity Semantics

```text
PASS
    Verified desirable property.
WARN
    Credible risk that deserves consideration but does not establish
    that the candidate is incorrect.
FAIL
    Concrete regression, contract violation, correctness problem, or
    sufficiently evidenced blocking risk.
```

The reviewer must not use `WARN` as a catch-all for speculative concerns.
Warnings do not automatically cause the review to fail.

### 12.5 Reviewer Verdict

The reviewer must finish with exactly one verdict:

```text
REVIEW PASSED
REVIEW FAILED
REVIEW INCOMPLETE
```

`REVIEW PASSED` means the review session is complete: every scope has been
reviewed, no blocking finding is open, and no scope was invalidated by later
corrective work. This is the only verdict that permits promotion.

`REVIEW FAILED` means at least one blocking finding is open, or a recheck failed.
Discovery pauses on the reported batch.

`REVIEW INCOMPLETE` means the current batch is resolved but scopes remain
un-reviewed. Review resumes from the recorded state.

Warnings never by themselves produce `REVIEW FAILED`.

If review fails or is incomplete:

1. do not move `known-good`;
2. treat findings as evidence, not implementation instructions;
3. validate blocking findings before acting on them;
4. correct root causes rather than blindly satisfying reviewer wording;
5. rerun mechanical verification;
6. recheck the batch, then resume the session — do not start a fresh full review
   unless section 11.2 permits a restart.

Correcting a review means fixing the underlying defect, not producing the
smallest patch that makes the reviewer stop objecting.

Only after mechanical verification passes on the exact promoted HEAD **and** the
review session is complete may the candidate be promoted to known-good.

### 12.6 Risk-Based Review

Review is **risk-based adversarial**, not exhaustive. The reviewer's mission is
to find material regressions introduced by the candidate, prioritizing effort
according to risk. It is not required to inspect every file, and a clean review
is a valid outcome.

Review effort scales with the change, not with the repository. Trivial changes
are reviewed with targeted reads. Cross-cutting or security-critical changes may
justify additional depth or delegation. A one-line fix must not be escalated into
a multi-agent review.

### 12.7 Materiality Threshold

A finding may block promotion only when it has all of:

- concrete evidence (a path and line, and/or a diff hunk);
- a plausible, specific failure mode;
- a violated contract, invariant, or material regression;
- introduction or exposure by this candidate.

Stale wording, formatting, naming preference, speculative concerns, and
pre-existing issues are not blocking findings. A factually false claim is
material only when it misstates behavior in a way that would mislead an operator
or reviewer; pure phrasing is not.

### 12.8 Review Session State

Incremental review requires persisted state. Each iteration keeps its session
state under `.review/<iteration>/`, with the schema defined in
`docs/agent-workflow/review-state.md`.

The state records reviewed scopes, open and resolved findings with stable ids
(`F1`, `F2`, …), and the last verdict. The orchestrator owns and writes it; the
reviewer is read-only and returns updated state, which the orchestrator persists.
Because the completed session is the evidence justifying promotion, it is
committed with the promotion (before the final verification; see section 15).

A `complete` scope remains valid until later corrective work touches its files,
at which point it is invalidated back to `partial` and revisited on resume.

### 12.9 Delegated Scoped Review

The reviewer may act as a review lead and delegate a single domain to the
`subreviewer` agent when a change is cross-cutting or security-critical.

A delegated subreviewer is read-only; receives exactly one narrow scope; returns
evidence-backed findings or `NO_FINDINGS_IN_SCOPE`; and never issues a verdict.

The reviewer, not the delegate, deduplicates findings, rejects speculative ones,
requires evidence, classifies severity, selects the batch of at most three
blockers, and issues the verdict. Delegation must reduce effort, not multiply it.
When a scope is not affected by the diff, it is marked `not_applicable` and no
subreviewer is launched.

## 13. Failure Protocol

If verification fails after a change, do not blindly patch the newest error.
First classify the failure:

```text
REGRESSION
NEW REQUIREMENT FAILURE
PRE-EXISTING FAILURE
FLAKY/ENVIRONMENTAL FAILURE
UNKNOWN
```

For a regression:

1. identify the behavior that changed;
2. identify the invariant that was violated;
3. reproduce the failure;
4. create regression coverage when appropriate;
5. determine whether the regression belongs to current work or historical work;
6. identify the introducing commit with `git bisect` when doing so materially
   improves diagnosis;
7. understand the root cause;
8. choose repair-forward or rebuild-from-known-good;
9. implement the correction;
10. rerun the complete applicable verification suite.

Repeated local patches without understanding the regression are prohibited. If
multiple consecutive fixes target the same underlying behavior, explicitly
consider whether the system has entered a patch-on-patch state. If so, stop and
reevaluate from the last known-good state.

## 14. Regression Test Infrastructure

Regression tests should be identifiable and reusable. When compatible with the
repository's testing conventions, place them under `tests/regressions/`.

A regression test should document through executable behavior:

```text
this failed before;
this must continue working.
```

When a regression test is useful for historical diagnosis, provide a focused
executable command or wrapper suitable for `git bisect run`. Repository-specific
bisect wrappers may live under `scripts/regression/`. These scripts must be
non-destructive and should test one regression as directly as practical.

Documentation for regression investigation should live in
`scripts/regression/README.md`.

## 15. Promotion to Known-Good

Promotion is an explicit operation performed only at the end of a successful
development iteration. Required state:

```text
requested behavior implemented
        +
mechanical verification PASS on the exact promoted HEAD
        +
review session COMPLETE (REVIEW PASSED)
        +
no unresolved blocking finding
        +
no reviewed scope invalidated by later corrective work
        +
no unresolved material regression known
```

The ordering below is normative and must not be reordered:

```text
1. COMMIT EVIDENCE   commit the completed review session under .review/<iteration>/
2. FINAL VERIFY      run ./scripts/verify.sh on the exact resulting HEAD
3. TAG               git tag -f known-good HEAD
```

The evidence commit must come **before** the final verification. Otherwise the
final verification would run on a commit that is not the commit being tagged, and
the tag would point at a state that was never mechanically verified. Commit the
review state first, verify that exact HEAD, then move the tag.

Then:

```text
CANDIDATE  = HEAD
```

may become:

```text
KNOWN_GOOD = HEAD
```

by advancing:

```bash
git tag -f known-good HEAD
```

Moving the tag is the final acknowledgement that the iteration produced a new
trusted foundation. Future development should begin from this state unless
explicitly working with unreviewed work.

## 16. Definition of Done

A task is DONE only when:

- requested behavior is implemented;
- existing behavior has been preserved unless intentionally changed;
- regression coverage exists where appropriate;
- new regressions have reproducible tests when practical;
- existing tests still pass;
- canonical mechanical verification passes;
- relevant full/E2E verification passes when required;
- the diff contains no unexplained unrelated changes;
- reviewer/adversarial gate passes;
- reviewer findings contain no unresolved blocking issues;
- the review session is complete, with its state committed under `.review/`;
- no reviewed scope remains invalidated by later corrective work;
- commits are logically structured and granular;
- no unexplained patch-on-patch chain remains;
- recovery strategy was explicitly considered when historical regression
  investigation occurred;
- the repository ends in a verified state;
- `known-good` identifies the latest accepted foundation and points at a commit
  that passed the final verification after the evidence commit.

The final lifecycle is:

```text
KNOWN_GOOD
    |
    v
DEVELOPMENT
    |
    v
GRANULAR COMMITS
    |
    v
VERIFY
    |
    v
REVIEW / ADVERSARIAL
    |
    v
COMMIT EVIDENCE
    |
    v
FINAL VERIFY (exact HEAD)
    |
    v
PROMOTE (tag)
    |
    v
NEW KNOWN_GOOD
```

The objective is not to prevent agents from making mistakes. The objective is to
ensure that mistakes are detectable, attributable, reversible, and prevented
from becoming the foundation for further work.

## 17. Delegated Execution and Isolation

This section is normative. It preserves every guarantee in sections 1–16 and
adds the invariants that govern delegated, isolated development. Operational
mechanics live in `docs/agent-workflow/orchestration.md` and
`docs/agent-workflow/iteration-profiles.md`; those documents must not weaken
these invariants.

### 17.1 Implementation isolation

Every delegated implementation task executes in isolated state:

```text
1 delegated implementation task = 1 branch = 1 worktree
```

The orchestrator owns worktree creation, base selection, and cleanup. Workers do
not create their own execution environments and do not operate on the integration
workspace. A task worktree begins from the commit containing all of its satisfied
dependencies, which may be newer than `known-good`.

### 17.2 Orchestrator integration ownership

Workers never integrate themselves. Only the orchestrator inspects a completed
worker, checks its acceptance criteria, chooses an integration strategy
(cherry-pick or merge), and integrates. Workers must not:

- integrate another worker's branch;
- modify the integration workspace;
- push or deploy without authorization;
- perform irreversible actions outside the existing human gates;
- silently expand scope beyond their task contract.

### 17.3 `known-good` immutability

A worker can never move `known-good`. The tag moves only at the promotion gate in
section 15, after mechanical verification and a complete review session.

### 17.4 Delegation default

Substantial product implementation is delegated by default. The orchestrator may
directly perform integration, bookkeeping, task-state maintenance, trivial
harness operations, and tiny mechanical corrections where delegation would cost
more than the work. It should not directly perform substantial product
implementation.

### 17.5 Verification ownership

Verification ownership is unchanged from section 10. Workers may run focused
tests for their own task and never establish repository trust. The orchestrator
runs `./scripts/verify.sh`. The reviewer consumes the recorded result and does
not re-run mechanical verification. The exact HEAD being promoted must pass
`./scripts/verify.sh`.

### 17.6 Review independence

The `reviewer` remains the independent review lead and the sole owner of the
verdict. `subreviewer` agents remain read-only, bounded, evidence-producing, and
non-verdict. Delegation must reduce effort, not multiply it.

The review session includes a bounded `TARGETED` mode, used for QUICKFIX diffs.
`TARGETED` examines the quickfix diff, directly affected behavior, and
immediately adjacent effects. It must not become repository-wide `DISCOVERY`. A
`TARGETED` review may still produce blocking findings.

### 17.7 Iteration profiles

```text
ITERATION_PROFILE=NORMAL     default
ITERATION_PROFILE=QUICKFIX   narrow human-directed correction
```

QUICKFIX is not a shortcut past verification or review. It requires all of:

1. eligibility (narrow scope, clear behavior, small/local diff, no architecture
   change, no substantial schema migration, no security-boundary change, no
   public-contract change, no new feature);
2. explicit human approval of the profile;
3. a human result checkpoint before integration;
4. a bounded `TARGETED` review;
5. a final `./scripts/verify.sh` PASS on the exact promotion HEAD.

When eligibility is uncertain, the profile is NORMAL.

### 17.8 QUICKFIX escalation

The orchestrator must not silently upgrade QUICKFIX to NORMAL. If the change
reveals cross-cutting impact, an architecture or public-interface change, schema
or security implications, a large diff, multiple independent root causes, or
significant unrelated cleanup, the orchestrator stops, reports the evidence, and
asks the human to approve escalation. Useful worker state is preserved where
safe after approval.

### 17.9 Human steering

The human may steer, stop, reject, or continue delegated work. The orchestrator
forwards steering to the same child session when OpenCode supports it, rather
than spawning a fresh worker with lost context. If steering materially changes
architecture, task dependencies, public interfaces, scope, or security
assumptions, the orchestrator recomputes the affected task dependencies before
continuing.

### 17.10 Failure isolation

A failed worker must not corrupt `known-good`, the integration workspace, or
another worker. The orchestrator prefers explicit failure over speculative
continuation: a blocked worker is reported or investigated, an ambiguous
dependency does not launch dependent work, a semantic integration conflict is
returned to a worker or the human, and a suspected broken foundation triggers the
recovery protocol in sections 5–7.

### 17.11 Runtime state

Runtime orchestration state is lightweight and ephemeral, is ignored by Git, and
is not a substitute for commits. Transitions are not individually versioned. A
compact final iteration summary may be retained for observability.

## 18. Bootstrap

When the repository has no `known-good` baseline, normal iteration assumptions do
not hold. The first promotion is governed by `docs/agent-workflow/bootstrap.md`.
In short: the current HEAD (or an initial seed commit) is an **untrusted
candidate**, never trusted because it exists; it requires a full initial review
over the whole tree, an evidence commit, and a final verification on the exact
HEAD before `known-good` may be created.
