# ORM integrations and code generation

## `@toride/codegen`

`packages/codegen/src/generator.ts` converts a validated policy into TypeScript declarations implementing `TorideSchema`. It emits literal unions and maps for actions, resources, actors, roles, permissions, attributes, relations, and typed resolvers. Nested objects and arrays are converted recursively; unsafe TypeScript identifiers are rejected.

The CLI in `packages/codegen/src/cli.ts` loads JSON with `loadJson` and other files with `loadYaml`, writes the requested output, and supports debounced `--watch` regeneration. `generator.test.ts` is the primary behavior contract.

## `@toride/prisma`

`createPrismaAdapter` emits ordinary Prisma-compatible `where` objects, without requiring `@prisma/client` at runtime. It maps comparisons, membership, nullability, arrays, strings, logical operators, relations, and role checks. Configure relation mappings, role-assignment table/field names, and virtual fields when policy paths differ from Prisma model paths.

`createPrismaResolver` wraps `findUnique({ where: { id } })` and accepts an optional `select`. Select only the attributes needed for policy evaluation when possible. The generated relation and role-assignment paths must match the Prisma schema.

## `@toride/drizzle`

`createDrizzleAdapter` emits descriptive query objects with `_op` markers (`eq`, `and`, `or`, `relation`, `hasRole`, and others), rather than calling Drizzle operators directly. The application owns the final conversion to Drizzle expressions, which makes the adapter flexible but adds an integration layer.

`createDrizzleResolver` uses a duck-typed `select().from().where()` database interface and supports a custom ID column. Drizzle remains an optional peer dependency by design.

## Extension boundary

Both adapters implement the core `ConstraintAdapter` abstraction. If a new data layer is needed, add a translator and tests for each constraint kind; do not put ORM-specific behavior into `partial/constraint-builder.ts`. Resolver helpers and constraint translators are separate concerns.

## Verification points

- Codegen: `packages/codegen/src/generator.test.ts` and generated type tests.
- Prisma: `packages/prisma/src/adapter.test.ts` and `src/__typetests__/`.
- Drizzle: `packages/drizzle/src/adapter.test.ts` and `src/__typetests__/`.
- Cross-package behavior: core partial-evaluation integration tests and the Prisma example.
