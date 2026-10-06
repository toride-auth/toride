---
name: verify-toride
description: Drive Toride's built public ESM library, policy and codegen CLIs, generated consumer declarations, and real local Prisma and Drizzle SQLite queries. Use after authorization, query, resolver, type, or policy changes to preserve executable proof.
---

# Verify Toride

Read [the feature index](features/README.md), then select the changed public entry points. Every helper invocation below runs from the repository root. The primary product is a library, so verification starts fresh Node processes and needs no application server or port.

## Launch

Use Node 20 or later, pnpm 10.30.3, and Python 3 with `sqlite3`. Install the frozen workspace dependencies before the first run.

```bash
pnpm install --frozen-lockfile --ignore-scripts
run_dir="$(scripts/verification/verify.sh launch /tmp/toride-verification-evidence)"
```

Launch builds `toride`, `@toride/prisma`, `@toride/drizzle`, and `@toride/codegen` through Nx. It writes the absolute evidence directory to stdout only after the build succeeds. Build output stays in `launch-build.log`. The build changes shared `dist` directories, so one owner runs builds while a proof is active. Separate launched runs own separate scratch directories, generated Prisma clients, and database files.

Launch creates a unique `/tmp/toride-verify-*` directory with an ownership token. It copies the verification programs there and links installed packages into a consumer's `node_modules`. Programs import published ESM package names. They never import source modules. Cleanup removes that scratch directory and retains the evidence directory.

Prisma uses the example's locked `prisma` and `@prisma/client` 6.19.2 plus `@prisma/adapter-libsql` 6.19.2. The isolated schema has `engineType = "client"`; its config uses `engine: 'js'` and the experimental adapter option. This avoids provisioning a native schema engine, which returned HTTP 403 in the recorded setup investigation. It does not disable checksum checks. The adapter connects only to a run-owned `file:` URL. After fixture writes, the drive enables case-sensitive LIKE and proves same-case `1` and different-case `0` on the read connection. LibSQL transactions replace that connection, so this certificate covers the ensuing read-only verification. Drizzle's `sqlite-proxy` executes parameterized SQL through Python's local `sqlite3`, with no additional npm driver.

## Doctor

```bash
scripts/verification/verify.sh doctor "$run_dir"
```

Require `READY` and exit code 0. Doctor verifies the ownership token, Git HEAD, working diff, source hashes, and built artifact hashes against Launch. It imports all four public packages and `toride/client`, checks the exported entry points, imports both local database paths, and reads SQLite's version. It writes `doctor.json`, the command, and the transcript.

Run Doctor before each drive and after any failed drive. Every drive also calls Doctor. A changed source file or build requires a fresh Launch. A cleaned run cannot be driven again.

## Drive

Drive the feature names listed in the index.

```bash
scripts/verification/verify.sh drive decisions "$run_dir"
scripts/verification/verify.sh drive fields-batch-client "$run_dir"
scripts/verification/verify.sh drive queries "$run_dir"
scripts/verification/verify.sh drive orm-resolvers "$run_dir"
scripts/verification/verify.sh drive types-and-policy "$run_dir"
```

Each drive exits 0 only when all its assertions pass. It writes its inputs and literal expected results before executing each case, then records the result or failure. A failed assertion does not erase previous cases. Query and resolver drives create their own database files, insert the declared fixture, verify its stored values, and disconnect Prisma in `finally`. Run a database feature once per Launch; a repeat requires fresh scratch state.

The shorter command runs Launch, Doctor, the selected drive, Cleanup, and Evidence. It always tears down its scratch directory after a failed drive.

```bash
scripts/verification/verify.sh check decisions /tmp/toride-verification-evidence
scripts/verification/verify.sh check all /tmp/toride-verification-evidence
```

## Evidence

```bash
scripts/verification/verify.sh evidence "$run_dir"
```

Read `evidence.json` and the selected feature's JSON and log. A proof needs the public action, input policy and data, literal expected result, actual result, command, and exit code. `identity.json` records Git HEAD, the working diff hash, and SHA-256 hashes of source and built files. Retain the failing baseline and its identity when verifying a repair.

SQL proof includes `queries-fixture.json`, `queries-translations.json`, and `queries-sql.json`. Require both ORM routes to match the hand-written authorized IDs and the database's count and ordered pages. Authorization applies in SQL before `skip`, `take`, `limit`, or `offset`; no application postfilter establishes exact pages. Unsupported nodes must throw `UnsupportedConstraintError` before a database query. Record unsupported checks separately from successful query equivalence.

An unavailable actor or environment operand on a traversed resource path requires explicit rejection when relevant to the query. Null one relations and empty many traversals have different runtime outcomes. Related ID checks require an observed resource row, in either rule order.

Type proof includes generated files, each consumer fixture, compiler diagnostics, and CLI transcripts. A valid consumer must compile. Each negative fixture must fail compilation. Passing only the negative fixtures could conceal a broken dependency or declaration.

The evidence directory is a local artifact. No command sends messages, contacts authorization services, opens accounts, or writes an application database. Package installation contacts the package registry. Launch writes built files in this checkout. Drives write their owned temporary clients and databases.

## Cleanup

After the last drive, and after every failed attempt, run Cleanup. Then capture Evidence so its hashes describe the retained files.

```bash
scripts/verification/verify.sh cleanup "$run_dir"
scripts/verification/verify.sh evidence "$run_dir"
test -f "$run_dir/identity.json"
test -f "$run_dir/evidence.json"
```

Cleanup requires the matching checkout, temporary path prefix, and ownership token before deletion. It removes only the run's scratch directory. It is safe to repeat. Child commands are short-lived; Prisma disconnects before the drive exits. The wrapper never kills by process name. `cleanup.json` confirms scratch removal and lists retained files. Logs, JSON results, generated consumer sources, and failures survive cleanup.

## Helpers

Invoke the executable `scripts/verification/verify.sh`; the commands above cover every public helper operation. In that directory, `run.mjs` owns lifecycle and identity, `doctor.mjs` checks readiness, `runtime.mjs` drives decisions and fields, `queries.mjs` drives both ORMs and their resolvers, and `types.mjs` drives CLIs and declarations. `fixtures.mjs`, `support.mjs`, and `sqlite.py` support those commands. `examples/prisma-app/verification/database.mjs`, `schema.prisma`, and `prisma.config.ts` own local Prisma setup. `packages/drizzle/verification/database.mjs` owns the native SQL consumer and Python callback.

For later API changes, run `/maintain-verification-skill` to check the index, read each feature's source entry points, and drive every feature again. Correct the map or scripts when they drift; preserve product regressions as failures.
