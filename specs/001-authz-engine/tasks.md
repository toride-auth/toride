# Tasks: Toride Authorization Engine

**Input**: Design documents from `/specs/001-authz-engine/`
**Prerequisites**: plan.md, spec.md, data-model.md, research.md, quickstart.md, contracts/

**Tests**: Included per Constitution Principle V (Test-First). Vitest unit and integration tests.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Monorepo Infrastructure)

**Purpose**: Initialize pnpm monorepo with all 4 packages, build tooling, and shared configuration

- [X] T001 Create root `package.json` with pnpm workspace config and shared scripts
- [X] T002 Create `pnpm-workspace.yaml` defining `packages/*` workspace
- [X] T003 Create `tsconfig.base.json` with strict mode, ESM, and shared compiler options
- [X] T004 [P] Create `packages/toride/package.json` with ESM exports, subpath `./client`, and bin entry for `toride` CLI
- [X] T005 [P] Create `packages/toride/tsup.config.ts` with dual entry points (`src/index.ts`, `src/client.ts`) and dts generation
- [X] T006 [P] Create `packages/toride/tsconfig.json` extending base config
- [X] T007 [P] Create `packages/codegen/package.json` with bin entry `toride-codegen` and `workspace:*` dep on `toride`
- [X] T008 [P] Create `packages/codegen/tsup.config.ts` with single entry point and dts generation
- [X] T009 [P] Create `packages/prisma/package.json` with `workspace:*` dep on `toride`
- [X] T010 [P] Create `packages/prisma/tsup.config.ts` with single entry point and dts generation
- [X] T011 [P] Create `packages/drizzle/package.json` with `workspace:*` dep on `toride`
- [X] T012 [P] Create `packages/drizzle/tsup.config.ts` with single entry point and dts generation
- [X] T013 Create `vitest.workspace.ts` at root pointing to all package test directories
- [X] T014 Run `pnpm install` and verify workspace resolution, `pnpm build` scaffold, and `pnpm test` harness

**Checkpoint**: All 4 packages resolve, `pnpm build` and `pnpm test` run (even if empty). Monorepo is functional.

---

## Phase 2: Foundational (Core Types & Policy Parsing)

**Purpose**: Core type definitions and policy parsing/validation that ALL user stories depend on

**CRITICAL**: No user story work can begin until this phase is complete

- [X] T015 Define core runtime types (`ActorRef`, `ResourceRef`, `CheckOptions`, `BatchCheckItem`, `RelationResolver`, `TorideOptions`) in `packages/toride/src/types.ts`
- [X] T016 [P] Define constraint AST types (`Constraint` discriminated union, `LeafConstraint`, `ConstraintResult`, `ConstraintAdapter`) in `packages/toride/src/partial/constraint-types.ts`
- [X] T017 [P] Define evaluation result types (`ExplainResult`, `ResolvedRolesDetail`, `DerivedRoleTrace`, `MatchedRule`, `DecisionEvent`, `QueryEvent`) in `packages/toride/src/types.ts`
- [X] T018 [P] Define error types (`ValidationError`, `CycleError`, `DepthLimitError`) in `packages/toride/src/types.ts`
- [X] T019 Define Valibot schemas for full policy format (`Policy`, `ActorDeclaration`, `GlobalRole`, `ResourceBlock`, `RelationDef`, `DerivedRoleEntry`, `Rule`, `FieldAccessDef`, `ConditionExpression`, `ConditionValue`) in `packages/toride/src/policy/schema.ts`
- [X] T020 Implement YAML/JSON parser (`loadYaml`, `loadJson`) using `yaml` package with `prettyErrors: true` and Valibot schema validation in `packages/toride/src/policy/parser.ts`
- [X] T021 Implement cross-reference validator (undeclared roles in grants, unknown relations in derived_roles, invalid `$actor` attribute references, mutual exclusivity of derivation patterns) in `packages/toride/src/policy/validator.ts`
- [X] T022 Wire up public exports in `packages/toride/src/index.ts` for types, parser, and error classes
- [X] T023 Write unit tests for policy parsing and validation (valid policies, structural errors, cross-reference errors with path messages) in `packages/toride/tests/unit/policy/`

**Checkpoint**: `loadYaml()` and `loadJson()` parse valid policies into typed `Policy` objects. Invalid policies throw `ValidationError` with logical path messages. All foundational types are exported.

---

## Phase 3: User Story 1 - Define and Enforce Resource Permissions (Priority: P1)

**Goal**: Basic `can()` check with direct role assignments, grants, default-deny semantics, and `all` keyword resolution

**Independent Test**: Load a policy with one resource, assign a role via resolver, verify `can()` returns correct allow/deny

### Tests for User Story 1

- [X] T024 [P] [US1] Write unit tests for role resolution (direct roles only) in `packages/toride/tests/unit/evaluation/role-resolver.test.ts`
- [X] T025 [P] [US1] Write unit tests for grant evaluation (role-to-permission mapping, `all` keyword) in `packages/toride/tests/unit/evaluation/rule-engine.test.ts`
- [X] T026 [P] [US1] Write integration tests for basic `can()` scenarios (allow, deny, default-deny, `all` grants) in `packages/toride/tests/integration/basic-can.test.ts`

### Implementation for User Story 1

- [X] T027 [US1] Implement per-check resolver cache (`Map<string, Promise<T>>` keyed by method:type:id) in `packages/toride/src/evaluation/cache.ts`
- [X] T028 [US1] Implement direct role resolution (call `resolver.getRoles()`, no derivation yet) in `packages/toride/src/evaluation/role-resolver.ts`
- [X] T029 [US1] Implement grant evaluation (map resolved roles to permissions via `grants`, resolve `all` to declared permissions) in `packages/toride/src/evaluation/rule-engine.ts`
- [X] T030 [US1] Implement `Toride` class with `can()` method (create cache, resolve direct roles, check grants, return boolean with default-deny) in `packages/toride/src/engine.ts`
- [X] T031 [US1] Implement `createToride()` typed factory function in `packages/toride/src/engine.ts`
- [X] T032 [US1] Wire up `Toride`, `createToride` exports in `packages/toride/src/index.ts`

**Checkpoint**: `can(actor, "update", Task:42)` returns `true` for an actor with `editor` role granting `[read, update]`, and `false` for actors without roles (default-deny). `all` grants resolve to all declared permissions.

---

## Phase 4: User Story 2 - Derive Roles Through Relations and Global Roles (Priority: P1)

**Goal**: Five derived role patterns (global role, relation-based, relation identity, actor type + condition, when-only), cycle detection, depth limits

**Independent Test**: Two-resource policy (Organization + Project), assign role on parent, verify child inherits permissions via derived role

### Tests for User Story 2

- [X] T033 [P] [US2] Write unit tests for all 5 derived role patterns in `packages/toride/tests/unit/evaluation/derived-roles.test.ts`
- [X] T034 [P] [US2] Write unit tests for cycle detection and depth limit enforcement in `packages/toride/tests/unit/evaluation/cycle-detection.test.ts`
- [X] T035 [P] [US2] Write integration tests for role derivation through relations (Organization admin -> Project admin, superadmin global role, assignee identity) in `packages/toride/tests/integration/derived-roles.test.ts`

### Implementation for User Story 2

- [X] T036 [US2] Implement global role evaluation (match actor type, evaluate `when` conditions against actor attributes) in `packages/toride/src/evaluation/role-resolver.ts`
- [X] T037 [US2] Implement relation-based role derivation (pattern 2: `from_role` + `on_relation`, call `resolver.getRelated()` + recursive `getRoles()`) in `packages/toride/src/evaluation/role-resolver.ts`
- [X] T038 [US2] Implement relation identity derivation (pattern 3: `from_relation`, compare actor ID with relation target) in `packages/toride/src/evaluation/role-resolver.ts`
- [X] T039 [US2] Implement actor-type-conditional derivation (patterns 4/5: `actor_type` + `when` conditions on `$actor`/`$resource`) in `packages/toride/src/evaluation/role-resolver.ts`
- [X] T040 [US2] Implement path-based cycle detection (`Set<string>` of type:id pairs, clone at branch points) in `packages/toride/src/evaluation/role-resolver.ts`
- [X] T041 [US2] Add configurable depth limit (`maxDerivedRoleDepth`, default 5) with `DepthLimitError` in `packages/toride/src/evaluation/role-resolver.ts`
- [X] T042 [US2] Ensure exhaustive evaluation (all derivation paths explored, no short-circuit) and derivation trace recording in `packages/toride/src/evaluation/role-resolver.ts`

**Checkpoint**: Derived roles work across relations (`org admin -> project admin`), global roles derive from actor attributes, identity relations match actor IDs, cycles throw `CycleError`, depth exceeding 5 throws `DepthLimitError`.

---

## Phase 5: User Story 3 - Apply Conditional Permit and Forbid Rules (Priority: P1)

**Goal**: Full condition expression evaluator, permit/forbid rules with forbid-wins precedence, fail-closed error handling

**Independent Test**: Define a resource with a forbid rule, provide resource attributes via resolver, verify forbid overrides grants

### Tests for User Story 3

- [X] T043 [P] [US3] Write unit tests for condition expression evaluator (all operators, cross-references, strict null, logical combinators) in `packages/toride/tests/unit/evaluation/condition.test.ts`
- [X] T044 [P] [US3] Write unit tests for rule engine (permit, forbid, forbid-wins, roles-only guard, custom evaluators) in `packages/toride/tests/unit/evaluation/rules.test.ts`
- [X] T045 [P] [US3] Write integration tests for conditional rules (permit+forbid scenarios, forbid-wins, fail-closed on errors) in `packages/toride/tests/integration/conditional-rules.test.ts`

### Implementation for User Story 3

- [X] T046 [US3] Implement condition expression evaluator (equality, comparison, set ops, existence, pattern ops, negation, cross-references `$actor`/`$resource`/`$env`, logical combinators `any`/`all`) in `packages/toride/src/evaluation/condition.ts`
- [X] T047 [US3] Implement nested property resolution (`resource.relation.field` via resolver, with configurable `maxConditionDepth` default 3) in `packages/toride/src/evaluation/condition.ts`
- [X] T048 [US3] Implement strict null semantics (undefined/null never equals anything) in `packages/toride/src/evaluation/condition.ts`
- [X] T049 [US3] Implement permit/forbid rule evaluation with forbid-wins precedence in `packages/toride/src/evaluation/rule-engine.ts`
- [X] T050 [US3] Implement roles-only guard (rules only evaluated for actors with at least one role) in `packages/toride/src/evaluation/rule-engine.ts`
- [X] T051 [US3] Implement custom evaluator support (registered functions, fail-closed: forbid error -> matched, permit error -> not matched) in `packages/toride/src/evaluation/rule-engine.ts`
- [X] T052 [US3] Implement fail-closed error handling for resolver errors (any exception -> access denied) in `packages/toride/src/engine.ts`
- [X] T053 [US3] Implement `cardinality: many` relation resolution with ANY (exists) semantics in conditions in `packages/toride/src/evaluation/condition.ts`

**Checkpoint**: Permit rules grant conditional access, forbid rules override all grants, forbid-wins precedence holds, custom evaluators work with fail-closed semantics, resolver errors deny access.

---

## Phase 6: User Story 4 - Filter Data Using Partial Evaluation (Priority: P2)

**Goal**: `buildConstraints()` producing constraint ASTs, `translateConstraints()` with adapter pattern, AST simplification

**Independent Test**: Call `buildConstraints()`, inspect AST, verify it correctly represents policy logic

### Tests for User Story 4

- [ ] T054 [P] [US4] Write unit tests for constraint builder (unrestricted, forbidden, constrained, has_role nodes, inlined actor/env values) in `packages/toride/tests/unit/partial/constraint-builder.test.ts`
- [ ] T055 [P] [US4] Write unit tests for constraint translation and simplification (always/never elimination) in `packages/toride/tests/unit/partial/translator.test.ts`
- [ ] T056 [P] [US4] Write integration tests for end-to-end partial evaluation scenarios in `packages/toride/tests/integration/partial-eval.test.ts`

### Implementation for User Story 4

- [ ] T057 [US4] Implement `buildConstraints()` (evaluate all derivation paths, emit constraints per path, combine with OR) in `packages/toride/src/partial/constraint-builder.ts`
- [ ] T058 [US4] Implement `$actor` and `$env` value inlining into concrete constraint nodes during partial evaluation in `packages/toride/src/partial/constraint-builder.ts`
- [ ] T059 [US4] Implement `has_role` constraint node emission for relation-based derived roles in `packages/toride/src/partial/constraint-builder.ts`
- [ ] T060 [US4] Implement forbid rule application as `NOT` constraints in partial evaluation in `packages/toride/src/partial/constraint-builder.ts`
- [ ] T061 [US4] Implement constraint simplification (`and([always, X])` -> `X`, `or([never, X])` -> `X`, etc.) in `packages/toride/src/partial/constraint-builder.ts`
- [ ] T062 [US4] Implement `unknown` constraint node emission for custom evaluators in `packages/toride/src/partial/constraint-builder.ts`
- [ ] T063 [US4] Implement `translateConstraints()` recursive function dispatching to `ConstraintAdapter` methods in `packages/toride/src/partial/translator.ts`
- [ ] T064 [US4] Wire up `buildConstraints()` and `translateConstraints()` on `Toride` class in `packages/toride/src/engine.ts`

**Checkpoint**: `buildConstraints(superadmin, "read", "Task")` returns `unrestricted: true`. No-access actor returns `forbidden: true`. Relation-derived roles produce `has_role` nodes. Actor values are inlined. Forbid rules produce `NOT` wrappers.

---

## Phase 7: User Story 5 - Debug Authorization Decisions (Priority: P2)

**Goal**: `explain()` with full traces, `permittedActions()`, `resolvedRoles()`, `canBatch()` with shared cache, audit events

**Independent Test**: Call `explain()` on any scenario, verify response contains complete role derivation traces, rule matches, and final decision

### Tests for User Story 5

- [ ] T065 [P] [US5] Write unit tests for `explain()` output structure (resolvedRoles, grantedPermissions, matchedRules, finalDecision) in `packages/toride/tests/unit/engine/explain.test.ts`
- [ ] T066 [P] [US5] Write unit tests for `permittedActions()`, `resolvedRoles()`, and `canBatch()` in `packages/toride/tests/unit/engine/helpers.test.ts`
- [ ] T067 [P] [US5] Write integration tests for debug scenarios (multiple derivation paths, forbid explanations) in `packages/toride/tests/integration/explain.test.ts`

### Implementation for User Story 5

- [ ] T068 [US5] Implement `explain()` method returning `ExplainResult` with full role derivation traces, granted permissions, matched rules, and human-readable final decision in `packages/toride/src/engine.ts`
- [ ] T069 [US5] Implement `permittedActions()` (check all declared permissions for a resource, return permitted ones) in `packages/toride/src/engine.ts`
- [ ] T070 [US5] Implement `resolvedRoles()` (return both direct and derived roles) in `packages/toride/src/engine.ts`
- [ ] T071 [US5] Implement `canBatch()` with shared resolver cache across all checks in batch in `packages/toride/src/engine.ts`
- [ ] T072 [US5] Implement `onDecision` and `onQuery` audit event callbacks (async, non-blocking) in `packages/toride/src/engine.ts`

**Checkpoint**: `explain()` returns complete traces showing all derivation paths. `permittedActions()` lists all allowed actions. `canBatch()` shares cache across checks. Audit callbacks fire without blocking.

---

## Phase 8: User Story 6 - Validate Policies at Load Time (Priority: P2)

**Goal**: Comprehensive validation with clear error messages including logical paths, `--strict` static analysis warnings

**Independent Test**: Load intentionally invalid policies, verify specific path-annotated error messages

### Tests for User Story 6

- [ ] T073 [P] [US6] Write unit tests for all validation error scenarios (undeclared roles, unknown relations, invalid operators, mismatched actor attributes, derivation pattern conflicts) in `packages/toride/tests/unit/policy/validator.test.ts`
- [ ] T074 [P] [US6] Write unit tests for strict mode warnings (unused roles, unreachable rules, redundant derived_roles) in `packages/toride/tests/unit/policy/strict-validator.test.ts`

### Implementation for User Story 6

- [ ] T075 [US6] Enhance cross-reference validator with comprehensive checks: undeclared roles in grants, unknown relations in `on_relation`, invalid `$actor.x` references against actor declarations, `from_global_role` referencing undeclared global roles in `packages/toride/src/policy/validator.ts`
- [ ] T076 [US6] Implement logical path generation for all error messages (e.g., `resources.Task.grants references undeclared role "edtor"`) in `packages/toride/src/policy/validator.ts`
- [ ] T077 [US6] Implement strict mode static analysis (unused roles, unreachable rules, redundant derivations) as warnings in `packages/toride/src/policy/validator.ts`
- [ ] T078 [US6] Implement `toride validate` CLI command (errors-only default, `--strict` flag for warnings) in `packages/toride/src/cli.ts`

**Checkpoint**: Invalid policies produce clear, path-annotated errors. `toride validate` exits 0/1 correctly. `--strict` shows additional warnings without failing on warnings alone.

---

## Phase 9: User Story 7 - Sync Permissions to Client for UI Hints (Priority: P3)

**Goal**: Server-side `snapshot()` and client-side `TorideClient` with synchronous checks

**Independent Test**: Generate snapshot on server, create `TorideClient`, verify sync checks return correct results including `false` for unknown resources

### Tests for User Story 7

- [ ] T079 [P] [US7] Write unit tests for `snapshot()` (permission map generation) in `packages/toride/tests/unit/engine/snapshot.test.ts`
- [ ] T080 [P] [US7] Write unit tests for `TorideClient` (sync can(), default-deny for unknown resources) in `packages/toride/tests/unit/client/client.test.ts`

### Implementation for User Story 7

- [ ] T081 [US7] Implement `snapshot()` method (evaluate `permittedActions()` for each resource, return `PermissionSnapshot`) in `packages/toride/src/snapshot.ts`
- [ ] T082 [US7] Implement `TorideClient` class with synchronous `can()` and default-deny for unknown resources in `packages/toride/src/client.ts`
- [ ] T083 [US7] Wire up `snapshot()` on `Toride` class in `packages/toride/src/engine.ts`
- [ ] T084 [US7] Wire up `toride/client` subpath export in `packages/toride/src/client.ts` and verify package.json exports

**Checkpoint**: `snapshot()` returns a `PermissionSnapshot` map. `TorideClient` provides instant sync `can()` checks. Unknown resources return `false`.

---

## Phase 10: User Story 8 - Test Policies Declaratively in YAML (Priority: P3)

**Goal**: YAML test cases with inline mocks, test runner, `toride test` CLI command

**Independent Test**: Write YAML test file with mock data, run test runner, verify pass/fail results

### Tests for User Story 8

- [ ] T085 [P] [US8] Write unit tests for mock resolver construction from test case data in `packages/toride/tests/unit/testing/mock-resolver.test.ts`
- [ ] T086 [P] [US8] Write integration tests for declarative test runner (pass/fail scenarios, global role derivation from attributes) in `packages/toride/tests/integration/declarative-tests.test.ts`

### Implementation for User Story 8

- [ ] T087 [US8] Implement test case model parsing (inline `tests:` section in policy + separate `.test.yaml` files) in `packages/toride/src/testing/test-parser.ts`
- [ ] T088 [US8] Implement mock resolver construction from test case `roles`, `relations`, `attributes` maps in `packages/toride/src/testing/mock-resolver.ts`
- [ ] T089 [US8] Implement test runner (load policy, create mock resolver per test case, run `can()`, compare with `expected`) in `packages/toride/src/testing/test-runner.ts`
- [ ] T090 [US8] Implement `toride test` CLI command with glob pattern support and pass/fail output in `packages/toride/src/cli.ts`

**Checkpoint**: YAML test cases with inline mocks execute correctly. `toride test` CLI reports pass/fail with clear output. Global roles derived from actor attributes without mock override.

---

## Phase 11: User Story 9 - Control Field-Level Access (Priority: P3)

**Goal**: `field_access` on resources, `canField()` and `permittedFields()` APIs

**Independent Test**: Define resource with `field_access`, verify `canField()` and `permittedFields()` return correct results

### Tests for User Story 9

- [ ] T091 [P] [US9] Write unit tests for `canField()` and `permittedFields()` (restricted fields, unrestricted fields, role-based access) in `packages/toride/tests/unit/engine/field-access.test.ts`
- [ ] T092 [P] [US9] Write integration tests for field-level access scenarios in `packages/toride/tests/integration/field-access.test.ts`

### Implementation for User Story 9

- [ ] T093 [US9] Implement `canField()` (resolve roles, check field_access for the field, unrestricted if field not listed) in `packages/toride/src/field-access.ts`
- [ ] T094 [US9] Implement `permittedFields()` (for all declared field_access entries, return accessible ones plus all unrestricted fields) in `packages/toride/src/field-access.ts`
- [ ] T095 [US9] Wire up `canField()` and `permittedFields()` on `Toride` class in `packages/toride/src/engine.ts`

**Checkpoint**: `canField(actor, "read", Employee:42, "salary")` returns correct results based on role. Unlisted fields are unrestricted.

---

## Phase 12: Polish & Cross-Cutting Concerns

**Purpose**: Satellite packages, policy management, and final integration

- [ ] T096 [P] Implement `mergePolicies()` (additive composition, conflict detection for grants, silent append for rules) in `packages/toride/src/policy/merger.ts`
- [ ] T097 [P] Implement `setPolicy()` (atomic swap, in-flight checks use old policy) in `packages/toride/src/engine.ts`
- [ ] T098 [P] Implement `@toride/codegen` generator (read policy, emit TypeScript types for Actions, Resources, RoleMap, PermissionMap, RelationMap, TypedRelationResolver) in `packages/codegen/src/generator.ts`
- [ ] T099 [P] Implement `toride-codegen` CLI entry point with `-o` and `--watch` flags in `packages/codegen/src/cli.ts`
- [ ] T100 [P] Implement `@toride/prisma` PrismaConstraintAdapter (`createPrismaAdapter` factory with translation rules per contract) in `packages/prisma/src/index.ts`
- [ ] T101 [P] Implement `@toride/drizzle` DrizzleConstraintAdapter (`createDrizzleAdapter` factory with translation rules per contract) in `packages/drizzle/src/index.ts`
- [ ] T102 Write unit tests for `mergePolicies()` and `setPolicy()` in `packages/toride/tests/unit/policy/merger.test.ts`
- [ ] T103 [P] Write unit tests for `@toride/codegen` in `packages/codegen/tests/generator.test.ts`
- [ ] T104 [P] Write unit tests for `@toride/prisma` adapter in `packages/prisma/tests/adapter.test.ts`
- [ ] T105 [P] Write unit tests for `@toride/drizzle` adapter in `packages/drizzle/tests/adapter.test.ts`
- [ ] T106 Run quickstart.md validation (verify all code examples compile and produce expected outputs)
- [ ] T107 Final export audit: verify all public API types and functions are exported from `packages/toride/src/index.ts`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational (Phase 2)
- **US2 (Phase 4)**: Depends on US1 (Phase 3) - extends role resolution with derivation
- **US3 (Phase 5)**: Depends on US2 (Phase 4) - conditions reference relations, rules need full role resolution
- **US4 (Phase 6)**: Depends on US3 (Phase 5) - partial eval must handle all role/rule patterns
- **US5 (Phase 7)**: Depends on US3 (Phase 5) - explain needs full evaluation pipeline
- **US6 (Phase 8)**: Depends on Foundational (Phase 2) - validation is independent of evaluation
- **US7 (Phase 9)**: Depends on US5 (Phase 7) - snapshot uses permittedActions()
- **US8 (Phase 10)**: Depends on US3 (Phase 5) - test runner needs full can() pipeline
- **US9 (Phase 11)**: Depends on US2 (Phase 4) - field access needs role resolution
- **Polish (Phase 12)**: Depends on all user stories being complete

### User Story Dependencies

```
Phase 1 (Setup)
  └─> Phase 2 (Foundational)
        ├─> Phase 3 (US1: Basic can)
        │     └─> Phase 4 (US2: Derived roles)
        │           ├─> Phase 5 (US3: Rules)
        │           │     ├─> Phase 6 (US4: Partial eval)
        │           │     ├─> Phase 7 (US5: Explain)  ── can run parallel with US4
        │           │     └─> Phase 10 (US8: YAML tests) ── can run parallel with US4/5
        │           └─> Phase 11 (US9: Field access)  ── can run parallel with US3+
        ├─> Phase 8 (US6: Validation)  ── can run parallel with US1+
        └─> Phase 9 (US7: Client sync) ── after US5 (needs permittedActions)
```

### Parallel Opportunities

**After Phase 2 completes**:
- US1 (Phase 3) and US6 (Phase 8) can run in parallel

**After Phase 4 (US2) completes**:
- US9 (Phase 11) can run in parallel with US3 (Phase 5)

**After Phase 5 (US3) completes**:
- US4 (Phase 6), US5 (Phase 7), and US8 (Phase 10) can all run in parallel

**Within each phase**, tasks marked [P] can run in parallel

---

## Parallel Example: Phase 1 Setup

```bash
# All package configs can be created in parallel:
Task T004: "Create packages/toride/package.json"
Task T005: "Create packages/toride/tsup.config.ts"
Task T006: "Create packages/toride/tsconfig.json"
Task T007: "Create packages/codegen/package.json"
Task T008: "Create packages/codegen/tsup.config.ts"
Task T009: "Create packages/prisma/package.json"
Task T010: "Create packages/prisma/tsup.config.ts"
Task T011: "Create packages/drizzle/package.json"
Task T012: "Create packages/drizzle/tsup.config.ts"
```

## Parallel Example: Phase 5 US3

```bash
# All test files can be written in parallel:
Task T043: "Condition evaluator tests"
Task T044: "Rule engine tests"
Task T045: "Integration tests"
```

---

## Implementation Strategy

### MVP First (P1 Stories: US1 + US2 + US3)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (types + parsing)
3. Complete Phase 3: US1 (basic can with direct roles)
4. Complete Phase 4: US2 (derived roles through relations)
5. Complete Phase 5: US3 (conditional permit/forbid rules)
6. **STOP and VALIDATE**: Full P1 authorization engine works end-to-end

### Incremental Delivery

1. Setup + Foundational -> Infrastructure ready
2. US1 -> Basic authorization checks (MVP-0)
3. US2 -> Relation-based role derivation (MVP-1)
4. US3 -> Full ABAC with rules (MVP-2, publishable)
5. US4 + US5 + US6 -> Data filtering + debugging + validation (P2 release)
6. US7 + US8 + US9 -> Client sync + YAML tests + field access (P3 release)
7. Polish -> Satellite packages, codegen, adapters (v1.0)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable after its dependencies
- Constitution Principle V: Write tests first, ensure they fail before implementation
- All file paths reference the pnpm monorepo structure under `packages/`
- Total: 107 fine-grained tasks across 12 phases
