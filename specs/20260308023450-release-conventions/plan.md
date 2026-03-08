# Implementation Plan: Release Conventions & AI-Assisted Release Prep

**Branch**: `automate-release` | **Date**: 2026-03-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/20260308023450-release-conventions/spec.md`

## Summary

Establish a complete release workflow for the toride monorepo: a `/release` Claude Code skill that analyzes commits, determines semver bumps, generates changelogs, and outputs git commands; Conventional Commits enforcement via CLAUDE.md instructions and Lefthook + commitlint; CHANGELOG.md maintenance in Keep a Changelog format; and a tag-triggered GitHub Actions publish workflow that publishes all 4 packages to npm and creates GitHub Releases.

## Technical Context

**Language/Version**: TypeScript (strict mode), Node.js 20+ LTS; Bash for CI scripts
**Primary Dependencies**: Lefthook (git hooks), @commitlint/cli + @commitlint/config-conventional (commit validation)
**Storage**: N/A (file-based: CHANGELOG.md, package.json versions, git tags)
**Testing**: Manual verification of the `/release` skill output; commitlint validates commit format
**Target Platform**: GitHub Actions (CI), Claude Code (developer tooling)
**Project Type**: Developer tooling / CI pipeline (no runtime code)
**Performance Goals**: N/A
**Constraints**: Zero runtime dependencies added to published packages; all tooling is devDependencies or CI-only
**Scale/Scope**: Single maintainer, 4 packages, lockstep versioning

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Security-First / Fail-Closed | ✅ PASS | Not applicable — this feature is developer tooling, not authorization logic. No security decisions affected. |
| II. Type-Safe Library / Zero Infrastructure | ✅ PASS | No runtime dependencies added to published packages. Lefthook, commitlint are devDependencies only. The `/release` skill is a prompt file, not shipped code. |
| III. Explicit Over Clever | ✅ PASS | All behavior is explicit: CHANGELOG.md is human-readable, commit conventions are documented, git commands are shown (not auto-executed). No hidden magic. |
| IV. Stable Public API / Semver | ✅ PASS | This feature *implements* semver enforcement. Conventional Commits → automated version bump decisions. Directly supports this principle. |
| V. Test-First | ⚠️ N/A | This feature is tooling/configuration, not application code. No unit-testable logic is being written. The "tests" are the acceptance scenarios in the spec (manual verification). |

**Post-Phase 1 re-check**: No violations. The design adds zero runtime impact to the published library.

## Project Structure

### Documentation (this feature)

```text
specs/20260308023450-release-conventions/
├── plan.md              # This file
├── research.md          # Phase 0: technology decisions
├── data-model.md        # Phase 1: file artifacts and schemas
├── quickstart.md        # Phase 1: usage guide
├── contracts/
│   ├── release-skill-contract.md
│   ├── publish-workflow-contract.md
│   └── conventional-commits-contract.md
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
.claude/
└── commands/
    └── release.md                    # /release skill prompt (NEW)

.github/
└── workflows/
    ├── ci.yml                        # Existing — no changes
    ├── benchmark.yml                 # Existing — no changes
    └── publish.yml                   # Tag-triggered publish + GitHub Release (NEW)

lefthook.yml                          # Lefthook config: commit-msg hook (NEW)
commitlint.config.js                  # commitlint configuration (NEW)
CHANGELOG.md                          # Created by first /release run (NEW)

package.json                          # Add devDeps + postinstall hook (MODIFIED)
CLAUDE.md                             # Add Conventional Commits instructions (MODIFIED)

packages/
├── toride/package.json               # Version field updated at release time
├── codegen/package.json               # Version field updated at release time
├── drizzle/package.json               # Version field updated at release time
└── prisma/package.json                # Version field updated at release time
```

**Structure Decision**: This feature adds configuration files at the repo root and a Claude Code skill. No new packages or source directories. All changes are tooling and CI — no impact on the existing package source code structure.

## Complexity Tracking

> No constitution violations. No complexity justifications needed.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
