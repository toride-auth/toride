# Operations and testing

## Local commands

```bash
pnpm install --frozen-lockfile
pnpm run lint
pnpm run test
pnpm run build
```

Root scripts delegate to Nx. For focused work, use the package scripts or Nx targets, for example:

```bash
pnpm --filter toride test
pnpm --filter toride typetest
pnpm exec nx run @toride/prisma:test
pnpm exec nx run @toride/drizzle:typetest
pnpm exec nx run @toride/codegen:build
```

The Vitest workspace covers all four packages (`vitest.workspace.ts`). Runtime tests are colocated with source; `__typetests__/` uses `tsd`-style compile-time assertions and is especially important because recent releases emphasize deep per-resource type narrowing.

## CI and generated artifacts

`.github/workflows/ci.yml` installs with the frozen lockfile and runs affected Nx lint/test/build targets. It also checks that `packages/toride/schema/policy.schema.json` has no uncommitted generation diff. When changing policy schema or generator behavior, build before committing and inspect schema/snapshot diffs.

The current working tree has substantial deletions under legacy workflow/dev-container tooling, as well as modifications to `.dockerignore`, `CLAUDE.md`, and the Prisma example. Keep those unrelated changes separate from runtime changes and use `git diff` to establish the active baseline.

## Release and deployment

`.github/workflows/publish.yml` publishes on `v*` tags in dependency order: `toride`, codegen, Drizzle, then Prisma, followed by a GitHub release from `CHANGELOG.md`. Docs deployment is handled by `.github/workflows/deploy-docs.yml`. The repository also contains an OpenWiki update workflow; generated wiki pages belong under `openwiki/`.

## Change-oriented checks

- **Engine/evaluation:** run core runtime, integration, cycle/depth, explanation, and fail-closed tests.
- **Policy/schema:** run parser, schema, validator, merger, CLI tests; regenerate JSON Schema.
- **Partial evaluation:** test AST construction, simplification, translation, and every adapter.
- **Public types:** run core and integration type tests plus builds/declaration generation.
- **Codegen:** run generator tests and verify generated policy bindings.
- **Example/integration:** run the Prisma example setup when changing resolver, adapter, or generated API wiring.

At minimum, preserve tests for unknown resources, missing grants/attributes/environment, resolver exceptions, cycle/depth limits, matching forbids, `{ ok: false }`, and unrestricted `{ ok: true, constraint: null }` outcomes.

## Git/history notes

Use recent history to understand intent rather than treating all source as equally stable. High-signal milestones include `29af9d3` (simplified constraint API), `d0800c6` (deep type safety), `0612f63` (typed Prisma virtual fields), `c8d83da` (v0.4.0 release), and `d236e71` (cleanup). Public signatures and generated artifacts are likely compatibility boundaries.
