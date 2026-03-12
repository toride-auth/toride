# Implementation Plan: Deep Type Safety

**Branch**: `improve-typesafety2` | **Date**: 2026-03-12 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/20260312133429-deep-type-safety/spec.md`

## Summary

Make toride's type system deliver per-resource narrowing at every API surface: action parameters, field names, role names, constraint pipeline outputs, and client-side checks. The approach updates engine method signatures to leverage existing `TorideSchema` maps (no new schema properties), changes `ConstraintAdapter<TQuery>` to `ConstraintAdapter<TQueryMap>` for per-resource query typing (breaking change), adds phantom type parameters to `ConstraintResult<R>` and `PermissionSnapshot<S>`, and narrows `TorideClient.can()` with generic `<R>` for per-resource action validation. All changes degrade gracefully to `string` / `Record<string, unknown>` when `DefaultSchema` is used.

## Technical Context

**Language/Version**: TypeScript (strict mode), Node.js 20+ LTS
**Primary Dependencies**: valibot (schema validation), yaml (policy parsing), tsup (build), tsd (type testing)
**Storage**: N/A (in-process library)
**Testing**: vitest (runtime tests), tsd (compile-time type tests)
**Target Platform**: Node.js, edge runtimes, browsers (isomorphic)
**Project Type**: Library (monorepo: core + codegen + prisma adapter + drizzle adapter)
**Performance Goals**: N/A (type-level changes only, zero runtime overhead)
**Constraints**: Zero runtime cost — all changes are compile-time type narrowing. No new runtime dependencies.
**Scale/Scope**: 4 packages affected (toride core, @toride/codegen, @toride/prisma, @toride/drizzle)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Security-First / Fail-Closed | ✅ PASS | No runtime behavior changes. Type narrowing catches errors at compile time — additive security improvement. |
| II. Type-Safe Library / Zero Infrastructure | ✅ PASS | Core purpose of this feature. Deepens TypeScript generics for static checking. No new infrastructure. |
| III. Explicit Over Clever | ✅ PASS | No hidden magic. Type narrowing is visible at every call site via explicit generics. |
| IV. Stable Public API / Semver | ⚠️ JUSTIFIED | `ConstraintAdapter<TQuery>` → `ConstraintAdapter<TQueryMap>` is a breaking change. Spec explicitly authorizes this as a minor version bump (pre-1.0 library). See Complexity Tracking. |
| V. Test-First | ✅ PASS | tsd type tests written alongside implementation. Runtime tests unaffected (type-only changes). |

### Post-Phase 1 Re-check

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Security-First / Fail-Closed | ✅ PASS | No runtime changes. DefaultSchema fallback preserves existing behavior. |
| II. Type-Safe Library / Zero Infrastructure | ✅ PASS | This IS the feature. |
| III. Explicit Over Clever | ✅ PASS | All type narrowing is explicit via generics. No conditional types that hide behavior. |
| IV. Stable Public API / Semver | ⚠️ JUSTIFIED | Same as above. ConstraintAdapter interface change is documented and intentional. |
| V. Test-First | ✅ PASS | Type tests cover all 6 user stories + edge cases. |

## Project Structure

### Documentation (this feature)

```text
specs/20260312133429-deep-type-safety/
├── plan.md              # This file
├── research.md          # Phase 0: technical decisions
├── data-model.md        # Phase 1: type entity definitions
├── quickstart.md        # Phase 1: usage examples
├── contracts/           # Phase 1: target API signatures
│   ├── constraint-pipeline.ts
│   ├── engine-methods.ts
│   ├── client.ts
│   └── adapters.ts
└── tasks.md             # Phase 2 output (NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
packages/
├── toride/src/                    # Core package
│   ├── types.ts                   # TorideSchema (unchanged), DefaultSchema (unchanged)
│   ├── engine.ts                  # Engine method signature updates
│   ├── client.ts                  # TorideClient per-resource narrowing
│   ├── snapshot.ts                # PermissionSnapshot<S> phantom type
│   ├── field-access.ts            # canField/permittedFields typed field params
│   ├── partial/
│   │   ├── constraint-types.ts    # ConstraintResult<R>, ConstraintAdapter<TQueryMap>
│   │   └── translator.ts          # translateConstraints signature update
│   └── __typetests__/
│       ├── e2e.test-d.ts          # Updated end-to-end type tests
│       ├── engine.test-d.ts       # Engine method type tests
│       ├── client.test-d.ts       # Client type tests
│       └── constraint-pipeline.test-d.ts  # NEW: constraint pipeline type tests
├── codegen/src/
│   └── generator.ts               # No structural changes needed
├── prisma/src/
│   ├── index.ts                   # createPrismaAdapter<TQueryMap>
│   └── __typetests__/             # Adapter type tests
└── drizzle/src/
    ├── index.ts                   # createDrizzleAdapter<TQueryMap>
    └── __typetests__/             # Adapter type tests
```

**Structure Decision**: Existing monorepo structure. All changes are modifications to existing files. One new type test file (`constraint-pipeline.test-d.ts`) for the new constraint pipeline typing.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| ConstraintAdapter breaking change (Principle IV) | Per-resource query output typing requires the adapter to map resource types to query types. A single `TQuery` parameter cannot express this. | Backward-compat default (`Record<string, TQuery>`) adds type complexity for marginal benefit. Pre-1.0 library, clean break is simpler. Spec explicitly authorizes minor version bump for this change. |
