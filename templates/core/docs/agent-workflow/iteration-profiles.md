# Iteration Profiles

Operational mechanics for the two iteration profiles, `NORMAL` and `QUICKFIX`.
Normative invariants live in `docs/agent-workflow/DEVELOPMENT_CONTRACT.md`; this
document describes how the orchestrator runs them. When the two disagree, the
development contract governs.

Project configuration (`.agent-workflow/project.json`) supplies the verification
commands and, optionally, the `scopeDocument` that defines what is in scope.

## 1. Choosing a profile

The default is always `NORMAL`.

```text
ITERATION_PROFILE=NORMAL     default
ITERATION_PROFILE=QUICKFIX   narrow human-directed correction, human-approved
```

The orchestrator may **propose** QUICKFIX. The human must **approve** it. The
human may also invoke QUICKFIX explicitly. When uncertain, use NORMAL.

## 2. NORMAL profile

```text
HUMAN REQUEST
      │
      ▼
ORCHESTRATOR
      │
      ▼
PLAN / DAG
      │
      ▼
DELEGATED WORKTREES
      │
      ▼
CONTROLLED INTEGRATION
      │
      ▼
FOCUSED TESTS
      │
      ▼
VERIFY (./scripts/verify.sh)
      │
      ▼
REVIEW SESSION
      ├── DISCOVERY
      ├── RECHECK
      └── RESUME
      │
      ▼
COMMIT EVIDENCE (.review/<iteration>/)
      │
      ▼
FINAL VERIFY (exact HEAD)
      │
      ▼
PROMOTE (tag known-good)
      │
      ▼
NEW KNOWN-GOOD
```

NORMAL follows the full delegation model in
`docs/agent-workflow/orchestration.md`: DAG, isolated worktrees, background
workers where useful, controlled integration, and a full review session.

## 3. QUICKFIX profile

QUICKFIX exists for narrow human-directed corrections. It is not a shortcut past
verification or review; it is a bounded path with a human checkpoint.

### 3.1 Eligibility

QUICKFIX requires all of:

- known narrow scope;
- clear expected behavior;
- small/local expected diff;
- no architecture change;
- no substantial schema migration;
- no security-boundary change;
- no public-contract change;
- no new feature.

Eligible examples: layout defect, incorrect copy, small UI behavior, localized
validation bug, small deterministic regression.

Non-examples: new auth method, new database model, cross-cutting refactor,
permissions redesign, new contract behavior, large migration.

When uncertain: `NORMAL`.

### 3.2 Lifecycle

```text
HUMAN REQUEST
      │
      ▼
ORCHESTRATOR
      │
      ▼
propose QUICKFIX
      │
      ▼
HUMAN APPROVES PROFILE
      │
      ▼
create one bounded task
      │
      ▼
create worktree (explicit base)
      │
      ▼
delegate worker
      │
      ▼
reproduce
      │
      ▼
minimal fix
      │
      ▼
focused tests
      │
      ▼
HUMAN CHECKPOINT
   /             \
REJECT           ACCEPT
  │                 │
  ▼                 ▼
continue same    integrate
child session       │
                    ▼
              TARGETED REVIEW
                    │
              corrections if needed
                    │
                    ▼
              COMMIT EVIDENCE
                    │
                    ▼
              FINAL VERIFY (exact HEAD)
                    │
                    ▼
                 PROMOTE
```

### 3.3 Human checkpoint

Before integration, present:

- summary;
- diff;
- focused-test evidence;
- visual evidence when applicable (screenshots, rendered UI, responsive states,
  terminal output).

The checkpoint answers: *"Does this correction satisfy the human-requested
behavior?"* It does **not** replace security gates, project-specific approval
gates, verification, or review.

On `REJECT`, continue the **same child session** with the human's feedback. Do
not restart from zero.

### 3.4 Promotion

After human acceptance **and** `TARGETED REVIEW PASSED`, the orchestrator
commits the review evidence, runs the final `./scripts/verify.sh` on the exact
resulting HEAD, and only then may promote by moving `known-good`. No second human
confirmation is required merely to move the tag. Existing gates for irreversible
or explicitly human-authorized actions are unchanged.

The evidence commit must precede the final verification, so the tag points at a
commit that actually passed the gate.

## 4. TARGETED review mode

TARGETED is a bounded reviewer mode for QUICKFIX diffs. It is added to the
existing modes:

```text
DISCOVERY | RECHECK | RESUME | TARGETED
```

TARGETED examines the quickfix diff, directly affected behavior, and immediately
adjacent effects. It must not become repository-wide DISCOVERY. The reviewer
remains independent and may produce blocking findings; corrections follow
targeted recheck semantics. If review reveals the change is not actually bounded:

```text
STOP QUICKFIX → request escalation to NORMAL
```

Only the reviewer lead issues the verdict, in TARGETED as in every other mode.

## 5. Escalation to NORMAL

If QUICKFIX reveals any of:

- unexpected cross-cutting impact;
- architecture change;
- schema implications;
- security implications;
- large diff;
- multiple independent root causes;
- public interface change;
- significant unrelated cleanup;

then:

```text
QUICKFIX
    │
    ▼
STOP
    │
    ▼
report evidence
    │
    ▼
ask human: upgrade to NORMAL?
```

The orchestrator MUST NOT silently upgrade. Human approval is required. After
approval, preserve useful worker state where safe rather than discarding it
unnecessarily.

## 6. Final ordering (mandatory)

```text
human acceptance
      ↓
integration
      ↓
targeted review
      ↓
review-derived corrections
      ↓
commit review evidence (.review/<iteration>/)
      ↓
FINAL ./scripts/verify.sh on the exact final HEAD
      ↓
promotion (tag known-good)
```

Focused tests do not replace the final mechanical gate. The exact HEAD being
promoted must pass `./scripts/verify.sh`.

## 7. Human gates

QUICKFIX never bypasses the project's existing human approval gates for
irreversible actions. A quickfix that would touch an irreversible action, a
security boundary, or a frozen contract is out of eligibility by definition and
must escalate. The project's `scopeDocument` and configuration name those gates;
the orchestrator must not invent, weaken, or skip them.
