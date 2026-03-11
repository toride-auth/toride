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

## Conventional Commits

All commit messages in this repository MUST follow the [Conventional Commits](https://www.conventionalcommits.org/) format. A commitlint git hook enforces this — non-compliant messages will be rejected.

### Format

```
<type>[optional scope][optional !]: <description>

[optional body]

[optional footer(s)]
```

### Allowed Types

| Type | Description | Version Impact |
|------|-------------|----------------|
| `feat` | New feature | minor |
| `fix` | Bug fix | patch |
| `perf` | Performance improvement | patch |
| `refactor` | Code refactoring | patch |
| `docs` | Documentation only | patch |
| `test` | Adding/updating tests | patch |
| `chore` | Maintenance tasks | patch |
| `ci` | CI/CD changes | patch |
| `build` | Build system changes | patch |

### Allowed Scopes (optional)

`toride`, `codegen`, `drizzle`, `prisma`

When a change targets a specific package, use its scope. Omit the scope for cross-cutting or repo-wide changes.

### Breaking Changes

Two syntaxes (both trigger a **major** version bump):

1. Bang suffix: `feat!: redesign RelationResolver interface`
2. Footer: add `BREAKING CHANGE: description` in the commit body footer

### Rules

- The `<description>` MUST start with a lowercase letter
- The `<description>` MUST NOT end with a period
- Use imperative mood in the description (e.g., "add" not "added" or "adds")
- Keep the first line (type + scope + description) under 100 characters

### Examples

```
feat(drizzle): add query constraint builder
fix: resolve policy parsing edge case with nested relations
feat!: redesign RelationResolver interface
refactor(toride): extract evaluation pipeline into separate module
docs: update README with constraint builder examples
chore: update dependencies
```

<!-- MANUAL ADDITIONS END -->

## Active Technologies
- TypeScript (strict mode), Node.js 20+ LTS + valibot (schema validation), yaml (policy parsing), tsup (build), vitest (test) (improve-resolvers)
- N/A (in-process library, user provides data access) (improve-resolvers)
- TypeScript (strict mode), Node.js 20+ LTS + vitest ^2.0.0 (bench mode / tinybench), existing toride engine (performance-metrics)
- N/A (JSON artifacts stored as CI artifacts) (performance-metrics)
- TypeScript (strict mode), Node.js 20+ LTS; Bash for CI scripts + Lefthook (git hooks), @commitlint/cli + @commitlint/config-conventional (commit validation) (automate-release)
- N/A (file-based: CHANGELOG.md, package.json versions, git tags) (automate-release)
- TypeScript (strict mode), Node.js 20 LTS + Nx v22.x (`nx release`), `@nx/js` (new dev dependency), pnpm 10.x, GitHub Actions (automate-publish)
- TypeScript (VitePress config), Markdown (content), YAML (GitHub Actions) + VitePress 1.6.4 (standalone in `docs/`) (add-readme-and-official-site)
- N/A (static site generator, Markdown files) (add-readme-and-official-site)
- Markdown + TypeScript code snippets (must match `toride` package exports) + VitePress 1.6.4 (docs site), toride core package (API reference) (sync-docs)
- N/A (static Markdown files) (sync-docs)
- TypeScript (VitePress config), Markdown (content) + VitePress 1.6.4 (standalone in `docs/`) (main)
- TypeScript (strict mode), Node.js 20+ LTS + hono, htmx (CDN), @hono/node-server, prisma, @prisma/client, toride, @toride/prisma, tsx, yaml (add-example)
- SQLite via Prisma (file-based, zero external services) (add-example)
- TypeScript (strict mode), Node.js 20+ LTS + hono, @hono/node-server, toride (^0.1.0), @toride/prisma (^0.1.0), @prisma/client, prisma, tsx, yaml, htmx (CDN) (add-example)
- SQLite via Prisma (file-based, `prisma/dev.db`) (add-example)

## Recent Changes
- improve-resolvers: Added TypeScript (strict mode), Node.js 20+ LTS + valibot (schema validation), yaml (policy parsing), tsup (build), vitest (test)


<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

## General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax


<!-- nx configuration end-->
