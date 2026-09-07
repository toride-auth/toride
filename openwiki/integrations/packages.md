# Integration packages and example

## Codegen

`@toride/codegen` (`packages/codegen/`) exposes `generateTypes` and the `toride-codegen` binary. It consumes the core policy model and generates action/resource/actor/role/permission/attribute/relation/resolver maps and a `TorideSchema`.

```bash
toride-codegen policy.yaml -o src/generated/policy.ts
# add --watch during policy authoring
```

Runtime behavior is tested in `src/generator.test.ts`; type changes should also be checked in generated examples and package type tests.

## Prisma

`@toride/prisma` (`packages/prisma/`) creates Prisma-compatible plain objects rather than importing Prisma at runtime. Configure relation mappings, role-assignment tables/fields, and virtual fields as needed. `createPrismaResolver()` expects a duck-typed client model with `findUnique({ where: { id } })`.

The normal sequence is `engine.buildConstraints()` → handle forbidden/unrestricted → `engine.translateConstraints(..., createPrismaAdapter())` → `prisma.model.findMany({ where })`. Tests live in `adapter.test.ts` and `__typetests__/`.

## Drizzle

`@toride/drizzle` (`packages/drizzle/`) creates a query-description object, not native SQL expressions. The consuming application owns the final translator/query builder for operations such as `eq`, `and`, `relation`, `hasRole`, and `like`. `field_contains` escapes `%`, `_`, and `\\` before applying a contains pattern. Resolver support is duck-typed around `db.select().from(table).where(condition)`.

The package declares `drizzle-orm >=0.29.0` as an optional peer dependency. Runtime and compile-time tests are in `adapter.test.ts` and `__typetests__/`.

## Prisma example application

`examples/prisma-app/` is the best executable integration map:

1. `pnpm install`
2. `pnpm codegen`
3. `pnpm prisma db push`
4. `pnpm prisma db seed`
5. `pnpm dev`

Key anchors are `policy.yaml`, `prisma/schema.prisma`, `prisma/seed.ts`, `src/engine.ts`, `src/db.ts`, and route files under `src/routes/`. The example uses `buildConstraints()` for list filtering and `can()` for mutation checks. Compare the dirty `src/routes/projects.tsx` against `git diff` before treating its current behavior as settled.

## Integration change guidance

Keep adapters structurally typed and core-independent of ORM runtimes. For adapter changes, update runtime translation tests, resolver tests, `tsd` tests, and the corresponding integration guide/example. If core constraint nodes change, update every adapter and the partial-evaluation tests together.
