# Feature Specification: Automated npm Package Publishing

**Feature Branch**: `automate-publish`
**Created**: 2026-03-07
**Status**: Draft
**Input**: User description: "automate npm package publish with github actions. creating a tag should trigger it"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Publish Stable Release via Tag (Priority: P1)

As a maintainer, I want to push a semver tag (e.g., `v0.2.0`) to the repository so that all 4 packages (toride, @toride/codegen, @toride/drizzle, @toride/prisma) are automatically published to npm at that version, without any manual steps beyond creating the tag.

**Why this priority**: This is the core value proposition. Without this, there is no automated publish pipeline.

**Independent Test**: Can be fully tested by pushing a tag like `v0.1.0` and verifying all 4 packages appear on npm at version 0.1.0 with correct contents.

**Acceptance Scenarios**:

1. **Given** a commit on `main` that has passed CI, **When** a maintainer pushes tag `v0.2.0`, **Then** a GitHub Actions workflow triggers, runs lint/test/build, updates all package.json versions to `0.2.0`, and publishes all 4 packages to npm with the `latest` dist-tag.
2. **Given** a tag `v0.2.0` is pushed, **When** the workflow completes successfully, **Then** each published package's `workspace:*` dependencies are replaced with the real version range (e.g., `^0.2.0`).
3. **Given** a tag `v0.2.0` is pushed, **When** the lint, test, or build step fails, **Then** no packages are published to npm, and the workflow reports the failure clearly.

---

### User Story 2 - Publish Pre-release via Tag (Priority: P2)

As a maintainer, I want to push a pre-release tag (e.g., `v0.3.0-beta.1`) so that all 4 packages are published to npm under a non-`latest` dist-tag (e.g., `next` or `beta`), allowing users to opt in to pre-release versions without affecting stable installs.

**Why this priority**: Pre-releases enable testing and early feedback without disrupting stable users. Important but not the core flow.

**Independent Test**: Can be tested by pushing a tag like `v0.3.0-beta.1` and verifying all packages are published with a `beta` or `next` dist-tag, and that `npm install toride` still resolves to the latest stable version.

**Acceptance Scenarios**:

1. **Given** a commit on any branch, **When** a maintainer pushes tag `v0.3.0-beta.1`, **Then** the workflow publishes all 4 packages at version `0.3.0-beta.1` with a non-`latest` npm dist-tag.
2. **Given** a pre-release tag is pushed, **When** a user runs `npm install toride`, **Then** they receive the latest stable version, not the pre-release.

---

### User Story 3 - GitHub Release Creation (Priority: P3)

As a maintainer, I want a GitHub Release to be automatically created when packages are published, so that users can see changelogs and release notes without manual effort.

**Why this priority**: Improves visibility and communication with users, but the core value (npm publish) works without it.

**Independent Test**: Can be tested by pushing a tag and verifying a GitHub Release is created with auto-generated release notes.

**Acceptance Scenarios**:

1. **Given** a tag `v0.2.0` is pushed and all packages are published successfully, **When** the workflow completes, **Then** a GitHub Release is created for that tag with auto-generated release notes from commits since the previous tag.
2. **Given** a pre-release tag is pushed, **When** a GitHub Release is created, **Then** it is marked as a pre-release.

---

### Edge Cases

- What happens when a tag is pushed that doesn't match the expected format (e.g., `release-1.0` or `foo`)? The workflow should ignore it entirely.
- What happens when a tag is pushed but one of the packages already exists at that version on npm? The workflow should fail and report which package had the conflict.
- What happens when the npm auth token is missing or invalid? The workflow should fail early with a clear error message before attempting any publish.
- What happens when network issues cause a partial publish (e.g., 2 of 4 packages published)? The workflow should report exactly which packages succeeded and which failed. Recovery is manual (maintainer handles via re-tag or npm unpublish); the workflow does not auto-rollback or retry.
- What happens when someone pushes a tag on a non-main branch? For stable releases, the workflow should only publish from tags pointing to commits on `main`. For pre-releases, tags on any branch are acceptable.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The workflow MUST trigger only on tags matching the pattern `v*` (e.g., `v0.1.0`, `v1.0.0-beta.1`).
- **FR-002**: The workflow MUST validate that the tag conforms to semver format (`vMAJOR.MINOR.PATCH` or `vMAJOR.MINOR.PATCH-PRERELEASE`).
- **FR-003**: The workflow MUST extract the version from the tag name (strip the `v` prefix) and update all 4 package.json files to that version before publishing.
- **FR-004**: The workflow MUST run lint, test, and build across all packages before publishing, using Nx (consistent with existing CI).
- **FR-005**: The workflow MUST publish all 4 packages to npm in dependency order (toride first, then codegen/drizzle/prisma).
- **FR-006**: For stable releases (no pre-release suffix), the workflow MUST publish with the `latest` npm dist-tag.
- **FR-007**: For pre-release versions (tag contains `-`), the workflow MUST publish with a non-`latest` npm dist-tag derived by extracting the first segment before the first `.` in the pre-release identifier (e.g., `v1.0.0-beta.1` → dist-tag `beta`, `v1.0.0-rc.1` → dist-tag `rc`, `v1.0.0-alpha.2.3` → dist-tag `alpha`).
- **FR-008**: The workflow MUST allow pnpm to resolve `workspace:*` dependencies to real version ranges during publish.
- **FR-009**: The workflow MUST create a GitHub Release for the tag after successful publish, with auto-generated release notes.
- **FR-010**: For pre-release tags, the GitHub Release MUST be marked as a pre-release.
- **FR-011**: The workflow MUST NOT publish any packages if any CI step (lint, test, build) fails.
- **FR-012**: The workflow MUST use an npm authentication token stored as a GitHub repository secret (e.g., `NPM_TOKEN`).
- **FR-013**: The workflow MUST NOT modify the repository's git history or push commits back (version bumps are only applied in the CI environment for publishing purposes).
- **FR-014**: The workflow MUST publish packages with the `--provenance` flag to generate signed provenance attestations. The workflow job MUST have `id-token: write` permission.
- **FR-015**: The workflow MUST use GitHub Actions `concurrency` with `cancel-in-progress: true` to prevent parallel publish runs when multiple tags are pushed in quick succession.

## Clarifications

### Session 2026-03-07

- Q: How should the pre-release dist-tag be derived from the tag name? → A: Extract the first segment before the first `.` in the pre-release part (e.g., `v1.0.0-beta.1` → `beta`).
- Q: What should the recovery strategy be for partial publish failures? → A: Report only with manual recovery; no auto-rollback or retry.
- Q: Should packages be published with npm provenance (--provenance)? → A: Yes, publish with `--provenance` for supply chain security.
- Q: Should the workflow have concurrency controls for simultaneous tag pushes? → A: Yes, use `concurrency` with `cancel-in-progress: true`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A maintainer can publish all 4 packages to npm by creating and pushing a single git tag, with zero manual npm commands.
- **SC-002**: The entire publish pipeline (CI checks + publish + GitHub Release) completes within 5 minutes for a typical run.
- **SC-003**: Pre-release tags publish to a separate npm dist-tag, ensuring `npm install toride` always resolves to the latest stable version.
- **SC-004**: 100% of publish attempts that pass CI checks result in all 4 packages being published at the correct version.
- **SC-005**: Every successful publish produces a corresponding GitHub Release with meaningful release notes.
