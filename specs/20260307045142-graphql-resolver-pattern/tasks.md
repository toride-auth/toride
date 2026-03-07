# Tasks: GraphQL Resolver Pattern for Authorization

**Input**: Design documents from `/specs/20260307045142-graphql-resolver-pattern/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Combined with implementation tasks (TDD within each task — write failing test, then implement).

**Organization**: Tasks grouped by user story. Feature-slice granularity (one logical change per task).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: No new project setup needed — existing monorepo. Prepare branch for breaking changes.

- [X] T001 Verify all 4 packages build and test green before starting changes: `pnpm run build && pnpm run test`

---

## Phase 2: Foundational (Core Type Changes)

**Purpose**: Modify shared types that ALL user stories depend on. These changes will temporarily break compilation — that's expected for a pre-1.0 clean break.

**CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 Redefine `ResourceRef` to add optional `attributes` field, create `ResourceResolver` and `Resolvers` types, remove `RelationResolver` interface, update `TorideOptions` to accept `resolvers?: Resolvers` instead of `resolver: RelationResolver` in `packages/toride/src/types.ts`
- [X] T003 Change `RelationDef` from `{ resource: string; cardinality: "one" | "many" }` to a plain string (target type name), update `ResourceBlock.relations` type to `Record<string, string>` in `packages/toride/src/types.ts`
- [X] T004 Update `TestCase` type: remove `roles` and `relations` fields, add `resolvers?: Record<string, Record<string, unknown>>` field in `packages/toride/src/types.ts`
- [X] T005 Update valibot schemas: `RelationDefSchema` → string, `ResourceBlockSchema.relations` → `Record<string, string>`, `TestCaseSchema` to match new `TestCase` type in `packages/toride/src/policy/schema.ts`
- [X] T006 Update policy validator for new relation syntax (string values instead of objects) in `packages/toride/src/policy/validator.ts`
- [X] T007 Rewrite `ResolverCache` as `AttributeCache`: accept `Resolvers` map, implement `resolve(ref, policy)` that merges inline attributes with resolver results (inline wins), cache by `${type}:${id}` in `packages/toride/src/evaluation/cache.ts`
- [X] T008 Update public exports: remove `RelationResolver` and `RelationDef` type exports, add `ResourceResolver`, `Resolvers` exports in `packages/toride/src/index.ts`

**Checkpoint**: Types compile (`pnpm exec nx run toride:lint`). Tests will be broken — that's expected. The new type surface is in place for user story implementation.

---

## Phase 3: User Story 1 — Per-Type Attribute Resolver (Priority: P1) MVP

**Goal**: Engine accepts a `resolvers` map and calls the correct per-type resolver during policy evaluation.

**Independent Test**: Create engine with per-type resolvers, verify correct resolver called per resource type, verify no error when resolver missing for a type.

- [ ] T009 [US1] Update `Toride` class constructor and `evaluateInternal` to use `Resolvers` map and `AttributeCache` instead of `RelationResolver` and `ResolverCache` in `packages/toride/src/engine.ts`
- [ ] T010 [US1] Update `evaluate()` function signature to accept `AttributeCache` instead of `RelationResolver`, pass through to role resolution and condition evaluation in `packages/toride/src/evaluation/rule-engine.ts`
- [ ] T011 [US1] Rewrite `createMockResolver` to construct mock resolver data from new `TestCase.resolvers` field (keyed by `Type:id`) in `packages/toride/src/testing/mock-resolver.ts`
- [ ] T012 [US1] Write integration tests for US1 acceptance scenarios: correct resolver called per type, trivial resolver for unregistered types, engine works with no resolvers + inline attributes in `packages/toride/src/__tests__/` (new test file)

**Checkpoint**: Engine accepts `resolvers` map. Per-type dispatch works. `pnpm exec nx run toride:test` passes for US1 scenarios.

---

## Phase 4: User Story 2 — Inline Attributes on ResourceRef (Priority: P1)

**Goal**: Inline attributes on ResourceRef are used first; resolver only called for missing fields.

**Independent Test**: Provide inline attributes, verify resolver never called. Provide partial inline, verify resolver fills gaps without overwriting inline.

- [X] T013 [US2] Implement inline-first resolution in `AttributeCache.resolve()`: check `ref.attributes` before calling resolver, merge results with inline precedence in `packages/toride/src/evaluation/cache.ts`
- [X] T014 [US2] Update `resolveResourcePath` in condition evaluator to use `AttributeCache` for attribute lookups instead of direct `resolver.getAttributes()` calls in `packages/toride/src/evaluation/condition.ts`
- [X] T015 [US2] Write integration tests for US2 acceptance scenarios: inline-only (zero resolver calls), partial inline + resolver merge, trivial resolver (no resolver + no inline = undefined) in `packages/toride/src/__tests__/` (extend or new test file)

**Checkpoint**: Inline attributes work. Zero resolver calls when all data provided inline. `pnpm exec nx run toride:test` passes for US2 scenarios.

---

## Phase 5: User Story 3 — Relation Resolution via Attributes (Priority: P1)

**Goal**: Relations expressed as ResourceRef values in attributes, traversed lazily through relation declarations.

**Independent Test**: Define relation in YAML, provide ResourceRef in attributes, verify nested attribute access (`$resource.org.plan`) works.

- [X] T016 [US3] Implement relation recognition in `AttributeCache`: when a field matches a declared relation AND value has `type`/`id`, treat as ResourceRef and recursively resolve nested attributes in `packages/toride/src/evaluation/cache.ts`
- [X] T017 [US3] Implement cascading inline attributes: extra fields beyond `type`/`id` on a relation-target ResourceRef treated as inline attributes for that referenced resource in `packages/toride/src/evaluation/cache.ts`
- [X] T018 [US3] Implement FR-016 strict validation: when a resolver returns a non-ResourceRef value for a declared relation field, throw `ValidationError` in `packages/toride/src/evaluation/cache.ts`
- [X] T019 [US3] Rewrite `resolveResourcePath` to traverse relations via attributes (inline + resolver) instead of `getRelated()`, support multi-level paths like `$resource.org.parent` in `packages/toride/src/evaluation/condition.ts`
- [X] T020 [US3] Write integration tests for US3 acceptance scenarios: relation via inline ResourceRef, cascading inline attributes on nested ResourceRef, multi-level lazy traversal, FR-016 validation error for bad resolver relation values in `packages/toride/src/__tests__/` (extend or new test file)

**Checkpoint**: Relation traversal via attributes works end-to-end. `$resource.org.plan` resolves correctly. `pnpm exec nx run toride:test` passes for US3 scenarios.

---

## Phase 6: User Story 4 — Declarative Role Derivation Without getRoles (Priority: P2)

**Goal**: All roles derived through `derived_roles` in policy YAML using attribute-based conditions. No `getRoles` callback.

**Independent Test**: Define derived_roles with `when` conditions and `from_role + on_relation`, verify correct role assignment without any getRoles function.

- [ ] T021 [US4] Rewrite `resolveRoles` and `resolveDirectRoles` in role-resolver: remove all `getRoles()` calls, derive roles entirely from `derived_roles` entries evaluated against attributes (via `AttributeCache`) in `packages/toride/src/evaluation/role-resolver.ts`
- [ ] T022 [US4] Update Pattern 2 (`from_role + on_relation`) to resolve relation targets from attributes instead of `getRelated()`, check actor roles on related resource via `derived_roles` recursion in `packages/toride/src/evaluation/role-resolver.ts`
- [ ] T023 [US4] Update Pattern 3 (`from_relation`) to resolve relation identity from attributes instead of `getRelated()` in `packages/toride/src/evaluation/role-resolver.ts`
- [ ] T024 [P] [US4] Update Pattern 4 and 5 (`when` conditions) to evaluate against resource attributes (via `AttributeCache`) in addition to actor attributes in `packages/toride/src/evaluation/role-resolver.ts`
- [ ] T025 [US4] Update `buildConstraints` derived role evaluation to work with new relation model (attributes instead of `getRelated`) in `packages/toride/src/partial/constraint-builder.ts`
- [ ] T026 [US4] Write integration tests for US4 acceptance scenarios: owner via `$resource.owner_id eq $actor.id`, inherited role via `from_role + on_relation`, migration from `getRoles` to attribute-based conditions in `packages/toride/src/__tests__/` (extend or new test file)

**Checkpoint**: All 5 derived role patterns work with attribute-based resolution. No `getRoles` anywhere. `pnpm exec nx run toride:test` passes for US4 scenarios.

---

## Phase 7: User Story 5 — Simplified Relation Declarations (Priority: P2)

**Goal**: Relations declared with just a type name (`org: Organization`) instead of `{ resource: Organization, cardinality: one }`.

**Independent Test**: Write policy with simplified syntax, verify it loads and evaluates correctly. Write policy with old syntax, verify it's rejected with clear error.

- [ ] T027 [US5] Update policy parser to handle string-only relation values (already changed in schema, ensure YAML parsing works end-to-end) in `packages/toride/src/policy/parser.ts`
- [ ] T028 [US5] Add validation error for old relation syntax (`{ resource: ..., cardinality: ... }`) with clear migration message in `packages/toride/src/policy/validator.ts`
- [ ] T029 [US5] Update all references to `relationDef.resource` and `relationDef.cardinality` across the codebase to use the string value directly — search and fix any remaining usages in `packages/toride/src/evaluation/condition.ts`, `packages/toride/src/partial/constraint-builder.ts`
- [ ] T030 [US5] Write integration tests for US5 acceptance scenarios: simplified syntax loads and works, old syntax rejected with error in `packages/toride/src/__tests__/` (extend or new test file)

**Checkpoint**: Simplified relation syntax works. Old syntax rejected. `pnpm exec nx run toride:test` passes for US5 scenarios.

---

## Phase 8: Downstream Packages

**Purpose**: Update codegen, drizzle, and prisma packages to align with the new core API.

- [ ] T031 [P] Update codegen: remove `TypedRelationResolver` and `RelationMap` cardinality, generate `ResolverMap` type for per-type resolvers, update `RelationMap` to use simplified syntax in `packages/codegen/src/generator.ts`
- [ ] T032 [P] Update drizzle adapter: add `createDrizzleResolver` thin adapter function that wraps a Drizzle select into the `ResourceResolver` signature in `packages/drizzle/src/index.ts`
- [ ] T033 [P] Update prisma adapter: add `createPrismaResolver` thin adapter function that wraps a Prisma findUnique into the `ResourceResolver` signature in `packages/prisma/src/index.ts`
- [ ] T034 Update codegen tests to verify new generated output format in `packages/codegen/src/__tests__/`
- [ ] T035 [P] Update drizzle tests for new resolver adapter in `packages/drizzle/src/__tests__/`
- [ ] T036 [P] Update prisma tests for new resolver adapter in `packages/prisma/src/__tests__/`

**Checkpoint**: All 4 packages build and test green. `pnpm run build && pnpm run test` passes.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, cleanup, and cross-cutting fixes.

- [ ] T037 Update existing test fixtures and YAML policy files to use new relation syntax and resolver mock format across all test directories
- [ ] T038 Run full test suite across all packages, fix any remaining failures: `pnpm run test`
- [ ] T039 Run lint across all packages, fix type errors: `pnpm run lint`
- [ ] T040 Validate quickstart.md examples compile and work end-to-end
- [ ] T041 Update inline YAML test sections in any policy files to use new `resolvers` mock format instead of `roles`/`relations`

**Checkpoint**: All packages build, lint, and test green. Quickstart examples work. Branch is ready for review.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — verify baseline
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 — first user story
- **US2 (Phase 4)**: Depends on Phase 3 (US1) — builds on resolver wiring
- **US3 (Phase 5)**: Depends on Phase 4 (US2) — needs inline + resolver for relation traversal
- **US4 (Phase 6)**: Depends on Phase 5 (US3) — needs relation resolution for `from_role + on_relation`
- **US5 (Phase 7)**: Depends on Phase 2 (Foundational) — mostly schema/validation, but test after US3
- **Downstream (Phase 8)**: Depends on Phase 7 (all core stories complete)
- **Polish (Phase 9)**: Depends on Phase 8

### User Story Dependencies

- **US1 (P1)**: Depends on Foundational — enables per-type resolver dispatch
- **US2 (P1)**: Depends on US1 — adds inline-first resolution on top of resolver wiring
- **US3 (P1)**: Depends on US2 — adds relation traversal via attributes
- **US4 (P2)**: Depends on US3 — removes getRoles, uses attribute-based derived roles
- **US5 (P2)**: Depends on Foundational — schema change, but should be validated after US3

### Within Each User Story

- Write failing tests within each implementation task (TDD)
- Core logic before integration points
- Commit after each task

### Parallel Opportunities

- T031, T032, T033 (downstream packages) can run in parallel
- T035, T036 (downstream tests) can run in parallel
- T024 (Pattern 4/5 when conditions) can run in parallel with T022/T023
- Within Phase 2, T002-T006 are sequential (type dependencies), but T007 and T008 can follow any order after T002-T004

---

## Parallel Example: Phase 8 (Downstream)

```bash
# All three downstream package updates can run in parallel:
Task T031: "Update codegen generator in packages/codegen/src/generator.ts"
Task T032: "Add createDrizzleResolver in packages/drizzle/src/index.ts"
Task T033: "Add createPrismaResolver in packages/prisma/src/index.ts"
```

---

## Implementation Strategy

### MVP First (US1 + US2 + US3)

1. Complete Phase 1: Setup (verify baseline)
2. Complete Phase 2: Foundational (core type changes)
3. Complete Phase 3: US1 (per-type resolvers work)
4. Complete Phase 4: US2 (inline attributes work)
5. Complete Phase 5: US3 (relation traversal works)
6. **STOP and VALIDATE**: The engine now supports the new resolver pattern end-to-end

### Full Delivery

7. Complete Phase 6: US4 (derived roles without getRoles)
8. Complete Phase 7: US5 (simplified relation syntax validated)
9. Complete Phase 8: Downstream packages aligned
10. Complete Phase 9: Polish and final validation

### Sequential Execution (Single Developer)

This feature is best executed sequentially (US1 → US2 → US3 → US4 → US5) since each story builds on the previous. Downstream packages (Phase 8) offer the main parallel opportunity.

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- This is a pre-1.0 breaking change — expect compilation failures during Phase 2
- Tests are combined with implementation (TDD within each task)
- Commit after each task or logical group
- Total: 41 tasks across 9 phases
