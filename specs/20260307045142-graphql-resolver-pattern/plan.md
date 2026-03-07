# Implementation Plan: GraphQL Resolver Pattern for Authorization

**Branch**: `improve-resolvers` | **Date**: 2026-03-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/20260307045142-graphql-resolver-pattern/spec.md`

## Summary

Redesign the `RelationResolver` interface to follow GraphQL's resolver pattern: per-type resolver functions, inline attributes on `ResourceRef`, and relation traversal via attribute values instead of a separate `getRelated` method. Remove `getRoles` and `getRelated` entirely (pre-1.0 clean break). This is a cross-cutting change affecting all 4 monorepo packages: core engine, codegen, drizzle adapter, and prisma adapter.

**Key technical decisions (from interview)**:
- Minimal resolver signature: `(ref: ResourceRef) => Promise<Record<string, unknown>>` (no field hints)
- Full-object cache per `${type}:${id}` (not per-field)
- `buildConstraints` path unchanged
- Clean break: remove old interface entirely, no deprecation bridge
- Mixed TDD: unit tests for new data structures, integration tests for acceptance scenarios
- Downstream ORM packages: thin adapters wrapping ORM queries into new resolver signature

## Technical Context

**Language/Version**: TypeScript (strict mode), Node.js 20+ LTS
**Primary Dependencies**: valibot (schema validation), yaml (policy parsing), tsup (build), vitest (test)
**Storage**: N/A (in-process library, user provides data access)
**Testing**: vitest (mixed: unit tests for data structures, integration tests for acceptance scenarios)
**Target Platform**: Node.js (LTS), edge runtimes, browsers (isomorphic)
**Project Type**: Library (monorepo with 4 packages)
**Performance Goals**: Zero overhead when all attributes provided inline (no resolver calls)
**Constraints**: No external dependencies for policy evaluation; isomorphic runtime support
**Scale/Scope**: 4 packages, ~20 source files affected

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Security-First / Fail-Closed | PASS | Default-deny preserved. Resolver errors propagate (FR-016 strict validation). Missing resolvers = undefined fields, not errors. Inline attributes never bypass auth. |
| II. Type-Safe Library / Zero Infrastructure | PASS | Remains in-process, no infra. Per-type resolvers replace monolithic interface. TypeScript generics preserved. User provides data access via resolvers. |
| III. Explicit Over Clever | PASS | Relation declarations remain explicit in YAML. Simplified syntax (`org: Organization`) is more explicit than object form. No implicit inheritance added. |
| IV. Stable Public API / Semver | PASS | Pre-1.0 breaking change explicitly allowed. RelationResolver, ResourceRef, TorideOptions are public API being redesigned before 1.0 freeze. |
| V. Test-First | PASS | Mixed TDD approach: unit tests for new structures written before implementation, integration tests from spec acceptance scenarios. |

**Technical Constraints Check**:
| Constraint | Status | Notes |
|-----------|--------|-------|
| Policy format: YAML/JSON | PASS | Simplified relation syntax is still valid YAML |
| Per-check caching | PASS | `${type}:${id}` full-object cache, shared across canBatch |
| Cycle detection | PASS | Cache key collision prevents re-resolution of same resource |
| Relation depth | N/A | No artificial limit; cache prevents infinite loops |

## Project Structure

### Documentation (this feature)

```text
specs/20260307045142-graphql-resolver-pattern/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
packages/
├── toride/                          # Core engine (primary changes)
│   └── src/
│       ├── types.ts                 # ResourceRef + attributes, new Resolvers type, remove RelationResolver
│       ├── engine.ts                # Accept resolvers map, wire new cache
│       ├── evaluation/
│       │   ├── cache.ts             # Rewrite: per-type resolver dispatch + inline merge
│       │   ├── role-resolver.ts     # Remove getRoles calls, use derived_roles only
│       │   ├── condition.ts         # Resolve via attributes (inline + resolver), not getRelated
│       │   └── rule-engine.ts       # Pass new resolver context
│       ├── policy/
│       │   ├── schema.ts            # Simplified relation syntax (string, not object)
│       │   └── validator.ts         # Update relation validation
│       ├── partial/
│       │   └── constraint-builder.ts # Update relation resolution (no getRelated)
│       ├── testing/
│       │   └── mock-resolver.ts     # Rewrite for new resolver shape
│       └── index.ts                 # Update exports
├── codegen/
│   └── src/
│       └── generator.ts             # Generate per-type resolver types, remove TypedRelationResolver
├── drizzle/
│   └── src/
│       └── index.ts                 # Thin adapter: Drizzle query -> resolver function
└── prisma/
    └── src/
        └── index.ts                 # Thin adapter: Prisma query -> resolver function
```

**Structure Decision**: Existing monorepo structure is preserved. All changes are modifications to existing files within the 4 packages. No new packages or directories needed.

## Complexity Tracking

> No constitution violations. No entries needed.
