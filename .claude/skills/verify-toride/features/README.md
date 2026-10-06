# Toride verification map

This index is the maintained source for Toride's public verification routes. Read it before selecting a drive.

## Baseline preconditions

- Install the frozen dependencies and complete Launch from [verify-toride](../SKILL.md).
- Require Doctor to report `READY` for the exact source and built files being verified.
- Use the run-owned generated Prisma client and database URLs. The example's `prisma/dev.db` is never a verification target.
- Keep builds under one owner. Each drive starts a fresh Node process, and each database feature owns a separate SQLite file.

## Driving conventions

- Run `scripts/verification/verify.sh drive <feature> "$run_dir"` from the repository root.
- Inputs, fixture rows, expected values, commands, and failures go into the retained evidence directory.
- Run each database feature once per Launch. Use a fresh Launch after edits, rebuilds, or a failed database attempt.
- Run Cleanup after failure and after the final drive, then Evidence. Require the evidence files to survive.

## Proof and skip reporting

A passing route cannot substitute for another listed route. A proof of `can()` does not prove `canBatch()`. A Prisma query does not prove the Drizzle consumer path. A mock-only helper test does not prove an ORM resolver. Report an unrun route with its unmet prerequisite and attempted command. Do not mark it covered by a different feature.

## Features

- [Decisions](decisions.md) drives `can`, `explain`, `resolvedRoles`, and `permittedActions`.
- [Queries](queries.md) drives `buildConstraints`, public translation, and both ORM membership, count, and pagination routes.
- [ORM resolvers](orm-resolvers.md) drives both helpers on actual rows, missing rows, and selected data.
- [Types and policy](types-and-policy.md) drives policy and codegen CLIs and compiled public consumers.
- [Fields, batch, and client](fields-batch-client.md) drives field checks, both batch input orders, snapshots, and `toride/client`.
