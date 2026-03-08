# Implementation Plan: Sync Documentation with Implementation

**Branch**: `sync-docs` | **Date**: 2026-03-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/20260308120000-sync-docs-with-implementation/spec.md`

## Summary

The documentation references a `RelationResolver` interface with `getRoles`, `getRelated`, and `getAttributes` methods that no longer exist in the codebase. The actual API uses a per-type `Resolvers` map (`Record<string, ResourceResolver>`) where each resolver is a simple function returning attributes. All roles are now derived through policy `derived_roles` entries (FR-008 removed `getRoles`). This plan covers rewriting `quickstart.md`, fixing `getting-started.md`, and deleting the outdated `spec.md`.

## Technical Context

**Language/Version**: Markdown + TypeScript code snippets (must match `toride` package exports)
**Primary Dependencies**: VitePress 1.6.4 (docs site), toride core package (API reference)
**Storage**: N/A (static Markdown files)
**Testing**: VitePress build (`pnpm --filter docs build`) to verify no broken links
**Target Platform**: Static documentation site (GitHub Pages)
**Project Type**: Documentation (VitePress site in `docs/`)
**Performance Goals**: N/A
**Constraints**: Code snippets must compile against actual toride exports; pseudocode DB calls for resolver examples
**Scale/Scope**: 3 files affected: `docs/guide/quickstart.md` (rewrite), `docs/guide/getting-started.md` (minor fix), `docs/spec.md` (delete)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Security-First / Fail-Closed | PASS | Docs-only change. No engine behavior affected. |
| II. Type-Safe Library / Zero Infrastructure | PASS | Updated docs will correctly describe the `Resolvers` map pattern. Note: constitution itself references `RelationResolver` — separate concern. |
| III. Explicit Over Clever | PASS | Updated quickstart shows explicit per-type resolvers and explicit derived_roles patterns. |
| IV. Stable Public API / Semver | PASS | No API changes. Docs are corrected to match existing API. |
| V. Test-First | N/A | Documentation change — no new engine features. VitePress build verifies docs integrity. |

**Gate result**: PASS — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/20260308120000-sync-docs-with-implementation/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Files Modified (repository root)

```text
docs/
├── guide/
│   ├── quickstart.md      # REWRITE: replace RelationResolver with per-type resolvers map
│   └── getting-started.md # MINOR FIX: update resolver description wording
└── spec.md                # DELETE: outdated technical specification
```

**Structure Decision**: No new files created. Three existing files modified (2 edits, 1 deletion). No contracts directory needed — this is a documentation-only change with no external interfaces.

## Complexity Tracking

> No violations to justify. This is a straightforward documentation correction.
