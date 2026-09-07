# Release and maintenance

## CI and generated artifacts

The main CI workflow runs on pushes to `main` and pull requests. It uses Node 20, frozen pnpm dependencies, and Nx affected targets. Policy JSON Schema drift is explicitly rejected, so schema-producing source changes require regeneration.

Docs deploy from `main` through `.github/workflows/deploy-docs.yml`; pull requests do not publish the VitePress site. Benchmark checks run separately for pull requests and compare against the main branch baseline.

## Publishing

`.github/workflows/publish.yml` is tag-driven (`v*`). It builds all packages, publishes `toride` before codegen/Drizzle/Prisma, extracts release notes from `CHANGELOG.md`, and creates a GitHub release. Version consistency and successful build output matter because dependent packages publish after core. The workflow uses `NPM_TOKEN`; never document or expose its value.

## Development environment

The repository has recently moved from `.devcontainer` to `.worktree` multi-stage development-container files. The current working tree also contains deletions of several historical automation directories (`.fdsx`, `.specify`, `.takt`) and obsolete helpers. Treat those deletions as working-tree context, not as runtime package behavior. Current source of truth is the checked-out tree plus git history.

## History signals

Recent high-signal changes explain current maintenance priorities:

- `0.2.0`: generic schema type safety and default resolvers.
- `0.3.0`: deep per-resource narrowing and breaking constraint/type changes.
- `0.4.0`: `ok`-based constraints, nested/array schemas, JSON Schema/IDE support, virtual fields, and the Prisma example.
- Recent cleanup: removal of unused code and obsolete helper files.

When investigating why an API looks unusual, inspect the relevant feature specs under `specs/` and the focused history for the source file rather than relying on old documentation examples. The changelog and package version can lag later repository maintenance commits.

## Operational checklist for changes

1. Keep the lockfile synchronized with package changes.
2. Run focused package tests and type tests.
3. Regenerate policy schema and generated declarations where applicable.
4. Run affected lint/test/build, then the full checks for release work.
5. Check benchmark impact for evaluation or constraint changes.
6. Update `docs/` when public behavior changes; docs deploy only after merge.
