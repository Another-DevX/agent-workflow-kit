# Bootstrap: The First Known-Good

This document defines what happens when the repository has **no `known-good`
baseline**. It is normative for the first promotion only; after a `known-good`
tag exists, normal iteration rules apply.

## 1. Why bootstrap is special

Every guarantee in `docs/agent-workflow/DEVELOPMENT_CONTRACT.md` depends on a
trusted baseline. When there is no `known-good` tag, there is no baseline, and
the normal iteration assumptions do not hold:

- there is no `git diff known-good...HEAD` to review;
- a passing test suite proves the suite passes, not that the tree is trustworthy;
- an initial commit is just a commit.

The following are **never** treated as a trusted baseline by themselves:

- an empty repository;
- an initial "seed" commit;
- the current `HEAD`;
- a green CI run;
- the mere absence of a `known-good` tag.

They are an **untrusted candidate**. Bootstrap exists to convert an untrusted
candidate into the first known-good through the same two gates used everywhere
else: mechanical verification and independent adversarial review — applied to the
whole candidate rather than a diff.

## 2. Bootstrap is not a shortcut

Bootstrap does **not** relax any invariant. It still requires:

- explicit, non-empty `verifyCommand` in `.agent-workflow/project.json`;
- a mechanical verification PASS on the exact candidate;
- a complete independent review of the whole candidate;
- the review evidence committed **before** the final verification;
- a final verification on the exact HEAD that will be tagged;
- the tag moved only after all of the above.

The orchestrator must not create or move `known-good` to make the repository
"look bootstrapped", and must not claim the seed is trusted because the tests
pass.

## 3. Confirm the state

Before acting, confirm there is genuinely no baseline:

```bash
git tag --list known-good
git status
git log --oneline -n 20
```

If `known-good` exists, stop: use the normal iteration lifecycle
(`docs/agent-workflow/iteration-profiles.md`), not this document.

If there is no baseline, determine the candidate:

```text
repository has commits        CANDIDATE = HEAD
repository has no commits     create an initial seed commit, then CANDIDATE = its SHA
```

The seed commit is a normal development commit; it is explicitly **untrusted**
until the gates pass. An empty tree is not a candidate at all — it is the empty
state.

## 4. Configuration first

Bootstrap cannot succeed without a real mechanical gate. Ensure
`.agent-workflow/project.json` exists and `verifyCommand` is present, non-empty,
and runs the project's actual checks from the repository root:

```jsonc
{
  "verifyCommand": "<the real fast gate>",
  "verifyFullCommand": "<optional expensive gate>",
  "setupCommand": "<optional opt-in setup>",
  "scopeDocument": "<optional project scope document>"
}
```

If no real verification exists yet, do not invent trust: ask the human to define
the gate, or treat establishing it as the first task. A candidate with no
mechanical gate cannot be promoted to known-good.

## 5. Review the whole candidate

Bootstrap runs one full initial review over the entire candidate, because there
is no baseline diff to bound it.

- Baseline: the **empty tree**. Review the whole candidate with:
  `git diff $(git hash-object -t tree /dev/null) HEAD`.
- `known_good: none` in `.review/<iteration>/state.yaml`.
- Mode: `DISCOVERY`, but with coverage of the whole project rather than a diff.
- Define the session's `reviewed_scopes` up front to cover the candidate (for
  example by top-level module or risk domain). Every scope must reach `complete`
  or `not_applicable` for the session to complete — a bootstrap review is not
  risk-partial the way a later diff review can be.
- The normal circuit breakers still apply: at most **3** blockers per batch,
  at most **2** recheck attempts per finding, at most **1** full discovery
  restart.
- The reviewer is read-only and owns the verdict; `subreviewer` delegation may
  be used for cross-cutting or security-critical areas.

Findings are corrected as a normal iteration: fix root causes, run focused tests,
re-run the mechanical gate, recheck the batch, resume. Continue until every scope
is reviewed and no blocking finding is open.

## 6. Evidence, final verify, then tag

The promotion ordering is identical to a normal iteration and must not be
reordered:

```text
1. COMMIT EVIDENCE   commit .review/<iteration>/ (state, findings, evidence)
2. FINAL VERIFY      run ./scripts/verify.sh on the exact resulting HEAD
3. TAG               git tag -f known-good HEAD   (create the tag)
```

The final verification must run on the exact HEAD that the tag will point at,
which is why the evidence commit comes first. If the final verification fails,
treat it as a normal failure (section 13 of the development contract); the tag is
not created.

Only then does the candidate become the first known-good state:

```text
CANDIDATE (untrusted)  ->  KNOWN_GOOD (verified + reviewed)
```

## 7. Bootstrap checklist

- [ ] Confirmed no `known-good` tag exists.
- [ ] CANDIDATE identified (HEAD, or an explicit untrusted seed commit).
- [ ] `.agent-workflow/project.json` has a real non-empty `verifyCommand`.
- [ ] Mechanical verification passes on the candidate.
- [ ] Full initial review configured with scopes covering the whole candidate.
- [ ] All findings resolved; every scope `complete` or `not_applicable`.
- [ ] Review evidence committed under `.review/<iteration>/`.
- [ ] Final `./scripts/verify.sh` passes on the exact HEAD.
- [ ] `known-good` created at that exact HEAD.
- [ ] Compact bootstrap iteration summary recorded.
