# Implementation Plan: Automated npm Package Publishing

**Branch**: `automate-publish` | **Date**: 2026-03-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/20260307120000-automate-publish/spec.md`

## Summary

Automate npm publishing of all 4 monorepo packages (toride, @toride/codegen, @toride/drizzle, @toride/prisma) via a GitHub Actions workflow triggered by semver git tags (`v*`). Uses `nx release` for version bumping and topologically-ordered publishing with provenance attestations. Pre-release tags publish under derived dist-tags (e.g., `beta`, `rc`). A GitHub Release is created automatically after successful publish.

## Technical Context

**Language/Version**: TypeScript (strict mode), Node.js 20 LTS
**Primary Dependencies**: Nx v22.x (`nx release`), `@nx/js` (new dev dependency), pnpm 10.x, GitHub Actions
**Storage**: N/A
**Testing**: Workflow validation via dry-run and manual tag push; no unit tests for CI config
**Target Platform**: GitHub Actions (ubuntu-latest)
**Project Type**: CI/CD workflow (GitHub Actions YAML)
**Performance Goals**: SC-002: entire pipeline completes within 5 minutes
**Constraints**: npm provenance requires `id-token: write` permission; scoped packages require `--access public`
**Scale/Scope**: 4 packages, single workflow file

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Relevant? | Status | Notes |
|-----------|-----------|--------|-------|
| I. Security-First / Fail-Closed | Partial | PASS | Workflow fails early on missing NPM_TOKEN. No packages published if CI fails (FR-011). Not directly about authorization logic. |
| II. Type-Safe Library / Zero Infrastructure | No | PASS | This feature is CI/CD tooling, not library code. No impact on runtime behavior. |
| III. Explicit Over Clever | Yes | PASS | Workflow is a single, readable YAML file. No hidden magic. Version derived directly from tag. |
| IV. Stable Public API / Semver | Yes | PASS | This feature *enforces* semver — version is extracted from the tag and applied uniformly. Supports the principle. |
| V. Test-First | Partial | PASS | CI workflow is infrastructure, not application code. Testing is via dry-run and manual validation, not TDD. Constitution's test-first principle applies to library features, not CI config. |

**Gate result**: PASS — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/20260307120000-automate-publish/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (workflow structure)
├── quickstart.md        # Phase 1 output
└── contracts/
    └── workflow-contract.md  # Workflow trigger/behavior contract
```

### Source Code (repository root)

```text
.github/
└── workflows/
    ├── ci.yml           # Existing CI workflow (unchanged)
    └── publish.yml      # NEW: Tag-triggered publish workflow

nx.json                  # MODIFIED: Add release configuration
package.json             # MODIFIED: Add @nx/js dev dependency
```

**Structure Decision**: Single new workflow file at `.github/workflows/publish.yml`. Minimal changes to existing config files (`nx.json` for release config, root `package.json` for `@nx/js`).

## Complexity Tracking

> No constitution violations. Table not needed.
