# Policy and query workflows

## Policy loading and validation

The CLI accepts YAML or JSON, normalizes shorthand attribute schemas, validates structure with Valibot, and reports logical paths through `ValidationError` (`packages/toride/src/cli.ts`). Policy modules are separated into parser, schema, semantic validator, strict validator, and merger. Semantic checks include actor attribute references; strict validation additionally detects unused roles, unreachable rules, and redundant derivations.

The generated JSON Schema at `packages/toride/schema/policy.schema.json` supports editor/IDE authoring and is regenerated during the core build.

## Request authorization

A typical request configures a `Toride` engine with the policy and resource resolvers, then calls `can()` before a mutation or protected operation. Use `explain()` when diagnostics or audit context are needed. `resolvedRoles()`, `permittedActions()`, and `canBatch()` share the same evaluation model and resolver cache.

For a list endpoint, do not fetch all rows and call `can()` one by one. Call `buildConstraints(actor, action, resourceType, context)`, handle `{ ok: false }` and `{ ok: true, constraint: null }`, then translate a non-null constraint through an adapter and pass the result to the database query.

## Constraint translation

The core emits a database-neutral AST. Prisma translates it to a plain `where` object. Drizzle emits an intermediate `_op` description that the application must translate into actual Drizzle predicates. Adapters need explicit behavior for leaves, relation joins, role subqueries, unknown/custom nodes, and boolean composition.

The result shape was simplified in `29af9d3`; preserve explicit branching when modifying this workflow. Deep generic narrowing added in `d0800c6` means runtime and type-level contracts must evolve together.

## Policy-to-types workflow

When a policy-derived schema is part of the application API:

```text
policy.yaml → toride-codegen policy.yaml -o src/generated/policy.ts → typed TorideSchema/engine usage
```

The code generator accepts YAML or JSON and supports `--watch`. The Prisma example runs this as `pnpm codegen` and consumes the generated bindings from `src/generated/`.

## Client permission workflow

For UI hints, evaluate a set of resources with `snapshot()`, send the `{ "Type:id": ["action"] }` map to the client, and use the separate `client` entrypoint for synchronous checks. This is a hint/UX synchronization mechanism, not a replacement for server-side authorization.

## Policy change checklist

1. Update policy types/schema/parser and semantic validation as needed.
2. Add focused runtime tests and `tsd` coverage for public generic changes.
3. Regenerate `policy.schema.json` and snapshots.
4. Update codegen output/tests and integration examples if generated types change.
5. Update `docs/concepts/` for user-visible language changes.
6. Run package and repository checks described in [operations/testing](../operations/testing.md).
