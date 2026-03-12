# Implementation Plan: End-to-End Type Safety

**Branch**: `improve-typesafety` | **Date**: 2026-03-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/20260311160000-end-to-end-type-safety/spec.md`

## Summary

Make the Toride authorization engine fully type-safe at compile time. The `Toride` class becomes generic (`Toride<S extends TorideSchema>`), with all engine methods narrowing actions, resource types, actor types, and attributes based on the schema. `@toride/codegen` generates a `GeneratedSchema` interface from the policy YAML. The policy format gains an optional `attributes` declaration on resources. Integration packages and `TorideClient` also become generic.

## Technical Context

**Language/Version**: TypeScript (strict mode), Node.js 20+ LTS
**Primary Dependencies**: valibot (schema validation), yaml (policy parsing), tsup (build), vitest (test), tsd (type testing)
**Storage**: N/A (in-process library, user provides data access)
**Testing**: vitest (runtime tests) + tsd / `@ts-expect-error` (compile-time type tests)
**Target Platform**: Node.js, edge runtimes, browsers (isomorphic)
**Project Type**: Library (monorepo: 4 packages)
**Performance Goals**: No runtime overhead — all type safety is compile-time only
**Constraints**: No deep conditional types (keep IDE fast, error messages clear). Codegen does the heavy lifting.
**Scale/Scope**: 4 packages affected (toride, codegen, drizzle, prisma). ~31 functional requirements.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Gate | Status |
|---|-----------|------|--------|
| I | Security-First / Fail-Closed | Type changes must not alter runtime authorization behavior. Default-deny semantics preserved. | **PASS** — All changes are compile-time only. Runtime evaluation logic is unchanged. `DefaultSchema` (all strings) preserves current fail-closed behavior. |
| II | Type-Safe Library / Zero Infrastructure | Full TypeScript generics: actor types, resource types, permissions, and roles MUST be statically checked at compile time. | **PASS** — This feature directly implements Principle II. All specified entities become statically checked. |
| III | Explicit Over Clever | No hidden magic. Policies MUST be valid YAML/JSON. | **PASS** — Resource `attributes` is an explicit YAML declaration. No inference magic. Codegen is a deterministic transformation. |
| IV | Stable Public API / Semver | Breaking changes MUST require a major version bump. | **PASS** — Breaking changes are accepted; will be a major version bump. Migration path is documented (add `<GeneratedSchema>` type param). |
| V | Test-First | Tests MUST be written before implementation. | **PASS** — TDD with vitest (runtime) + tsd (type-level). Type tests verify compile-time contracts before implementation. |

## Project Structure

### Documentation (this feature)

```text
specs/20260311160000-end-to-end-type-safety/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Design decisions (11 entries)
├── data-model.md        # Entity changes and type flow
├── quickstart.md        # Before/after usage examples
├── contracts/
│   ├── core-schema.ts   # TorideSchema, DefaultSchema, typed refs
│   ├── engine-api.ts    # Toride<S> method signatures
│   ├── codegen-output.ts # GeneratedSchema example
│   ├── client-api.ts    # TorideClient<S> signatures
│   └── integration-api.ts # Drizzle/Prisma typed factories
└── checklists/
    └── requirements.md  # Quality checklist
```

### Source Code (repository root)

```text
packages/toride/src/
├── types.ts                    # MODIFIED: TorideSchema, DefaultSchema, generic ActorRef/ResourceRef/Resolvers/etc.
├── engine.ts                   # MODIFIED: Toride<S> with generic method signatures
├── client.ts                   # MODIFIED: TorideClient<S>
├── snapshot.ts                 # MODIFIED: generic SnapshotEngine interface
├── field-access.ts             # MODIFIED: generic FieldAccessEngine interface
├── policy/
│   ├── schema.ts               # MODIFIED: ResourceBlockSchema gains optional attributes
│   └── validator.ts            # MODIFIED: validate resource attribute declarations
├── __typetests__/              # NEW: tsd type test files
│   ├── schema.test-d.ts        # TorideSchema / DefaultSchema tests
│   ├── engine.test-d.ts        # can(), explain(), permittedActions() type tests
│   ├── resolvers.test-d.ts     # Resolver type narrowing tests
│   └── client.test-d.ts        # TorideClient type tests
└── index.ts                    # MODIFIED: export new types

packages/codegen/src/
├── generator.ts                # MODIFIED: emit ActorTypes, ActorAttributeMap, ResourceAttributeMap, GeneratedSchema, typed ResolverMap
└── generator.test.ts           # MODIFIED: verify new codegen output

packages/drizzle/src/
└── index.ts                    # MODIFIED: generic createDrizzleResolver<S, R>

packages/prisma/src/
└── index.ts                    # MODIFIED: generic createPrismaResolver<S, R>
```

**Structure Decision**: Existing monorepo structure is preserved. Changes are modifications to existing files plus a new `__typetests__/` directory for tsd type tests.

## Implementation Phases

### Phase 1: Policy Schema Extension (FR-001 to FR-003)

**Goal**: Add optional `attributes` declaration to resource blocks.

**Files**:
- `packages/toride/src/types.ts` — Add `attributes?: Record<string, AttributeType>` to `ResourceBlock`
- `packages/toride/src/policy/schema.ts` — Add `attributes` to `ResourceBlockSchema`
- `packages/toride/src/policy/validator.ts` — Validate resource attribute types

**Tests** (write first):
- Policy with resource attributes parses successfully
- Policy without resource attributes still works (optional)
- Invalid attribute types are rejected
- Existing policy fixtures continue to pass

**Dependencies**: None (foundation layer).

### Phase 2: Core TorideSchema + Generic Refs (FR-004 to FR-006, FR-017)

**Goal**: Define `TorideSchema` interface, `DefaultSchema`, and make `ActorRef`, `ResourceRef`, `Resolvers` generic.

**Files**:
- `packages/toride/src/types.ts` — Add `TorideSchema`, `DefaultSchema`. Make `ActorRef<S>`, `ResourceRef<S, R>`, `ResourceResolver<S, R>`, `Resolvers<S>`, `TorideOptions<S>`, `BatchCheckItem<S>`, `ExplainResult<S, R>` generic with default params.
- `packages/toride/src/index.ts` — Export new types
- `packages/toride/src/__typetests__/schema.test-d.ts` — Type-level tests for TorideSchema, DefaultSchema, generic refs

**Tests** (write first):
- `DefaultSchema` collapses to current untyped shapes
- `ActorRef<GeneratedSchema>` is a discriminated union
- `ResourceRef<GeneratedSchema, "Document">` has typed attributes
- `Resolvers<GeneratedSchema>` maps resource names to typed resolvers
- Invalid resource/actor types produce type errors (`@ts-expect-error`)
- All existing runtime tests pass unchanged

**Dependencies**: Phase 1 (ResourceBlock.attributes exists).

**Key constraint**: All existing type names are preserved with default type parameters. `ActorRef` without params equals `ActorRef<DefaultSchema>`, which equals the current shape.

### Phase 3: Engine Method Generics (FR-007 to FR-016)

**Goal**: Make `Toride<S>` class generic. All methods (`can`, `explain`, `canBatch`, `permittedActions`, `buildConstraints`, `canField`, `permittedFields`, `resolvedRoles`, `snapshot`) gain type narrowing.

**Files**:
- `packages/toride/src/engine.ts` — `Toride<S extends TorideSchema = DefaultSchema>`. All method signatures become generic.
- `packages/toride/src/snapshot.ts` — `SnapshotEngine` interface becomes generic
- `packages/toride/src/field-access.ts` — `FieldAccessEngine` interface becomes generic
- `packages/toride/src/__typetests__/engine.test-d.ts` — Type tests for every engine method
- `packages/toride/src/__typetests__/resolvers.test-d.ts` — Resolver type tests

**Tests** (write first):
- `can(actor, "read", { type: "Document", ... })` compiles
- `can(actor, "reed", ...)` produces `@ts-expect-error`
- `can(actor, "read", { type: "Docuemnt", ... })` produces `@ts-expect-error`
- `explain()` return type has typed `grantedPermissions`
- `permittedActions()` returns typed permission array
- `buildConstraints()` narrows `resourceType`
- `canBatch()` action uses global Actions union
- All existing runtime tests pass unchanged

**Dependencies**: Phase 2 (generic types exist).

**Key implementation detail**: The engine class signature changes from `class Toride` to `class Toride<S extends TorideSchema = DefaultSchema>`. Method bodies are unchanged — only signatures change. Internal `evaluateInternal` stays untyped (runtime logic doesn't need generics).

### Phase 4: Codegen Updates (FR-021 to FR-025)

**Goal**: Update `@toride/codegen` to generate `ActorTypes`, `ActorAttributeMap`, `ResourceAttributeMap`, `GeneratedSchema`, and typed `ResolverMap`.

**Files**:
- `packages/codegen/src/generator.ts` — Add generation for new types
- `packages/codegen/src/generator.test.ts` — Verify new output

**Tests** (write first):
- Codegen output contains `ActorTypes` union
- Codegen output contains `ActorAttributeMap` with typed attributes per actor
- Codegen output contains `ResourceAttributeMap` with typed attributes per resource
- Resources without `attributes` produce `Record<string, unknown>` in the map
- Codegen output contains `GeneratedSchema extends TorideSchema`
- `ResolverMap` uses typed return values from `ResourceAttributeMap`
- All existing codegen tests pass (existing types still generated)
- Output compiles as valid TypeScript (structural check)

**Dependencies**: Phase 2 (TorideSchema interface exists for `extends`).

### Phase 5: Client Type Safety (FR-026, FR-027)

**Goal**: Make `TorideClient<S>` generic.

**Files**:
- `packages/toride/src/client.ts` — `TorideClient<S extends TorideSchema = DefaultSchema>`. `can()` and `permittedActions()` signatures narrowed.
- `packages/toride/src/__typetests__/client.test-d.ts` — Type tests

**Tests** (write first):
- `TorideClient<GeneratedSchema>.can("read", { type: "Document", id: "1" })` compiles
- `TorideClient<GeneratedSchema>.can("reed", ...)` produces `@ts-expect-error`
- `TorideClient()` without type param works as current (DefaultSchema)
- All existing client runtime tests pass

**Dependencies**: Phase 2 (TorideSchema, DefaultSchema).

### Phase 6: Integration Package Type Safety (FR-028 to FR-030)

**Goal**: Make `@toride/drizzle` and `@toride/prisma` resolver/adapter factories generic.

**Files**:
- `packages/drizzle/src/index.ts` — `createDrizzleResolver<S, R>()` gains schema type params
- `packages/prisma/src/index.ts` — `createPrismaResolver<S, R>()` gains schema type params
- Integration tests for type narrowing

**Tests** (write first):
- `createDrizzleResolver<GeneratedSchema, "Document">(db, table)` constrains return type
- `createPrismaResolver<GeneratedSchema, "Document">(client, "Document")` constrains return type
- Invalid resource type produces `@ts-expect-error`
- All existing integration tests pass

**Dependencies**: Phase 2 (TorideSchema), Phase 4 (codegen produces GeneratedSchema for test fixtures).

### Phase 7: Validation & Polish

**Goal**: Verify end-to-end type flow, update exports, run full test suite.

**Tasks**:
- Write an end-to-end type test that uses codegen output → Toride<GeneratedSchema> → typed can() → typed permittedActions → TorideClient<GeneratedSchema>
- Run `pnpm run build` across all packages — verify clean compilation
- Run `pnpm run test` across all packages — verify all runtime tests pass
- Run `pnpm run lint` across all packages — verify no type errors
- Verify IDE autocompletion works with a sample GeneratedSchema (manual check)
- Update benchmark fixtures with resource attributes (optional)

**Dependencies**: All previous phases.

## Complexity Tracking

No constitution violations to justify. All changes align with the stated principles, particularly Principle II (Type-Safe Library).
