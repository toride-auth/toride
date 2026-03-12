# Tasks: Deep Type Safety

**Input**: Design documents from `/specs/20260312133429-deep-type-safety/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: tsd type tests are included alongside implementation tasks (not TDD — tests written alongside code per Research Decision 8).

**Organization**: Tasks follow the research dependency order: core types → codegen → adapters → client/snapshot. User stories are mapped to phases accordingly.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Verify build and existing tests pass before any changes.

- [X] T001 Verify all packages build successfully with `pnpm run build`
- [X] T002 Verify all existing tests pass with `pnpm run test`
- [X] T003 Verify all existing type tests pass with `pnpm run lint`

**Checkpoint**: Clean baseline — all builds, tests, and type checks pass before modifications begin.

---

## Phase 2: Foundational — Core Type Definitions (US1 + US3 + US4)

**Purpose**: Update `TorideSchema`, `ConstraintResult`, and `ConstraintAdapter` type definitions. These are the foundational types that all downstream changes depend on.

**⚠️ CRITICAL**: No engine, client, codegen, or adapter changes can begin until these types are updated.

- [ ] T004 Add phantom resource type parameter `R` to `ConstraintResult<R extends string = string>` in `packages/toride/src/partial/constraint-types.ts` — add optional `readonly __resource?: R` to each variant of the discriminated union per data-model.md
- [ ] T005 Update `ConstraintAdapter<TQuery>` to `ConstraintAdapter<TQueryMap extends Record<string, unknown> = Record<string, unknown>>` in `packages/toride/src/partial/constraint-types.ts` — change all method signatures to use `TQueryMap[string]` per contracts/constraint-pipeline.ts (BREAKING CHANGE)
- [ ] T006 Update `PermissionSnapshot` to `PermissionSnapshot<S extends TorideSchema = DefaultSchema>` in `packages/toride/src/snapshot.ts` — add phantom `readonly __schema?: S` field per data-model.md
- [ ] T007 Update `ClientResourceRef` to be generic over `R extends S["resources"] = S["resources"]` with `type: R` in `packages/toride/src/client.ts` per contracts/client.ts
- [ ] T008 Update re-exports in `packages/toride/src/index.ts` to ensure updated types are properly exported

**Checkpoint**: Core types compile. Existing runtime tests still pass (type defaults ensure backward compat). `pnpm run build && pnpm run test` green.

---

## Phase 3: User Story 1 — Resource-Typed Constraint Pipeline (Priority: P1) 🎯 MVP

**Goal**: `buildConstraints` returns `ConstraintResult<R>`, `translateConstraints` returns `TQueryMap[R]` — the full pipeline carries resource type information.

**Independent Test**: Create typed adapter with resource-to-query map, verify TypeScript infers correct output type at each pipeline stage.

### Implementation for User Story 1

- [X] T009 [US1] Update `buildConstraints<R>()` signature in `packages/toride/src/engine.ts` to return `Promise<ConstraintResult<R>>` where `R extends S["resources"]`, and narrow `action` parameter to `S["permissionMap"][R]`
- [X] T010 [US1] Update `translateConstraints()` signature in `packages/toride/src/partial/translator.ts` to accept `ConstraintResult<R>` and `ConstraintAdapter<TQueryMap>`, returning `TQueryMap[R]`
- [X] T011 [US1] Update any internal helpers in `packages/toride/src/partial/constraint-builder.ts` that construct `ConstraintResult` to pass through the `R` type parameter
- [X] T012 [US1] Create constraint pipeline type tests in `packages/toride/src/__typetests__/constraint-pipeline.test-d.ts` — test that `buildConstraints` returns `ConstraintResult<"Document">`, `translateConstraints` returns mapped type, invalid resource/action combos error, DefaultSchema degrades to `string`
- [X] T013 [US1] Update existing type tests in `packages/toride/src/__typetests__/engine.test-d.ts` to reflect `buildConstraints` signature changes

**Checkpoint**: Constraint pipeline is fully typed end-to-end. `pnpm exec nx run toride:build && pnpm exec nx run toride:lint` green. Type tests verify correct inference.

---

## Phase 4: User Story 6 — Codegen Generates All Required Type Maps (Priority: P1)

**Goal**: Verify and update `@toride/codegen` so that generated schemas include all maps needed for deep type safety (`permissionMap`, `roleMap`, `resourceAttributeMap`).

**Independent Test**: Run codegen on sample policy, verify output satisfies updated `TorideSchema` and enables all type narrowing features.

### Implementation for User Story 6

- [X] T014 [US6] Review and update `packages/codegen/src/generator.ts` to ensure generated schema emits all required type maps — per data-model.md, no structural changes should be needed, but verify `permissionMap`, `roleMap`, and `resourceAttributeMap` are correctly emitted
- [X] T015 [US6] Update codegen tests in `packages/codegen/src/generator.test.ts` to verify generated output includes all maps and satisfies `TorideSchema` interface

**Checkpoint**: Codegen produces schemas that work with all updated engine/client signatures. `pnpm exec nx run @toride/codegen:build && pnpm exec nx run @toride/codegen:test` green.

---

## Phase 5: User Story 3 — Typed Fields for canField and permittedFields (Priority: P2)

**Goal**: `canField` constrains `field` parameter to `keyof S['resourceAttributeMap'][R] & string`. `permittedFields` returns typed field union array.

**Independent Test**: tsd tests verify field parameter autocomplete, compile errors for invalid field names, correct return types.

### Implementation for User Story 3

- [X] T016 [US3] Update `canField<R>()` signature in `packages/toride/src/field-access.ts` to constrain `field` parameter to `keyof S['resourceAttributeMap'][R] & string`
- [X] T017 [US3] Update `permittedFields<R>()` signature in `packages/toride/src/field-access.ts` to return `Promise<(keyof S['resourceAttributeMap'][R] & string)[]>`
- [X] T018 [US3] Update `canField` and `permittedFields` delegating signatures in `packages/toride/src/engine.ts` to pass through the typed field parameter and return type
- [X] T019 [US3] Add field typing tests in `packages/toride/src/__typetests__/engine.test-d.ts` — test valid/invalid field names, return type of permittedFields, DefaultSchema fallback to `string`

**Checkpoint**: Field-level methods are typed per resource. `pnpm exec nx run toride:build && pnpm exec nx run toride:lint` green.

---

## Phase 6: User Story 4 — Typed Roles from resolvedRoles (Priority: P2)

**Goal**: `resolvedRoles<R>()` returns `S['roleMap'][R][]` instead of `string[]`.

**Independent Test**: tsd tests verify return type narrows per resource.

### Implementation for User Story 4

- [ ] T020 [US4] Update `resolvedRoles<R>()` signature in `packages/toride/src/engine.ts` to return `Promise<S['roleMap'][R][]>`
- [ ] T021 [US4] Add role typing tests in `packages/toride/src/__typetests__/engine.test-d.ts` — test per-resource role return types, DefaultSchema fallback to `string`

**Checkpoint**: Role-related methods are typed per resource. `pnpm exec nx run toride:build && pnpm exec nx run toride:lint` green.

---

## Phase 7: User Story 1 (continued) — Adapter Packages (Priority: P1)

**Goal**: Update `@toride/prisma` and `@toride/drizzle` to accept `TQueryMap` type parameter, enabling per-resource query output typing.

**Independent Test**: Type tests verify adapter returns mapped types when TQueryMap is provided, falls back to base type when not.

### Implementation for Adapters

- [x] T022 [P] [US1] Update `createPrismaAdapter()` in `packages/prisma/src/index.ts` to accept `TQueryMap extends Record<string, PrismaWhere> = Record<string, PrismaWhere>` and return `ConstraintAdapter<TQueryMap>`
- [x] T023 [P] [US1] Update `createDrizzleAdapter()` in `packages/drizzle/src/index.ts` to accept `TQueryMap extends Record<string, DrizzleQuery> = Record<string, DrizzleQuery>` and return `ConstraintAdapter<TQueryMap>`
- [x] T024 [P] [US1] Add adapter type tests in `packages/prisma/src/__typetests__/resolver.test-d.ts` (or new file `adapter.test-d.ts`) — test typed and untyped adapter creation, verify output types
- [x] T025 [P] [US1] Add adapter type tests in `packages/drizzle/src/__typetests__/resolver.test-d.ts` (or new file `adapter.test-d.ts`) — test typed and untyped adapter creation, verify output types

**Checkpoint**: Both adapters accept TQueryMap. `pnpm exec nx run @toride/prisma:build && pnpm exec nx run @toride/drizzle:build` green.

---

## Phase 8: User Story 2 — Per-Resource Action Narrowing on TorideClient (Priority: P1)

**Goal**: `TorideClient.can()` narrows action to `S['permissionMap'][R]`. `permittedActions()` returns per-resource permission array.

**Independent Test**: tsd tests verify invalid action/resource combos produce compile errors on `TorideClient.can()`.

### Implementation for User Story 2

- [x] T026 [US2] Update `TorideClient.can<R>()` signature in `packages/toride/src/client.ts` to narrow action to `S['permissionMap'][R]` with R inferred from `resource.type`
- [x] T027 [US2] Update `TorideClient.permittedActions<R>()` in `packages/toride/src/client.ts` to return `S['permissionMap'][R][]`
- [x] T028 [US2] Update type tests in `packages/toride/src/__typetests__/client.test-d.ts` — test per-resource action narrowing, invalid actions error, permittedActions return type, DefaultSchema backward compat

**Checkpoint**: Client provides per-resource action narrowing. `pnpm exec nx run toride:build && pnpm exec nx run toride:lint` green.

---

## Phase 9: User Story 5 — Typed PermissionSnapshot (Priority: P3)

**Goal**: `PermissionSnapshot<S>` carries schema generic so typed clients preserve type info across serialization boundary.

**Independent Test**: tsd tests verify snapshot type carries schema, TorideClient constructed from typed snapshot preserves types.

### Implementation for User Story 5

- [X] T029 [US5] Update `snapshot()` method signature in `packages/toride/src/engine.ts` to return `Promise<PermissionSnapshot<S>>`
- [X] T030 [US5] Update `TorideClient` constructor in `packages/toride/src/client.ts` to accept `PermissionSnapshot<S>` and preserve schema generic
- [X] T031 [US5] Add snapshot type tests in `packages/toride/src/__typetests__/client.test-d.ts` — test schema generic flows from snapshot through client, DefaultSchema backward compat

**Checkpoint**: Snapshot carries schema type through to client. `pnpm exec nx run toride:build && pnpm exec nx run toride:lint` green.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end validation and cleanup across all packages.

- [ ] T032 [P] Update end-to-end type tests in `packages/toride/src/__typetests__/e2e.test-d.ts` to cover the full typed flow: engine → buildConstraints → translateConstraints → typed adapter output, with all new narrowing features
- [ ] T033 [P] Update `packages/toride/src/__typetests__/schema.test-d.ts` to verify TorideSchema interface completeness with all type maps
- [ ] T034 Run full build across all packages: `pnpm run build`
- [ ] T035 Run full test suite across all packages: `pnpm run test`
- [ ] T036 Run full lint/type check across all packages: `pnpm run lint`
- [ ] T037 Validate quickstart.md examples compile against the updated API (manual review)

**Checkpoint**: All packages build, all tests pass, all type tests pass. Feature is complete.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all subsequent phases
- **US1 Constraint Pipeline (Phase 3)**: Depends on Phase 2
- **US6 Codegen (Phase 4)**: Depends on Phase 2 (verifies generated schemas work with new types)
- **US3 Typed Fields (Phase 5)**: Depends on Phase 2
- **US4 Typed Roles (Phase 6)**: Depends on Phase 2
- **US1 Adapters (Phase 7)**: Depends on Phase 3 (needs ConstraintResult<R> and updated ConstraintAdapter)
- **US2 Client (Phase 8)**: Depends on Phase 2 (needs ClientResourceRef<S,R>)
- **US5 Snapshot (Phase 9)**: Depends on Phase 8 (needs updated TorideClient)
- **Polish (Phase 10)**: Depends on all previous phases

### User Story Dependencies

- **US1 (Constraint Pipeline + Adapters)**: Phases 3 + 7. Adapters depend on core pipeline types.
- **US2 (Client Narrowing)**: Phase 8. Independent of US1 but depends on foundational types.
- **US3 (Typed Fields)**: Phase 5. Independent — only touches field-access and engine.
- **US4 (Typed Roles)**: Phase 6. Independent — only touches engine.
- **US5 (Typed Snapshot)**: Phase 9. Depends on US2 (client must be updated first).
- **US6 (Codegen)**: Phase 4. Independent — verifies codegen output satisfies updated types.

### Within Each Phase

- Type definitions before method signatures
- Method signatures before type tests
- Core package before adapter/downstream packages

### Parallel Opportunities

- Phases 3, 4, 5, 6 can run in parallel after Phase 2 (independent user stories)
- T022/T023 (Prisma/Drizzle adapters) can run in parallel
- T024/T025 (adapter type tests) can run in parallel
- T032/T033 (e2e and schema type tests) can run in parallel

---

## Parallel Example: Phase 7 (Adapters)

```bash
# Launch both adapter updates in parallel:
Task: "Update createPrismaAdapter() in packages/prisma/src/index.ts"
Task: "Update createDrizzleAdapter() in packages/drizzle/src/index.ts"

# Launch both adapter type tests in parallel:
Task: "Add adapter type tests in packages/prisma/src/__typetests__/"
Task: "Add adapter type tests in packages/drizzle/src/__typetests__/"
```

---

## Implementation Strategy

### MVP First (US1 Only — Phases 1-3 + 7)

1. Complete Phase 1: Setup (verify baseline)
2. Complete Phase 2: Foundational types
3. Complete Phase 3: Constraint pipeline typing
4. Complete Phase 7: Adapter packages
5. **STOP and VALIDATE**: Full constraint pipeline is typed end-to-end

### Incremental Delivery

1. Setup + Foundational → Core types ready
2. Add US1 (Phases 3+7) → Typed constraint pipeline (MVP!)
3. Add US6 (Phase 4) → Codegen verified
4. Add US3 (Phase 5) → Typed fields
5. Add US4 (Phase 6) → Typed roles
6. Add US2 (Phase 8) → Typed client
7. Add US5 (Phase 9) → Typed snapshot
8. Polish (Phase 10) → Full validation

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- All changes are type-level only — zero runtime cost
- ConstraintAdapter<TQuery> → ConstraintAdapter<TQueryMap> is a BREAKING CHANGE (minor version bump)
- DefaultSchema must always degrade gracefully to string / Record<string, unknown>
- Commit after each phase checkpoint
