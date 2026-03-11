# Implementation Plan: Default Resolver Formalization

**Branch**: `default-resolver` | **Date**: 2026-03-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/20260311131506-default-resolver/spec.md`

## Summary

Formalize the existing "default resolver" behavior — when no `ResourceResolver` is registered for a resource type, `$resource.<field>` conditions resolve from inline `ResourceRef.attributes`. This feature adds dedicated tests, JSDoc documentation, and a VitePress concepts page. **No runtime behavior changes.**

## Technical Context

**Language/Version**: TypeScript (strict mode), Node.js 20+ LTS
**Primary Dependencies**: vitest (test), tsup (build), VitePress 1.6.4 (docs)
**Storage**: N/A (in-process library)
**Testing**: vitest
**Target Platform**: Node.js, edge runtimes, browsers (isomorphic)
**Project Type**: Library (monorepo — `packages/toride` core package + `docs/` VitePress site)
**Performance Goals**: N/A (no runtime changes)
**Constraints**: No breaking changes (FR-007), existing tests must pass unmodified (SC-004)
**Scale/Scope**: ~4 files modified, ~1 new test file, ~1 new docs page

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Security-First / Fail-Closed | ✅ PASS | No behavior change. Default-deny preserved: no resolver + no inline = undefined = deny. |
| II. Type-Safe Library / Zero Infrastructure | ✅ PASS | No new dependencies. Resolver interface unchanged. |
| III. Explicit Over Clever | ✅ PASS | This feature makes implicit behavior *more* explicit via docs and tests. |
| IV. Stable Public API / Semver | ✅ PASS | No API changes. JSDoc additions are non-breaking. |
| V. Test-First | ✅ PASS | New dedicated test file written before any implementation (though no implementation needed — tests formalize existing behavior). |

**Gate result: PASS** — No violations. Complexity Tracking table not needed.

## Project Structure

### Documentation (this feature)

```text
specs/20260311131506-default-resolver/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
packages/toride/src/
├── types.ts                                    # JSDoc updates (FR-005)
├── evaluation/cache.ts                         # JSDoc updates (FR-005)
└── __integration__/
    ├── inline-attributes.test.ts               # Existing (unchanged)
    └── default-resolver.test.ts                # NEW: dedicated default resolver tests (FR-004)

docs/
├── concepts/
│   └── resolvers.md                            # NEW: resolver concepts page (FR-006)
└── .vitepress/
    └── config.ts                               # Sidebar entry for resolvers page
```

**Structure Decision**: Follows existing monorepo layout. New test file in `__integration__/` alongside existing `inline-attributes.test.ts`. New docs page in `docs/concepts/` consistent with other concept pages.

## Constitution Re-Check (Post Phase 1 Design)

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Security-First / Fail-Closed | ✅ PASS | Design confirms: no resolver + no inline → empty object → undefined fields → deny. Fail-closed preserved. |
| II. Type-Safe Library / Zero Infrastructure | ✅ PASS | No new dependencies added. JSDoc-only changes to types. VitePress docs are already in the repo. |
| III. Explicit Over Clever | ✅ PASS | The entire feature is about making implicit behavior explicit. JSDoc, tests, and docs all serve this principle. |
| IV. Stable Public API / Semver | ✅ PASS | No signature changes. JSDoc additions and new test file are non-breaking. |
| V. Test-First | ✅ PASS | New `default-resolver.test.ts` will be written first, then JSDoc/docs. Tests formalize existing passing behavior. |

**Post-design gate result: PASS** — Design is fully aligned with constitution.

## Complexity Tracking

> No violations — table not needed.
