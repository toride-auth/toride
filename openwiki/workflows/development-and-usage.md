# Development and usage workflows

## Build a runtime authorization path

The documented application flow is:

1. Define a YAML/JSON policy.
2. Load and validate it with the core policy APIs.
3. Create a `Toride` engine with an actor and resource schema.
4. Register resolvers for resource attributes and relations, or provide inline attributes.
5. Use `can`, `permittedActions`, `explain`, or batch checks at request boundaries.
6. For collection reads, call `buildConstraints` and translate the result through an ORM adapter.

Resolvers are deliberately data-source agnostic: in-memory objects, REST, GraphQL, files, and databases are all valid. Missing resolver attributes normally cause conditions to fail under default-deny behavior.

## Collection filtering

A safe list endpoint handles the constraint result explicitly:

```ts
const result = await engine.buildConstraints(actor, "read", "Project")
if (!result.ok) return []
if (result.constraint === null) return db.project.findMany()
const where = engine.translateConstraints(result.constraint, adapter)
return db.project.findMany({ where })
```

Do not treat `null` as denial: it means unrestricted access. Conversely, do not omit a concrete constraint, because that would bypass row-level authorization.

## Prisma example

`examples/prisma-app` is the best executable map of the intended integration. From the example directory:

```bash
pnpm install
pnpm codegen
pnpm prisma db push
pnpm prisma db seed
pnpm dev
```

The app demonstrates generated policy types, Prisma resolvers, project/task filtering, `permittedActions` for UI affordances, and `can` for mutations. `src/engine.ts` wires the engine and adapter; `src/routes/projects.tsx` shows collection filtering; `src/routes/tasks.tsx` shows mutation checks; `prisma/schema.prisma` and `prisma/seed.ts` define the sample data.

The seed is intended to be repeatable and recreates sample users/roles. The example is workspace-coupled through `workspace:*` dependencies, so it is primarily a checkout-level integration test rather than a standalone published app.

## Generated policy types

Run `toride-codegen <policy-file> -o <output-file>` (or add `--watch`). The output contains action/resource/actor unions, per-resource roles and permissions, attribute maps, relations, and resolver types. Change the source policy or generator, not the generated file.

## Change checklist

- Update the policy schema or parser when syntax changes.
- Update generated JSON Schema and generator snapshots when type output changes.
- Preserve server-side checks even when adding client snapshots.
- Test both unrestricted and denied partial-evaluation results.
- Keep ORM relation and role-assignment mappings aligned with the actual database schema.
