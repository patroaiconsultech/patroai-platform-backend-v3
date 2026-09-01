# RC1.2 — Packaging Integrity Hardened

Baseline:
`patroai-platform-backend-v3-main (6).zip`

This RC1.2 does not change functional behavior relative to RC1.1.

Package contract:
- exactly 18 entries;
- 15 functional files;
- 3 metadata files;
- no nested ZIPs;
- no undeclared files;
- no writes to the package after final SHA-256 generation.

Do not upload this ZIP itself into the repository.
Apply the 15 functional files preserving paths.
