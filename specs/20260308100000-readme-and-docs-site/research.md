# Research: README and Official Documentation Site

**Date**: 2026-03-08

## R1: VitePress Version Selection

**Decision**: VitePress 1.6.4 (latest stable)

**Rationale**: VitePress 2.0 is still in alpha (2.0.0-alpha.16). The 1.x line is mature, well-documented, and stable for production use. Version 1.6.4 includes built-in local search, dark mode, responsive layout, and all features required by the spec.

**Alternatives considered**:
- VitePress 2.0.0-alpha.16: Too unstable for a production docs site. Breaking changes expected.

## R2: Docs Directory Structure

**Decision**: Standalone `docs/` directory at repo root with its own `package.json`

**Rationale**: Keeps VitePress dependencies isolated from the monorepo's packages. The CI workflow installs docs deps separately. The `docs/` directory is not a formal Nx project — VitePress has its own dev server and build pipeline.

**Alternatives considered**:
- Root devDependency: Mixes docs tooling with library tooling. Unnecessary coupling.
- Nx project under `packages/docs`: Over-engineering. VitePress doesn't need Nx orchestration.

## R3: GitHub Pages Deployment Method

**Decision**: `actions/deploy-pages@v4` with `actions/upload-pages-artifact@v3`

**Rationale**: Modern GitHub-recommended approach. Uses the Pages environment with artifact upload. Cleaner than force-pushing to a `gh-pages` branch. VitePress official docs recommend this exact pattern.

**Alternatives considered**:
- Push to `gh-pages` branch: Legacy approach. Requires force-push permissions and leaves deployment artifacts in git history.

## R4: Base Path Configuration

**Decision**: Set VitePress `base` to `'/toride/'`

**Rationale**: Required for GitHub Pages project sites deployed at `toride-auth.github.io/toride`. Without this, asset paths and navigation links break.

## R5: VitePress Theme and Branding

**Decision**: Use VitePress default theme with no custom branding

**Rationale**: User preference. The default theme provides dark mode, responsive layout, search, and sidebar navigation out of the box — all required by the spec.

## R6: Code Examples Strategy

**Decision**: Write fresh examples for all documentation

**Rationale**: User preference. Fresh examples ensure documentation is tailored, self-contained, and not coupled to internal spec artifacts. Examples will be based on the actual API surface from `packages/toride/src/index.ts`.

## R7: Path-Filtered Deployment Workflow

**Decision**: Use `paths` filter on the push trigger to only run on `docs/**` changes, plus `workflow_dispatch` for manual rebuilds

**Rationale**: Spec requirement (FR-014). Avoids unnecessary deployments on source-only changes. The existing CI workflow does not cover docs — this is a new, separate workflow.

## R8: Node.js Version for Docs Build

**Decision**: Node.js 20 (matches existing CI)

**Rationale**: The monorepo already uses Node.js 20 in CI. VitePress 1.6.4 does not specify an explicit engines field but works with Node.js 18+. Using 20 keeps consistency.

## R9: Package Manager for Docs

**Decision**: pnpm (matching monorepo)

**Rationale**: The docs `package.json` is standalone, but using pnpm in the workflow keeps consistency with the rest of the CI. The workflow will use `pnpm install` in the `docs/` directory.
