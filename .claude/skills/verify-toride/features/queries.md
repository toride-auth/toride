# Exact authorization queries

Applications build authorization constraints, translate them into their ORM query, and apply that query before counting or paginating rows.

## Sub-features

- `membership-pages` preserves the authorized IDs, count, and ordered pages in both ORMs.
- `nullable` distinguishes a comparison from its complement at SQL null.
- `relations` compiles public related roles, identity, one and many relations, and same-row versus independent conditions.
- `strings` keeps prefix, suffix, and substring distinct with binary case semantics.
- `sentinels` distinguishes forbidden and unrestricted access.
- `unsupported` rejects custom and legacy role nodes before querying.

## How to get to it (user POV)

- Call `buildConstraints(actor, 'read', 'Document')` on the policy engine.
- Handle `{ok:false}` as forbidden and `{ok:true,constraint:null}` as unrestricted.
- Translate a constrained result with `translateConstraints(result.constraint, adapter)`.
- Apply Prisma's `where` or lower Drizzle's operation description into native predicates, then execute membership, count, and ordered pagination queries.

## Driving it with verify-toride

Preconditions:

- Launch and Doctor completed, and this run has not driven `queries` yet.
- The locked Prisma packages and adapter are installed, and Python can import `sqlite3`.
- The declared scalar and relation bindings describe the seeded database and resolver values. String certificates apply only to this verified local setup.

- **Query both ORMs.** Run `scripts/verification/verify.sh drive queries "$run_dir"`. The tenant and forbid fixture returns `['d02','d04','d05','d08']`, count `4`, first page `['d02','d04']`, second page `['d05','d08']`, and offset 3 page `['d08']`. Both databases execute the predicate before pagination.
- **Compare runtime.** The script calls public `can()` over every seeded resource. Each query case compares those decisions and both actual database routes with the hand-written expected IDs.
- **Exercise relations and null.** The related public role returns `['d01','d02','d05','d08']`. The same-row reviewer role returns `['d01','d05']`; independent reviewer leaf conditions return `['d01','d02','d05']`. The null title `exists:false` case returns `['d04']`.
- **Reject unsafe translation.** Each standard adapter rejects custom and legacy `has_role` nodes with `UnsupportedConstraintError`; its query event count does not change.
- **Retain proof.** Read `queries.json`, `queries-translations.json`, `queries-sql.json`, and `queries-fixture.json`. Require all checks and exit code 0.

## Gotchas

- An application postfilter cannot prove exact counts or pages.
- Unknown custom predicates and field-to-field expressions require explicit unsupported handling when no exact lowering exists.
- A relation with a true child still requires a related row to exist. Many-row conjunctions retain their intended scopes.
- Prisma's local string certificate requires binary case-sensitive LIKE behavior. It does not establish compatibility with another provider or collation.
- Drizzle descriptions require an exhaustive consumer translator. Unrecognized operations throw instead of becoming true.
