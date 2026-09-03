# AUDIT INDEX

Use this document as the entry point for independent review.

## Primary implementation
- `payload/runner.py` — isolated single-HOME recovery runner.
- `payload/preflight.py` — file/ZIP integrity checks.
- `payload/fake_railway.py` — deterministic offline fake CLI.
- `payload/assemble_with_frozen.py` — fail-closed frozen-bundle assembler.
- `payload/entrypoint.sh` — local entrypoint.

## Tests and evidence
- `tests/test_v2.py` — local negative/positive test matrix.
- `evidence/LOCAL_TEST_RESULTS.json` — recorded local result from the frozen candidate.
- `MANIFEST.json` — candidate state and non-execution booleans.
- `SHA256SUMS.txt` — original candidate checksum index.

## Governance
- `docs/CONTRACT_PACK.md`
- `docs/GATE_RECORD.md`
- `docs/DIFF_PREVIEW.md`
- `docs/ROLLBACK_PLAN.md`
- `docs/FUTURE_SMOKE_PLAN.md`
- `docs/REAUDIT_STATUS.md`

## Frozen Phase A
Review the embedded file under `frozen/`. Its expected SHA is the canonical Phase A anchor already recorded in the contract pack.

## GitHub-only additions
- `governance/GITHUB_GATE.md`
- `governance/ROLLBACK.md`
- `governance/SECURITY_REQUIREMENTS.md`
- `SBOM.spdx.json`
- `scripts/verify_repository.py`

No GitHub-only file authorizes Railway, database, migration, deploy or production.
