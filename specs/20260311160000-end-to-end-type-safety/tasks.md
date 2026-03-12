# Tasks: End-to-End Type Safety

**Input**: Design documents from `specs/20260311160000-end-to-end-type-safety/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Bundled into implementation tasks (TDD — write tests first within each task, verify they fail, then implement).

**Organization**: Tasks follow the plan's bottom-up phase structure (schema extension → core types → engine generics → codegen → client → integrations → polish). Each phase maps to the user stories it serves.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US4)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Install type-testing tooling and create the `__typetests__/` directory structure.

- [X] T001 Add `tsd` as a dev dependency to `packages/toride` and configure type-test script in `packages/toride/package.json`
- [X] T002 [P] Create `packages/toride/src/__typetests__/` directory with a trivial smoke type test to verify tsd works

**Checkpoint**: `pnpm exec nx run toride:test` passes and tsd type-test infrastructure is functional

---

## Phase 2: Policy Schema Extension — Resource Attributes (US2, US4)

**Purpose**: Add optional `attributes` declaration to resource blocks in the policy schema. This is the foundational layer that enables typed resource attributes in resolvers (US2) and codegen output (US4).

**Independent Test**: Parse a policy with resource `attributes: { status: string }`, verify it passes validation. Parse one with `attributes: { status: invalid }`, verify it fails.

- [X] T003 [US2] Add `attributes` field to `ResourceBlockSchema` (valibot) in `packages/toride/src/policy/schema.ts` — optional `v.record(v.string(), AttributeTypeSchema)` reusing existing `AttributeTypeSchema`
- [X] T004 [US2] Update policy validator to validate resource attribute declarations in `packages/toride/src/policy/validator.ts` — reject invalid types, accept valid ones, ensure existing policies without attributes still pass
- [X] T005 [P] [US2] Add runtime tests for resource attributes in `packages/toride/src/policy/validator.test.ts` — policy with attributes parses, without attributes works, invalid types rejected
- [X] T006 [P] [US2] Update parser if needed in `packages/toride/src/policy/parser.ts` to pass through resource attributes from YAML

**Checkpoint**: Policy YAML with resource `attributes` parses and validates. Existing policy fixtures unchanged.

---

## Phase 3: Core TorideSchema + Generic Refs (US1, US2, US3)

**Purpose**: Define `TorideSchema` interface, `DefaultSchema`, and make `ActorRef`, `ResourceRef`, `Resolvers`, `TorideOptions`, `BatchCheckItem`, `ExplainResult` generic with default params. This is the foundational type layer that US1 (typed checks), US2 (typed resolvers), and US3 (typed actors) all depend on.

**Independent Test**: `ActorRef` without params equals current shape. `ActorRef<GeneratedSchema>` is a discriminated union. `ResourceRef<GeneratedSchema, "Document">` has typed attributes. Invalid types produce `@ts-expect-error`.

- [ ] T007 [US1] Define `TorideSchema` interface and `DefaultSchema` type in `packages/toride/src/types.ts` per contract `contracts/core-schema.ts`
- [ ] T008 [US3] Make `ActorRef<S>` a generic discriminated union type in `packages/toride/src/types.ts` — default param `DefaultSchema` preserves current shape
- [ ] T009 [US1] Make `ResourceRef<S, R>` generic with typed `attributes` in `packages/toride/src/types.ts` — default params preserve current shape
- [ ] T010 [US2] Make `Resolvers<S>` a generic mapped type in `packages/toride/src/types.ts` — resolver keys narrowed to resource names, return types match `resourceAttributeMap`
- [ ] T011 [US1] Make `TorideOptions<S>`, `BatchCheckItem<S>`, `ExplainResult<S, R>` generic in `packages/toride/src/types.ts`
- [ ] T012 [P] [US1] Write type tests in `packages/toride/src/__typetests__/schema.test-d.ts` — verify DefaultSchema collapses, typed ActorRef is discriminated union, typed ResourceRef has attributes, invalid types error
- [ ] T013 Export new types (`TorideSchema`, `DefaultSchema`) from `packages/toride/src/index.ts`

**Checkpoint**: All new generic types compile. Type tests pass. All existing runtime tests pass unchanged (`pnpm exec nx run toride:test`).

---

## Phase 4: Engine Method Generics (US1, US5)

**Purpose**: Make `Toride<S>` class generic. All methods (`can`, `explain`, `canBatch`, `permittedActions`, `buildConstraints`, `canField`, `permittedFields`, `resolvedRoles`, `snapshot`) gain type narrowing per contract `contracts/engine-api.ts`. This implements US1 (typed `can()`) and US5 (typed batch/explain/other methods).

**Independent Test**: `can(actor, "read", { type: "Document", ... })` compiles. `can(actor, "reed", ...)` errors. `explain()` return has typed `grantedPermissions`. `permittedActions()` returns typed array.

- [X] T014 [US1] Make `Toride<S extends TorideSchema = DefaultSchema>` class generic in `packages/toride/src/engine.ts` — add type parameter, update constructor to accept `TorideOptions<S>`
- [X] T015 [US1] Add generic signatures to `can<R>()` and `explain<R>()` in `packages/toride/src/engine.ts` — action narrowed to `S["permissionMap"][R]`, resource typed as `ResourceRef<S, R>`
- [X] T016 [US5] Add generic signatures to `canBatch()`, `permittedActions<R>()`, `buildConstraints<R>()` in `packages/toride/src/engine.ts` — batch uses global `S["actions"]`, others narrow per resource
- [X] T017 [US5] Add generic signatures to `canField<R>()`, `permittedFields<R>()`, `resolvedRoles<R>()`, `snapshot()` in `packages/toride/src/engine.ts`
- [X] T018 [P] [US5] Make `SnapshotEngine` interface generic in `packages/toride/src/snapshot.ts`
- [X] T019 [P] [US5] Make `FieldAccessEngine` interface generic in `packages/toride/src/field-access.ts`
- [X] T020 [US1] Make `createToride<S>()` factory function generic in `packages/toride/src/engine.ts`
- [X] T021 [P] [US1] Write type tests in `packages/toride/src/__typetests__/engine.test-d.ts` — verify can(), explain(), permittedActions() type narrowing, @ts-expect-error on typos
- [X] T022 [P] [US2] Write type tests in `packages/toride/src/__typetests__/resolvers.test-d.ts` — verify resolver return type enforcement, resolver key narrowing

**Checkpoint**: Engine class is fully generic. Type tests pass. All existing runtime tests pass unchanged (`pnpm exec nx run toride:test`).

---

## Phase 5: Codegen Updates (US4)

**Purpose**: Update `@toride/codegen` to generate `ActorTypes`, `ActorAttributeMap`, `ResourceAttributeMap`, `GeneratedSchema`, and typed `ResolverMap` per contract `contracts/codegen-output.ts`.

**Independent Test**: Run codegen on a sample policy with resource attributes → output contains all new type maps. Output compiles as valid TypeScript.

- [X] T023 [US4] Generate `ActorTypes` union type in `packages/codegen/src/generator.ts` — union of all actor type name literals
- [X] T024 [US4] Generate `ActorAttributeMap` interface in `packages/codegen/src/generator.ts` — per-actor typed attributes from actor declarations
- [X] T025 [US4] Generate `ResourceAttributeMap` interface in `packages/codegen/src/generator.ts` — per-resource typed attributes from new resource `attributes` declarations, fallback `Record<string, unknown>` for resources without attributes
- [X] T026 [US4] Generate `GeneratedSchema extends TorideSchema` interface in `packages/codegen/src/generator.ts` — aggregates Resources, Actions, ActorTypes, PermissionMap, RoleMap, ResourceAttributeMap, ActorAttributeMap, RelationMap
- [X] T027 [US4] Update `ResolverMap` generation to use typed return values from `ResourceAttributeMap` in `packages/codegen/src/generator.ts`
- [X] T028 [US4] Add `import type { TorideSchema } from "toride"` to codegen output header in `packages/codegen/src/generator.ts`
- [X] T029 [P] [US4] Update codegen tests in `packages/codegen/src/generator.test.ts` — verify new types in output, existing types preserved, output compiles

**Checkpoint**: Codegen produces complete `GeneratedSchema` for a sample policy. All existing codegen tests pass (`pnpm exec nx run @toride/codegen:test`).

---

## Phase 6: Client Type Safety (US6)

**Purpose**: Make `TorideClient<S>` generic per contract `contracts/client-api.ts`.

**Independent Test**: `TorideClient<GeneratedSchema>.can("read", { type: "Document", id: "1" })` compiles. `can("reed", ...)` errors.

- [x] T030 [US6] Make `TorideClient<S extends TorideSchema = DefaultSchema>` generic in `packages/toride/src/client.ts` — `can()` action narrowed to `S["actions"]`, resource.type narrowed to `S["resources"]`
- [x] T031 [US6] Update `permittedActions()` return type to `S["actions"][]` in `packages/toride/src/client.ts`
- [x] T032 [P] [US6] Write type tests in `packages/toride/src/__typetests__/client.test-d.ts` — verify typed can(), invalid action errors, default schema backward compat

**Checkpoint**: TorideClient is generic. Type tests pass. All existing client runtime tests pass (`pnpm exec nx run toride:test`).

---

## Phase 7: Integration Package Type Safety (US7)

**Purpose**: Make `@toride/drizzle` and `@toride/prisma` resolver/adapter factories generic per contract `contracts/integration-api.ts`.

**Independent Test**: `createDrizzleResolver<GeneratedSchema, "Document">(db, table)` constrains return type. Invalid resource type errors.

- [ ] T033 [P] [US7] Make `createDrizzleResolver<S, R>()` generic in `packages/drizzle/src/index.ts` — resource type param narrows return type to `S["resourceAttributeMap"][R]`
- [ ] T034 [P] [US7] Make `createPrismaResolver<S, R>()` generic in `packages/prisma/src/index.ts` — resource type param narrows return type to `S["resourceAttributeMap"][R]`
- [ ] T035 [P] [US7] Add type tests for Drizzle resolver in `packages/drizzle/src/` — typed return shape, invalid resource errors
- [ ] T036 [P] [US7] Add type tests for Prisma resolver in `packages/prisma/src/` — typed return shape, invalid resource errors

**Checkpoint**: Integration factories are generic. All existing integration tests pass (`pnpm exec nx run @toride/drizzle:test && pnpm exec nx run @toride/prisma:test`).

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end validation, export cleanup, full test suite green.

- [ ] T037 [P] Write end-to-end type test in `packages/toride/src/__typetests__/e2e.test-d.ts` — codegen output → `Toride<GeneratedSchema>` → typed `can()` → typed `permittedActions()` → `TorideClient<GeneratedSchema>`
- [ ] T038 Run `pnpm run build` across all packages — verify clean compilation
- [ ] T039 Run `pnpm run test` across all packages — verify all runtime tests pass
- [ ] T040 Run `pnpm run lint` across all packages — verify no type errors
- [ ] T041 Verify all new types are exported from `packages/toride/src/index.ts` — `TorideSchema`, `DefaultSchema`, and updated generic types

**Checkpoint**: Full monorepo builds, tests, and lints cleanly. End-to-end type flow works.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Policy Schema)**: No dependencies — can run after/parallel with Phase 1
- **Phase 3 (Core Types)**: Depends on Phase 2 (ResourceBlock.attributes must exist)
- **Phase 4 (Engine Generics)**: Depends on Phase 3 (generic types must exist)
- **Phase 5 (Codegen)**: Depends on Phase 3 (TorideSchema interface for `extends`)
- **Phase 6 (Client)**: Depends on Phase 3 (TorideSchema, DefaultSchema)
- **Phase 7 (Integrations)**: Depends on Phase 3 (TorideSchema) + Phase 5 (codegen for test fixtures)
- **Phase 8 (Polish)**: Depends on all previous phases

### Critical Path

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 8
                         ↓
                    Phase 5 → Phase 7 → Phase 8
                         ↓
                    Phase 6 → Phase 8
```

### User Story to Phase Mapping

| User Story | Priority | Phases |
|------------|----------|--------|
| US1 - Typed Authorization Checks | P1 | 3, 4 |
| US2 - Typed Resource Attributes in Resolvers | P1 | 2, 3, 4 |
| US3 - Typed Actor Refs | P2 | 3 |
| US4 - Codegen Produces Complete Schema | P1 | 2, 5 |
| US5 - Typed Batch/Explain/Other Methods | P2 | 4 |
| US6 - Typed Client-Side Permission Checks | P3 | 6 |
| US7 - Typed Integration Packages | P3 | 7 |

### Parallel Opportunities (after each phase completes)

After Phase 3 completes:
- Phase 4, Phase 5, and Phase 6 can all start (if multiple developers available)

After Phase 5 completes:
- Phase 7 can start

### Within Each Phase

- Write type tests / runtime tests first (TDD)
- Types/interfaces before implementations
- Core changes before downstream consumers
- Verify existing tests still pass at each checkpoint

---

## Parallel Example: Phase 3 (Core Types)

```bash
# These can run in parallel (different files or independent concerns):
Task T012: "Type tests in __typetests__/schema.test-d.ts"
Task T008: "ActorRef generic in types.ts" (independent mapped type)

# These must be sequential:
Task T007: "TorideSchema + DefaultSchema" → T009: "ResourceRef generic" → T010: "Resolvers generic" → T011: "Options/Batch/Explain generic"
```

---

## Implementation Strategy

### MVP First (US1 + US4)

1. Complete Phase 1: Setup (tsd tooling)
2. Complete Phase 2: Policy schema extension
3. Complete Phase 3: Core TorideSchema + generic refs
4. Complete Phase 4: Engine method generics
5. Complete Phase 5: Codegen updates
6. **STOP and VALIDATE**: `can()` calls are typed, codegen produces GeneratedSchema

### Incremental Delivery

1. Setup + Policy Schema + Core Types → Foundation ready
2. Add Engine Generics → US1 + US5 done → Typed authorization checks work
3. Add Codegen → US4 done → End-to-end codegen-to-engine flow
4. Add Client → US6 done → Frontend type safety
5. Add Integrations → US7 done → Drizzle/Prisma type safety
6. Polish → Full validation

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks in same phase
- [Story] label maps task to user story for traceability
- TDD: within each task, write tests first, verify failure, then implement
- All type changes are compile-time only — runtime behavior MUST NOT change
- Commit after each phase checkpoint
- This is a major version bump — breaking changes are expected and acceptable
