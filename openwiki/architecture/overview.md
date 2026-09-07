# Architecture overview

## Workspace shape

The root is a private pnpm/Nx workspace (`package.json`, `pnpm-workspace.yaml`). TypeScript project references cover the four published packages. Nx infers package projects from their manifests; `build` uses upstream `^build` dependencies, and test/lint targets are coordinated across the graph (`nx.json`). Packages compile with strict ESM TypeScript and emit `dist/` artifacts and declarations.

## Package boundaries

### Core runtime

`packages/toride/src/index.ts` is the public façade. `engine.ts` owns policy and resolver configuration and exposes authorization, explanation, batching, field checks, snapshots, and constraint translation. Supporting areas have clear seams:

- `policy/` parses YAML/JSON, validates schemas and semantics, and merges policy fragments.
- `evaluation/` resolves roles, evaluates conditions/rules, caches resolver calls, and detects cycles/depth limits.
- `partial/` builds/simplifies a constraint AST and translates it through an adapter.
- `field-access.ts` handles field operations separately from resource-level checks.
- `snapshot.ts` produces client-consumable permission maps.
- `client.ts` is a narrow runtime-independent entrypoint that consumes a snapshot.
- `cli.ts` validates policies and runs policy test files.

The core depends at runtime on `valibot` and `yaml`; it does not depend on an ORM.

### Downstream packages

`@toride/codegen` consumes core policy/schema types and generates action/resource/role/relation/resolver maps plus a `TorideSchema`. `@toride/prisma` and `@toride/drizzle` consume the core constraint AST; they do not own authorization semantics. This keeps the core database-agnostic and makes adapters responsible for persistence-specific translation.

Dependency direction is therefore:

```text
policy file → toride core → constraint AST → Prisma/Drizzle adapter
                         ├→ codegen TypeScript bindings
                         ├→ permission snapshot → client
                         └→ can()/explain() → application request path
```

## Build and public API implications

Consumers resolve package `dist` exports, not source. `toride` publishes the core and `./client` entrypoints plus the `toride` CLI; codegen publishes `toride-codegen`; integrations are libraries. The core build also regenerates `packages/toride/schema/policy.schema.json`; CI checks that generated schema is clean.

The broad core façade exports policy internals and testing utilities as well as the main engine. Treat changes to public types, constraint result shapes, generated declarations, and schema output as compatibility work—not an implementation-only refactor.

## Why the current structure exists

Git history shows a deliberate layering progression: the monorepo began in `a8f7f10`, role derivation and rule semantics were added in `52d5e9d` and `b70bd19`, database query support in `f3a7571`, client/field features in `9c10614`/`7fc95e2`, and type-safe package boundaries in `bef985c` and `d0800c6`. The latest API simplification (`29af9d3`) changed partial evaluation to an explicit `{ ok, constraint }` result, so callers must handle access and unrestricted cases before translation.

## Change watch-outs

- Preserve the core-first build dependency direction.
- Update runtime tests, `tsd` tests, generated schema snapshots, and integration docs when changing public types.
- Do not put ORM-specific behavior into `toride`; extend an adapter instead.
- Keep `client` safe to ship independently of server-side resolver/database code.
