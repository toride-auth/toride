# toride Development Guidelines

## Monorepo Overview

This is a pnpm monorepo managed with Nx for build orchestration and caching. It contains 4 packages:

| Package | Name | Tag | Description |
|---------|------|-----|-------------|
| `packages/toride` | `toride` | `type:core` | Relation-aware authorization engine for TypeScript |
| `packages/codegen` | `@toride/codegen` | `type:codegen` | Code generation tools for Toride authorization engine |
| `packages/drizzle` | `@toride/drizzle` | `type:integration` | Drizzle ORM integration for Toride authorization engine |
| `packages/prisma` | `@toride/prisma` | `type:integration` | Prisma integration for Toride authorization engine |

## Dependency Graph

```
toride (core)
├── @toride/codegen   (depends on toride)
├── @toride/drizzle   (depends on toride)
└── @toride/prisma    (depends on toride)
```

`toride` is the core package. All other packages depend on it. Changes to `toride` affect all downstream packages.

## Nx Commands for Discovery

```bash
# List all packages in the monorepo
pnpm exec nx show projects

# Show details for a specific package (targets, tags, dependencies)
pnpm exec nx show project <name>
# Example: pnpm exec nx show project @toride/drizzle

# Visualize the dependency graph (outputs JSON)
pnpm exec nx graph --file=output.json
```

## Build / Test / Lint Commands

### Run across all packages (from repo root)

```bash
pnpm run build    # nx run-many -t build (respects dependency order)
pnpm run test     # nx run-many -t test
pnpm run lint     # nx run-many -t lint
```

### Run for a specific package

```bash
pnpm exec nx run <package>:build
pnpm exec nx run <package>:test
pnpm exec nx run <package>:lint
# Example: pnpm exec nx run @toride/drizzle:test
```

### Run only for affected packages (based on git changes)

```bash
pnpm exec nx affected -t build
pnpm exec nx affected -t test
pnpm exec nx affected -t lint
```

## Technologies

- **Language**: TypeScript (strict mode), Node.js 20+ (current LTS)
- **Build**: tsup
- **Test**: vitest
- **Lint**: tsc --noEmit
- **Package Manager**: pnpm 10.x
- **Monorepo Orchestration**: Nx v22.x (local cache, no Nx Cloud)

## Code Style

TypeScript strict mode. Follow standard conventions. Each package has its own `build`, `test`, and `lint` scripts in its `package.json`.

## Nx Caching

Nx caches `build`, `test`, and `lint` targets locally (`.nx/cache`). Repeated runs with no source changes are instant cache hits. Cache inputs are configured in `nx.json`:
- **build**: uses `production` inputs (excludes test files)
- **test/lint**: uses `default` inputs (all project files)

## Monorepo Conventions

- All packages live under `packages/`
- Package tags are defined in each `package.json` under `"nx": { "tags": [...] }`
- No `project.json` files -- Nx infers targets from `package.json` scripts
- Dependencies are declared via `"workspace:*"` in `package.json`

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->

## Active Technologies
- TypeScript (strict mode), Node.js 20+ LTS + valibot (schema validation), yaml (policy parsing), tsup (build), vitest (test) (improve-resolvers)
- N/A (in-process library, user provides data access) (improve-resolvers)

## Recent Changes
- improve-resolvers: Added TypeScript (strict mode), Node.js 20+ LTS + valibot (schema validation), yaml (policy parsing), tsup (build), vitest (test)
