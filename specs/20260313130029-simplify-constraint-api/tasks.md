# Tasks: Simplify Constraint API & Deep Attribute Type Safety

**Input**: Design documents from `specs/20260313130029-simplify-constraint-api/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Strict TDD — test tasks precede implementation. Tests must fail before implementation begins.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup

**Purpose**: No new project initialization needed — this is a modification to an existing monorepo. Setup captures shared foundational type changes that all stories depend on.

- [X] T001 Add `AttributeSchema` discriminated union type (`PrimitiveAttributeSchema | ObjectAttributeSchema | ArrayAttributeSchema`) to `packages/toride/src/types.ts`
- [X] T002 Add `ForbiddenError` class to `packages/toride/src/types.ts` (per contract: actor, action, resourceType fields)
- [X] T003 Export `AttributeSchema` types and `ForbiddenError` from `packages/toride/src/index.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Update the internal `AttributeType` to `AttributeSchema` in the Policy model and valibot schema — all user stories depend on this.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Tests

- [X] T004 [P] Write valibot schema unit tests for `AttributeSchemaNodeSchema` (primitive, object, array, max depth 3, depth 4 rejection) in `packages/toride/src/policy/schema.test.ts` — tests must FAIL
- [X] T005 [P] Write type tests asserting `ResourceBlock.attributes` accepts `Record<string, AttributeSchema>` and rejects `Record<string, string>` in `packages/toride/src/__typetests__/schema.test-d.ts` — tests must FAIL

### Implementation

- [X] T006 Add recursive `AttributeSchemaNodeSchema` valibot schema using `v.lazy()` in `packages/toride/src/policy/schema.ts`
- [X] T007 Update `ResourceBlockSchema` to use `AttributeSchemaNodeSchema` instead of `AttributeTypeSchema` in `packages/toride/src/policy/schema.ts`
- [X] T008 Update `ActorDeclarationSchema` to use `AttributeSchemaNodeSchema` in `packages/toride/src/policy/schema.ts`
- [X] T009 Update `ResourceBlock.attributes` type from `Record<string, AttributeType>` to `Record<string, AttributeSchema>` in `packages/toride/src/types.ts`
- [X] T010 Update `ActorDeclaration.attributes` type from `Record<string, AttributeType>` to `Record<string, AttributeSchema>` in `packages/toride/src/types.ts`
- [X] T011 Verify T004 and T005 tests pass after implementation

**Checkpoint**: `AttributeSchema` type and valibot schema are in place. All downstream stories can begin.

---

## Phase 3: User Story 1 — Simplified buildConstraints Return Type (Priority: P1) 🎯 MVP

**Goal**: Replace the three-way `ConstraintResult` union with `{ ok: true, constraint: Constraint | null } | { ok: false }`.

**Independent Test**: Call `buildConstraints` with unrestricted, constrained, and forbidden scenarios and verify the new return shape.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T012 [P] [US1] Write type tests for new `ConstraintResult` type (ok: true/false discrimination, phantom R type) in `packages/toride/src/__typetests__/constraint-pipeline.test-d.ts` — tests must FAIL
- [X] T013 [P] [US1] Write unit tests for `buildConstraints` returning `{ ok: true, constraint: null }` (unrestricted), `{ ok: true, constraint: <AST> }` (constrained), and `{ ok: false }` (forbidden/never) in `packages/toride/src/partial/constraint-builder.test.ts` — tests must FAIL
- [X] T014 [P] [US1] Write integration tests for `engine.buildConstraints` with new return shape in `packages/toride/src/__integration__/partial-eval.test.ts` — tests must FAIL
- [X] T015 [P] [US1] Write type test asserting `translateConstraints` accepts `Constraint` but NOT the full result object in `packages/toride/src/__typetests__/constraint-pipeline.test-d.ts` — tests must FAIL

### Implementation for User Story 1

- [X] T016 [US1] Replace `ConstraintResult` type definition with `{ ok: true; constraint: Constraint | null } | { ok: false }` in `packages/toride/src/partial/constraint-types.ts`
- [X] T017 [US1] Update `buildConstraints` function return statements to use new shape (`{ ok: false }` for forbidden, `{ ok: true, constraint: null }` for unrestricted, `{ ok: true, constraint }` for constrained) in `packages/toride/src/partial/constraint-builder.ts`
- [X] T018 [US1] Update `Toride.buildConstraints` method signature and return type in `packages/toride/src/engine.ts`
- [X] T019 [US1] Update `Toride.translateConstraints` to accept `Constraint` directly (not `ConstraintResult`) and update error messages in `packages/toride/src/engine.ts`
- [X] T020 [US1] Update translator error messages referencing old sentinels in `packages/toride/src/partial/translator.ts`
- [X] T021 [US1] Update `fireQueryEvent` to derive `resultType` from new `ok`-based result in `packages/toride/src/engine.ts`
- [X] T022 [US1] Update `engine.helpers.test.ts` assertions for new return shape in `packages/toride/src/engine.helpers.test.ts`
- [X] T023 [US1] Update remaining integration tests referencing old `ConstraintResult` shape in `packages/toride/src/__integration__/partial-eval.test.ts`
- [X] T024 [US1] Verify T012–T015 tests pass after implementation

**Checkpoint**: `buildConstraints` returns the new `ok`-based result. All existing tests updated and passing.

---

## Phase 4: User Story 2 — Nested Attribute Type Declarations in YAML (Priority: P2)

**Goal**: YAML parser supports nested objects, primitive arrays (`string[]`), and arrays of objects (`type: array` + `items`). Max depth 3.

**Independent Test**: Load YAML policies with nested attributes and verify parsed `Policy` objects contain correct `AttributeSchema` structures.

### Tests for User Story 2

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T025 [P] [US2] Write parser unit tests for YAML shorthand normalization (`string[]` → array schema, nested objects, array-of-objects, depth 4 rejection, `type` key disambiguation) in `packages/toride/src/policy/parser.test.ts` — tests must FAIL
- [X] T026 [P] [US2] Write parser unit tests for JSON loading with nested attribute schema (no shorthand, explicit `{ type: "array", items: ... }` form) in `packages/toride/src/policy/parser.test.ts` — tests must FAIL
- [X] T027 [P] [US2] Write validator unit test ensuring existing flat attributes continue to pass validation in `packages/toride/src/policy/validator.test.ts` — tests must FAIL (if new validation logic is needed)

### Implementation for User Story 2

- [X] T028 [US2] Add YAML attribute normalization function (`normalizeAttributes`) to `packages/toride/src/policy/parser.ts` — converts `string[]` shorthand, nested objects, and `type: array` + `items` to canonical `AttributeSchema` form with depth enforcement (max 3)
- [X] T029 [US2] Wire `normalizeAttributes` into `loadYaml` pre-processing pipeline in `packages/toride/src/policy/parser.ts`
- [X] T030 [US2] Wire `normalizeAttributes` into `loadJson` loading path in `packages/toride/src/policy/parser.ts` (no shorthand, but still normalize nested objects to `AttributeSchema`)
- [X] T031 [US2] Update existing policy merger to handle `AttributeSchema` instead of `AttributeType` in `packages/toride/src/policy/merger.ts`
- [X] T032 [US2] Verify T025–T027 tests pass after implementation

**Checkpoint**: YAML and JSON policies with nested attributes load correctly. Flat attributes unchanged.

---

## Phase 5: User Story 3 — Codegen Generates Nested TypeScript Types (Priority: P3)

**Goal**: `@toride/codegen` generates nested TypeScript interfaces and array types from `AttributeSchema`.

**Independent Test**: Run codegen on a YAML policy with nested attributes and verify the generated `.ts` file contains correct nested types.

**Depends on**: US2 (nested attributes must parse correctly before codegen can consume them)

### Tests for User Story 3

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T033 [P] [US3] Write codegen unit tests for nested object attributes → `{ address: { city: string; zip: string } }` in `packages/codegen/src/generator.test.ts` — tests must FAIL
- [X] T034 [P] [US3] Write codegen unit tests for primitive array attributes → `{ tags: string[] }` in `packages/codegen/src/generator.test.ts` — tests must FAIL
- [X] T035 [P] [US3] Write codegen unit tests for array-of-objects attributes → `{ members: Array<{ id: string; role: string }> }` in `packages/codegen/src/generator.test.ts` — tests must FAIL
- [X] T036 [P] [US3] Write codegen unit test for mixed flat + nested attributes in `packages/codegen/src/generator.test.ts` — tests must FAIL

### Implementation for User Story 3

- [X] T037 [US3] Add recursive `generateAttributeType` function to `packages/codegen/src/generator.ts` — handles `kind: 'primitive'`, `kind: 'object'` (inline `{ field: type; ... }`), and `kind: 'array'` (`Array<...>`)
- [X] T038 [US3] Update `generateAttributeFields` to use `generateAttributeType` for each field in `packages/codegen/src/generator.ts`
- [X] T039 [US3] Update `ResourceAttributeMap` generation to use new recursive type generation in `packages/codegen/src/generator.ts`
- [X] T040 [US3] Update `ActorAttributeMap` generation to use new recursive type generation in `packages/codegen/src/generator.ts`
- [X] T041 [US3] Verify T033–T036 tests pass after implementation

**Checkpoint**: Codegen produces correctly typed nested TypeScript interfaces and arrays.

---

## Phase 6: User Story 4 — Typed Resolver Return Values (Priority: P4)

**Goal**: `ResourceResolver` return type changes from `Promise<Record<string, unknown>>` to `Promise<Partial<S['resourceAttributeMap'][R]>>`.

**Independent Test**: tsd type tests verify resolver return type matches the schema's attribute shape.

**Depends on**: US3 (codegen must generate correct types for the resolver to reference)

### Tests for User Story 4

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T042 [P] [US4] Write type test: resolver for typed engine must return correct attribute shape in `packages/toride/src/__typetests__/resolvers.test-d.ts` — tests must FAIL
- [ ] T043 [P] [US4] Write type test: resolver for typed engine rejects wrong return type in `packages/toride/src/__typetests__/resolvers.test-d.ts` — tests must FAIL
- [ ] T044 [P] [US4] Write type test: resolver for default (untyped) engine accepts `Record<string, unknown>` in `packages/toride/src/__typetests__/resolvers.test-d.ts` — tests must FAIL

### Implementation for User Story 4

- [ ] T045 [US4] Update `ResourceResolver` return type from `Promise<Record<string, unknown>>` to `Promise<Partial<S['resourceAttributeMap'][R]>>` in `packages/toride/src/types.ts`
- [ ] T046 [US4] Update `AttributeCache` internal types to use `Partial<S['resourceAttributeMap'][R]>` if needed in `packages/toride/src/evaluation/cache.ts`
- [ ] T047 [US4] Update mock resolver types in `packages/toride/src/testing/mock-resolver.ts`
- [ ] T048 [US4] Verify T042–T044 tests pass after implementation

**Checkpoint**: Resolver return types are fully typed. Compile-time errors catch mismatches.

---

## Phase 7: User Story 5 — Strict Dot-Path Validation in Policy Validator (Priority: P5)

**Goal**: Policy validator checks `$resource.*` and `$actor.*` dot-paths in conditions against declared `AttributeSchema`, rejecting invalid paths and array traversal.

**Independent Test**: Load policies with valid/invalid dot-paths and verify validation passes/fails correctly.

**Depends on**: US2 (nested attributes must be in `Policy` for the validator to check against)

### Tests for User Story 5

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T049 [P] [US5] Write validator test: `$resource.address.city` passes when `address: { city: string }` declared in `packages/toride/src/policy/validator.test.ts` — tests must FAIL
- [ ] T050 [P] [US5] Write validator test: `$resource.address.zipcode` fails when undeclared in `packages/toride/src/policy/validator.test.ts` — tests must FAIL
- [ ] T051 [P] [US5] Write validator test: `$resource.members.role` rejected (array traversal) in `packages/toride/src/policy/validator.test.ts` — tests must FAIL
- [ ] T052 [P] [US5] Write validator test: `$actor.department` passes when declared, `$env.anything` exempt in `packages/toride/src/policy/validator.test.ts` — tests must FAIL
- [ ] T053 [P] [US5] Write strict validator test: nested dot-path warnings for undeclared paths in `packages/toride/src/policy/strict-validator.test.ts` — tests must FAIL

### Implementation for User Story 5

- [ ] T054 [US5] Add `resolveAttributePath` helper function that walks an `AttributeSchema` tree following a dot-path, returning the terminal schema or null in `packages/toride/src/policy/validator.ts`
- [ ] T055 [US5] Add `extractResourceAttributes` function (mirrors existing `extractActorAttributes`) that collects all `$resource.*` paths from condition expressions in `packages/toride/src/policy/validator.ts`
- [ ] T056 [US5] Add `validateResourceAttributeRefs` function that validates `$resource.*` dot-paths against the resource's `AttributeSchema` in `packages/toride/src/policy/validator.ts`
- [ ] T057 [US5] Update `validateActorAttributeRefs` to validate full nested dot-paths (not just top-level) against actor's `AttributeSchema` in `packages/toride/src/policy/validator.ts`
- [ ] T058 [US5] Wire `validateResourceAttributeRefs` into `collectErrors` for all condition expressions (derived_roles.when, rules.when) in `packages/toride/src/policy/validator.ts`
- [ ] T059 [US5] Verify T049–T053 tests pass after implementation

**Checkpoint**: All dot-path references in conditions are validated against declared attribute schemas.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Adapter updates, JSON Schema, benchmark fixture updates, and final validation.

- [ ] T060 [P] Update `@toride/drizzle` peer dependency version to new major in `packages/drizzle/package.json`
- [ ] T061 [P] Update `@toride/prisma` peer dependency version to new major in `packages/prisma/package.json`
- [ ] T062 [P] Update JSON Schema generation (`scripts/generate-schema.mjs`) to handle recursive `AttributeSchemaNodeSchema` via `v.lazy()` and produce `$defs/AttributeSchema`
- [ ] T063 [P] Update `packages/toride/src/generate-schema.test.ts` snapshot and assertions for new attribute schema in JSON Schema output
- [ ] T064 [P] Update benchmark YAML fixtures (`packages/toride/bench/fixtures/`) to use `AttributeSchema`-compatible attribute declarations
- [ ] T065 [P] Update `packages/toride/src/snapshot.test.ts` if it references old `ConstraintResult` shape
- [ ] T066 Run full monorepo build (`pnpm run build`) and verify all packages compile
- [ ] T067 Run full monorepo test suite (`pnpm run test`) and verify all tests pass
- [ ] T068 Run full monorepo lint (`pnpm run lint`) and verify no type errors
- [ ] T069 Run quickstart.md validation — execute code snippets from `specs/20260313130029-simplify-constraint-api/quickstart.md` against the updated API

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 — can start immediately after
- **US2 (Phase 4)**: Depends on Phase 2 — can run in parallel with US1
- **US3 (Phase 5)**: Depends on US2 — must wait for YAML schema
- **US4 (Phase 6)**: Depends on US3 — must wait for codegen types
- **US5 (Phase 7)**: Depends on US2 — can run in parallel with US3/US4
- **Polish (Phase 8)**: Depends on all user stories being complete

### User Story Dependencies

```text
Phase 1 → Phase 2 → ┬→ US1 (P1) ──────────────────────┐
                     │                                   │
                     └→ US2 (P2) → US3 (P3) → US4 (P4) ─┤→ Phase 8
                     │                                   │
                     └→ US2 (P2) → US5 (P5) ────────────┘
```

- **US1** and **US2** can run in parallel after Phase 2
- **US3** and **US5** can run in parallel after US2 completes
- **US4** must wait for US3

### Parallel Opportunities

Within each user story phase, all test tasks (`[P]`) can run in parallel. Then implementation tasks run sequentially within that story.

Across stories:
- US1 ∥ US2 (after Phase 2)
- US3 ∥ US5 (after US2)
- All Phase 8 `[P]` tasks can run in parallel

---

## Parallel Example: User Story 1

```bash
# Launch all US1 test tasks in parallel:
T012: Type tests for new ConstraintResult
T013: Unit tests for buildConstraints new shape
T014: Integration tests for engine.buildConstraints
T015: Type test for translateConstraints signature

# Then implement sequentially:
T016 → T017 → T018 → T019 → T020 → T021 → T022 → T023 → T024
```

## Parallel Example: User Story 2

```bash
# Launch all US2 test tasks in parallel:
T025: Parser tests for YAML shorthand
T026: Parser tests for JSON loading
T027: Validator tests for flat attributes

# Then implement sequentially:
T028 → T029 → T030 → T031 → T032
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T003)
2. Complete Phase 2: Foundational (T004–T011)
3. Complete Phase 3: User Story 1 (T012–T024)
4. **STOP and VALIDATE**: Test US1 independently — `buildConstraints` returns new shape
5. Can demo the simplified API at this point

### Incremental Delivery

1. Setup + Foundational → AttributeSchema type in place
2. US1 → Simplified ConstraintResult (MVP!)
3. US2 → Nested YAML attributes parse correctly
4. US3 → Codegen produces nested TypeScript types
5. US4 → Resolver return types are fully typed
6. US5 → Dot-path validation catches typos
7. Polish → Adapters, JSON Schema, benchmarks, final validation
8. Ship as semver major version

### Suggested takt Usage

```bash
# Phase 1: Setup
takt run coder "Phase 1: Add AttributeSchema type, ForbiddenError class, and exports to packages/toride/src/types.ts and index.ts"

# Phase 2: Foundational
takt run coder "Phase 2: Add recursive AttributeSchemaNodeSchema to valibot schema, update ResourceBlock and ActorDeclaration types — strict TDD"

# Phase 3: US1
takt run coder "Phase 3 US1: Replace ConstraintResult with ok-based result type — strict TDD, test tasks T012-T015 first then implement T016-T024"

# Phase 4: US2
takt run coder "Phase 4 US2: Add YAML shorthand normalization and nested attribute parsing — strict TDD, test tasks T025-T027 first then implement T028-T032"

# Phase 5: US3
takt run coder "Phase 5 US3: Update codegen to generate nested TypeScript types from AttributeSchema — strict TDD, test tasks T033-T036 first then implement T037-T041"

# Phase 6: US4
takt run coder "Phase 6 US4: Update ResourceResolver return type to Partial<S['resourceAttributeMap'][R]> — strict TDD, test tasks T042-T044 first then implement T045-T048"

# Phase 7: US5
takt run coder "Phase 7 US5: Add dot-path validation in policy validator — strict TDD, test tasks T049-T053 first then implement T054-T059"

# Phase 8: Polish
takt run coder "Phase 8: Update adapter peer deps, JSON Schema generation, benchmark fixtures, run full build/test/lint"
```

---

## Notes

- [P] tasks = different files, no dependencies — can run in parallel
- [USn] label maps task to specific user story for traceability
- Strict TDD: all test tasks must be written and FAIL before implementation begins
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Total tasks: 69
