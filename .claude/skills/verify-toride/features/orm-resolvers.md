# ORM resource resolvers

Applications wrap their native ORM with a Toride resolver to load the requested resource's attributes honestly.

## Sub-features

- `prisma-id` selects the requested row through `createPrismaResolver`.
- `drizzle-id` selects the requested row through `createDrizzleResolver` and a native column equality predicate.
- `missing` returns null for an absent row.
- `selection` preserves Prisma's selected fields without promising a complete record.

## How to get to it (user POV)

- Import `createPrismaResolver` from `@toride/prisma` and pass the native client and model name.
- Import `createDrizzleResolver` from `@toride/drizzle` and pass the native database and table.
- Invoke the resolver with `{type:'Document',id:<id>}` or supply it in the engine's resolver map.

## Driving it with verify-toride

Preconditions:

- Launch and Doctor completed, and this run has not driven `orm-resolvers` yet.
- The local Prisma client can generate and Python can execute parameterized SQLite queries.

- **Resolve two rows.** Run `scripts/verification/verify.sh drive orm-resolvers "$run_dir"`. Both helpers return row IDs `d02` and `d08` for those inputs. Each missing-row result is exactly null.
- **Select partial data.** The Prisma helper with `{select:{tenant:true}}` returns exactly `{tenant:'alpha'}` for `d02`.
- **Check the declaration.** Run `scripts/verification/verify.sh drive types-and-policy "$run_dir"`. The selected-helper consumer cannot assign an unselected optional `blocked` field to a required boolean.
- **Retain proof.** Read `orm-resolvers.json`, `orm-resolvers-sql.json`, and the drive log. The SQL must contain a real ID comparison, and every assertion must pass.

## Gotchas

- A plain object passed to native Drizzle `.where()` is not a native equality predicate. The callback sends SQL and parameters to SQLite without repairing the helper's query.
- Mapping `{}` to a missing row hides the difference between absent and partial data.
- Mocked query-builder calls do not establish that the resolver retrieves the requested ID.
