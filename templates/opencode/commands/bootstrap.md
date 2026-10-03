---
description: Bootstrap the first known-good when the repository has no baseline.
agent: orchestrator
---

Requested work (bootstrap, no known-good yet):

$ARGUMENTS

There is no trusted baseline. Follow `docs/agent-workflow/bootstrap.md` exactly.

1. Confirm `known-good` does not exist. If it does, stop and use the normal
   iteration lifecycle instead.
2. Identify the untrusted candidate: `HEAD`, or an explicit seed commit you
   create if the repository has no commits. Do not claim the empty repository or
   the seed is trusted, and do not create `known-good` yet.
3. Ensure `.agent-workflow/project.json` has a real, non-empty `verifyCommand`.
   Without a mechanical gate, the candidate cannot be promoted.
4. Run the mechanical gate on the candidate, then a full initial review over the
   whole candidate against the empty tree, with scopes covering the candidate.
   Corrections follow the normal batched review rules (max 3 blockers per batch,
   max 2 rechecks per finding, max 1 full discovery restart).
5. When the session is complete, commit the review evidence under `.review/`,
   run the final `./scripts/verify.sh` on the exact resulting HEAD, and only then
   create `known-good` at that HEAD.

Never create or move `known-good` merely because tests pass.
