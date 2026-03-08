# Research: Automated npm Package Publishing

**Date**: 2026-03-07

## Decision 1: CI Workflow Architecture

**Decision**: Standalone workflow (`publish.yml`) — no composite actions or reusable workflows.

**Rationale**: The existing CI uses `nx affected` (only changed packages), while publish needs `nx run-many` (all packages). The shared setup steps (checkout, pnpm, node, install) are only 4 steps — extracting them into a composite action adds indirection with minimal DRY benefit. The publish workflow has unique steps (version bumping, npm auth, provenance, GitHub Release) that don't overlap with CI.

**Alternatives considered**:
- *Composite actions*: Would extract checkout/pnpm/node/install into `.github/actions/setup/action.yml`. Rejected because the shared surface is only 4 lines and the two workflows diverge significantly after setup.
- *Reusable workflow (`workflow_call`)*: Would call CI workflow first, then publish. Rejected because CI uses `nx affected` while publish needs `nx run-many`, and adding conditional logic would complicate both workflows.

## Decision 2: Version Bumping & Publishing Tool

**Decision**: Use `nx release` (version + publish) with `@nx/js` dependency.

**Rationale**: `nx release` is purpose-built for Nx monorepos. It handles:
- Version bumping across all `package.json` files in one command
- `workspace:*` → real version resolution during publish
- Topologically-ordered publishing (toride first, then dependents)
- Integration with the existing Nx project graph

The workflow calls:
1. `pnpm exec nx release version $VERSION` — sets version in all package.json files
2. `pnpm exec nx run-many -t lint test build` — CI checks
3. `pnpm exec nx release publish` — publishes in dependency order

**Alternatives considered**:
- *`pnpm publish -r`*: Handles publish and workspace resolution, but versioning must be done separately (manual `jq`/`sed` on each package.json). More moving parts.
- *Changesets*: Full release management tool, but overkill for tag-triggered publish where version is derived from the tag name. Adds unnecessary config files and workflow complexity.

## Decision 3: Pre-release Dist-Tag Derivation

**Decision**: Extract the first segment before the first `.` in the pre-release identifier.

**Rationale**: Directly from spec (FR-007). Examples:
- `v1.0.0-beta.1` → dist-tag `beta`
- `v1.0.0-rc.1` → dist-tag `rc`
- `v1.0.0-alpha.2.3` → dist-tag `alpha`

Implementation: Shell parameter expansion or a simple regex in the workflow.

## Decision 4: npm Access & Provenance

**Decision**: Use `--access public` and `--provenance` flags.

**Rationale**:
- `--access public` is required for scoped packages (`@toride/*`) to be publicly installable. Without it, npm defaults scoped packages to restricted access.
- `--provenance` generates signed SLSA provenance attestations, improving supply chain security (FR-014). Requires `id-token: write` permission on the GitHub Actions job.

## Decision 5: Stable Release Branch Protection

**Decision**: Add a workflow step that verifies the tagged commit is on `main` for stable releases. Pre-releases skip this check.

**Rationale**: From the spec's edge cases — stable releases should only publish from tags pointing to commits on `main`. This prevents accidental stable releases from feature branches. Pre-releases on any branch are acceptable for testing.

Implementation: Use `git branch --contains $TAG_SHA` and check if `main` is in the output.

## Decision 6: nx.json Release Configuration

**Decision**: Add minimal `release` config to `nx.json`.

**Rationale**: `nx release` needs to know which projects to include. Configuration:

```json
{
  "release": {
    "projects": ["packages/*"],
    "version": {
      "conventionalCommits": false
    },
    "changelog": {
      "enabled": false
    }
  }
}
```

- `conventionalCommits: false` — version comes from the git tag, not commit messages
- `changelog.enabled: false` — GitHub Release auto-generates notes from commits; no need for CHANGELOG.md files

## Decision 7: Concurrency Control

**Decision**: Use GitHub Actions `concurrency` with `cancel-in-progress: true`.

**Rationale**: FR-015 requires preventing parallel publish runs. Using `concurrency: { group: "publish", cancel-in-progress: true }` ensures that if two tags are pushed quickly, only the latest one runs.

## Decision 8: Publish from Package Root

**Decision**: Publish from each package's root directory (e.g., `packages/toride/`).

**Rationale**: All packages already have `"files": ["dist"]` in their `package.json`, which ensures only the `dist/` folder is included in the npm tarball. This is the standard setup and requires no changes.
