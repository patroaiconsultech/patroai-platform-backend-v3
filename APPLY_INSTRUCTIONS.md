# PatroAI Platform — Backend Premium RC patch

Contains only complete new/modified files plus explicit removals.

Application order:
1. Confirm exact official repository, branch, source commit and deployed commit.
2. Apply complete files preserving paths.
3. Remove only paths listed in REMOVALS.json.
4. Run all build/test/runtime gates.
5. Stop on deterministic failure.
6. Independent audit before merge/deploy.

commit_executed=false
merge_executed=false
deploy_executed=false
migration_executed=false
