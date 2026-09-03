# PatroAI V3 — STAGING 008 — Local Terminal Auth Recovery V2

**State:** `PROPOSAL_ONLY / GITHUB_READY / NOT_DEPLOY_AUTHORIZED`  
**Reference platform:** `LINUX_POSIX`  
**Frozen source candidate SHA-256:** `f6b63678402fc16108e6bfaadebdbb5d82585765e03741518fa92fc09266b4d0`

This repository is an audit surface for the STAGING 008 Local Terminal Auth Recovery V2.
It is intentionally prepared for **branch + pull request + human review**, not direct deployment.

## What is proven locally

- V2 source candidate: frozen and hash-bound.
- Local fake-CLI suite: PASS_LOCAL in the embedded evidence.
- Final artifact integrity: PASS_EM_ARTEFATO in the embedded audit evidence.
- Frozen Phase A bytes are embedded and hash-bound.

## What is NOT proven

- Railway authentication/runtime behavior.
- `PASS_CHANNEL`.
- staging runtime.
- database state.
- migration 008.
- deploy or production.

## Repository rules

1. Upload to a **new protected branch**, never directly to the protected default branch.
2. Open a Pull Request.
3. Require human review.
4. Enable GitHub secret scanning / push protection where available.
5. Enable dependency/code scanning appropriate to the repository plan.
6. Do not enable auto-deploy from this branch or PR.
7. Any byte change invalidates the hashes and requires a new AO-01 candidate.

See `AUDIT_INDEX.md`, `governance/GITHUB_GATE.md`, and `governance/ROLLBACK.md`.
