# Tasks: Toride Authorization Engine

**Input**: Design documents from `/specs/001-authz-engine/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included per Constitution Principle V (Test-First) and plan.md requirement for integration test coverage.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Monorepo**: `packages/toride/` (core), `packages/codegen/`, `packages/prisma/`, `packages/drizzle/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: pnpm monorepo initialization, package scaffolding, tooling configuration

- [ ] T001 Create root workspace config with pnpm-workspace.yaml, root package.json (private, workspaces), and .npmrc
- [ ] T002 Create shared TypeScript config in tsconfig.base.json (strict mode, ESM, Node 20+)
- [ ] T003 [P] Create core package skeleton: packages/toride/package.json with subpath exports (. and ./client), tsup.config.ts (ESM-only, dual entry src/index.ts + src/client.ts, dts: true)
- [ ] T004 [P] Create core package tsconfig.json extending tsconfig.base.json in packages/toride/tsconfig.json
- [ ] T005 [P] Configure Vitest workspace in vitest.workspace.ts at repo root
- [ ] T006 Install dependencies: yaml, valibot in packages/toride; vitest, tsup, typescript as root devDependencies
- [ ] T007 Add root package.json scripts: test (vitest), lint (tsc --noEmit), build (tsup)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core types, basic policy schema/parsing, engine skeleton — MUST complete before ANY user story

**CRITICAL**: No user story work can begin until this phase is complete

- [ ] T008 Define core runtime types (ActorRef, ResourceRef, CheckOptions, BatchCheckItem, RelationResolver, TorideOptions, DecisionEvent, QueryEvent) in packages/toride/src/types.ts
- [ ] T009 Define policy model types (Policy, ActorDeclaration, GlobalRole, ResourceBlock, RelationDef, DerivedRoleEntry, Rule, FieldAccessDef, ConditionExpression, ConditionValue) in packages/toride/src/types.ts
- [ ] T010 [P] Define error types (ValidationError with path, CycleError with path[], DepthLimitError with limit+limitType) in packages/toride/src/types.ts
- [ ] T011 Implement Valibot schema definitions mirroring the policy format (version, actors, global_roles, resources, tests) in packages/toride/src/policy/schema.ts
- [ ] T012 Implement YAML/JSON parser using yaml package with prettyErrors, Valibot structural validation, returning typed Policy object in packages/toride/src/policy/parser.ts
- [ ] T013 Implement per-check resolver result cache (Map<string, Promise<T>> keyed by method:type:id) in packages/toride/src/evaluation/cache.ts
- [ ] T014 Create Toride class skeleton with constructor (accepts TorideOptions, stores policy+resolver+config), setPolicy() for atomic swap, and stub methods in packages/toride/src/engine.ts
- [ ] T015 Create public exports barrel file re-exporting Toride, createToride, loadYaml, loadJson, types in packages/toride/src/index.ts
- [ ] T016 [P] Write unit tests for policy parser: valid YAML loads successfully, valid JSON loads successfully, structurally invalid YAML throws in packages/toride/tests/unit/policy-parser.test.ts

**Checkpoint**: Foundation ready — policy files can be loaded and validated structurally, engine instantiable

---

## Phase 3: User Story 1 — Define and Enforce Resource Permissions (Priority: P1) MVP

**Goal**: Developers can load a policy, assign direct roles via resolver, and check permissions with `can()` using grants and default-deny semantics.

**Independent Test**: Load a policy with one resource, assign a role via the resolver, verify can() returns correct allow/deny.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T017 [P] [US1] Write unit tests for grant evaluation: role with specific permissions grants access, role without permission denies, `all` keyword resolves to all declared permissions, no role returns deny (default-deny) in packages/toride/tests/unit/rule-engine.test.ts
- [ ] T018 [P] [US1] Write integration test for basic can() flow: editor can update, viewer cannot update, no-role actor denied, `all` grants every permission in packages/toride/tests/integration/basic-can.test.ts

### Implementation for User Story 1

- [ ] T019 [US1] Implement grant evaluation logic: given resolved roles and resource grants, compute granted permissions, handle `all` keyword expansion to resource's declared permissions in packages/toride/src/evaluation/rule-engine.ts
- [ ] T020 [US1] Implement can() method in Toride class: create per-check cache, call resolver.getRoles() for direct roles, evaluate grants, enforce default-deny, return boolean in packages/toride/src/engine.ts
- [ ] T021 [US1] Implement canBatch() method: shared cache across all checks, call can() logic for each BatchCheckItem, return boolean[] in packages/toride/src/engine.ts
- [ ] T022 [US1] Wire onDecision audit callback: fire async non-blocking after each can()/canBatch() check with DecisionEvent in packages/toride/src/engine.ts

**Checkpoint**: `can()` works with direct roles and grants. Default-deny enforced. `all` keyword works.

---

## Phase 4: User Story 2 — Derive Roles Through Relations and Global Roles (Priority: P1)

**Goal**: Roles are automatically derived through relations (5 patterns) and global roles, eliminating per-resource manual assignment.

**Independent Test**: Set up a two-resource policy (Organization + Project) with a derived role, assign a role on the parent, verify the child resource inherits expected permissions.

**Depends on**: US1 (direct role checking provides the base for derived roles)

### Tests for User Story 2

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T023 [P] [US2] Write unit tests for role-resolver covering all 5 derivation patterns: (1) from_global_role, (2) from_role+on_relation, (3) from_relation identity, (4) actor_type+when condition, (5) when condition only, plus cycle detection and depth limit in packages/toride/tests/unit/role-resolver.test.ts
- [ ] T024 [P] [US2] Write integration test: Organization admin derives Project admin via on_relation, superadmin global role derives owner, assignee relation identity derives editor, actor_type filtering skips non-matching actors in packages/toride/tests/integration/derived-roles.test.ts

### Implementation for User Story 2

- [ ] T025 [US2] Implement global role evaluation: match actor_type, evaluate when conditions against actor attributes, return matched global role names in packages/toride/src/evaluation/role-resolver.ts
- [ ] T026 [US2] Implement exhaustive role resolution for all 5 derived role patterns: from_global_role, from_role+on_relation (traverse relation, check remote role), from_relation (identity check actor.id vs related resource), actor_type+when, when-only; collect all derivation paths without short-circuit in packages/toride/src/evaluation/role-resolver.ts
- [ ] T027 [US2] Implement path-based cycle detection (Set<string> of type:id, cloned at branch points) and configurable depth limit (maxDerivedRoleDepth, default 5) throwing CycleError/DepthLimitError in packages/toride/src/evaluation/role-resolver.ts
- [ ] T028 [US2] Integrate role-resolver into can()/canBatch(): call resolveRoles() (direct + derived) before grant evaluation, pass per-check cache to resolver for result sharing in packages/toride/src/engine.ts

**Checkpoint**: Derived roles work across relations. Global roles evaluated from actor attributes. Cycles detected.

---

## Phase 5: User Story 3 — Apply Conditional Permit and Forbid Rules (Priority: P1)

**Goal**: ABAC rules (permit/forbid) with condition expressions evaluated against resource/actor/env attributes, with forbid-wins precedence.

**Independent Test**: Define a resource with a forbid rule, provide resource attributes via resolver, verify forbid overrides grants.

**Depends on**: US1 (grant evaluation), US2 (role resolution for rule scoping)

### Tests for User Story 3

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T029 [P] [US3] Write unit tests for condition evaluator: equality, comparison operators (gt/gte/lt/lte), set ops (in/includes), existence, pattern ops (startsWith/endsWith/contains), neq, cross-references ($actor/$resource/$env), logical combinators (any/all), strict null semantics, depth limit in packages/toride/tests/unit/condition.test.ts
- [ ] T030 [P] [US3] Write unit tests for rule evaluation: permit grants access when conditions match, forbid blocks access when conditions match, forbid-wins over permit, rules only apply to actors with roles, permit without role returns deny in packages/toride/tests/unit/rules.test.ts
- [ ] T031 [P] [US3] Write integration test: permit rule with resource.isPublic grants read to viewer, forbid rule with resource.archived blocks delete for admin, forbid-wins when both match, cross-reference $actor.department == $resource.department in packages/toride/tests/integration/conditional-rules.test.ts

### Implementation for User Story 3

- [ ] T032 [US3] Implement condition expression evaluator: recursive evaluation with depth tracking (maxConditionDepth, default 3), property path resolution (resource.field, resource.relation.field via getRelated+getAttributes, $actor.field, $env.field), all operators (eq/neq/gt/gte/lt/lte/in/includes/exists/startsWith/endsWith/contains), cross-references, logical combinators (any=OR, all=AND, implicit AND in when blocks), strict null semantics in packages/toride/src/evaluation/condition.ts
- [ ] T033 [US3] Implement permit/forbid rule evaluation: filter rules by actor's resolved roles, evaluate when conditions, collect matched permits and forbids, enforce forbid-wins precedence in packages/toride/src/evaluation/rule-engine.ts
- [ ] T034 [US3] Implement custom evaluator support: lookup by name from customEvaluators config, pass context (actor, resource, env), fail-closed error handling (forbid error = matched/denied, permit error = not matched/no grant) in packages/toride/src/evaluation/condition.ts
- [ ] T035 [US3] Integrate rule evaluation into can() flow: after grant check, evaluate rules only for actors with at least one role, apply forbid-wins, return final decision in packages/toride/src/engine.ts
- [ ] T036 [US3] Handle cardinality:many relations in conditions using ANY (exists) semantics — resolve to array, condition passes if any element matches in packages/toride/src/evaluation/condition.ts

**Checkpoint**: Full ABAC evaluation works. Permit/forbid rules with conditions. Forbid-wins. Custom evaluators. Strict null semantics.

---

## Phase 6: User Story 4 — Filter Data Using Partial Evaluation (Priority: P2)

**Goal**: `buildConstraints()` produces a constraint AST for data filtering, translated to ORM queries via `ConstraintAdapter`.

**Independent Test**: Call `buildConstraints()`, inspect constraint AST, verify it correctly represents policy logic.

**Depends on**: US1+US2+US3 (constraint generation mirrors full evaluation logic)

### Tests for User Story 4

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T037 [P] [US4] Write unit tests for constraint builder: superadmin returns unrestricted, no-roles returns forbidden, direct role emits has_role, derived role via relation emits relation+has_role, $actor values inlined into field_eq, forbid rules emit NOT nodes, custom evaluator emits unknown node in packages/toride/tests/unit/constraint-builder.test.ts
- [ ] T038 [P] [US4] Write unit tests for constraint translator: each Constraint type dispatches to correct ConstraintAdapter method, always/never simplified away before reaching adapter in packages/toride/tests/unit/constraint-translator.test.ts
- [ ] T039 [P] [US4] Write integration test: buildConstraints for actor with derived role via relation produces correct AST, translateConstraints with mock adapter produces expected query structure in packages/toride/tests/integration/partial-eval.test.ts

### Implementation for User Story 4

- [ ] T040 [P] [US4] Define Constraint discriminated union (field_eq/field_neq/field_gt/field_gte/field_lt/field_lte/field_in/field_nin/field_exists/field_includes/field_contains/relation/has_role/unknown/and/or/not/always/never), LeafConstraint subset, ConstraintResult (unrestricted/forbidden/constrained), ConstraintAdapter<TQuery> interface in packages/toride/src/partial/constraint-types.ts
- [ ] T041 [US4] Implement buildConstraints(): for each derivation path emit constraints (has_role for relation-based, field_eq for inlined $actor/$env values), combine paths with OR, apply forbid rules as NOT, simplify (always/never elimination), wrap in ConstraintResult in packages/toride/src/partial/constraint-builder.ts
- [ ] T042 [US4] Implement translateConstraints(): recursive pattern-match on constraint.type, dispatch to ConstraintAdapter methods, simplify always→skip/never→skip before calling adapter in packages/toride/src/partial/translator.ts
- [ ] T043 [US4] Wire buildConstraints() and translateConstraints() into Toride class, fire onQuery audit callback in packages/toride/src/engine.ts
- [ ] T044 [US4] Export Constraint, LeafConstraint, ConstraintResult, ConstraintAdapter types from packages/toride/src/index.ts

**Checkpoint**: Partial evaluation produces correct constraint ASTs. Translation dispatches to adapter methods. Sentinels (unrestricted/forbidden) handled.

---

## Phase 7: User Story 5 — Debug Authorization Decisions (Priority: P2)

**Goal**: `explain()` returns full decision traces; `permittedActions()` and `resolvedRoles()` provide inspection APIs.

**Independent Test**: Call `explain()` on any scenario, verify response contains complete role derivation traces, rule matches, and final decision.

**Depends on**: US1+US2+US3 (explain uses same evaluation code path)

### Tests for User Story 5

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T045 [P] [US5] Write unit tests for explain: returns resolvedRoles (direct+derived with via paths), grantedPermissions, matchedRules (effect+matched+resolvedValues), finalDecision string, multiple derivation paths all shown in packages/toride/tests/unit/explain.test.ts
- [ ] T046 [P] [US5] Write integration test: explain shows derived role via relation path, explain shows forbid rule overriding grant, permittedActions returns correct list, resolvedRoles returns direct+derived in packages/toride/tests/integration/debug-apis.test.ts

### Implementation for User Story 5

- [ ] T047 [US5] Refactor internal evaluation to return ExplainResult (resolvedRoles with ResolvedRolesDetail+DerivedRoleTrace, grantedPermissions, matchedRules with MatchedRule, finalDecision string) — can() discards trace, explain() returns it. Define ExplainResult/ResolvedRolesDetail/DerivedRoleTrace/MatchedRule types in packages/toride/src/types.ts
- [ ] T048 [US5] Implement explain() method in Toride class using shared evaluation function, returning full ExplainResult in packages/toride/src/engine.ts
- [ ] T049 [US5] Implement permittedActions(): evaluate all declared permissions for the resource, return list of allowed actions in packages/toride/src/engine.ts
- [ ] T050 [US5] Implement resolvedRoles(): call role resolution, return flat list of all role names (direct + derived) in packages/toride/src/engine.ts

**Checkpoint**: explain() provides complete authorization traces. permittedActions() and resolvedRoles() work.

---

## Phase 8: User Story 6 — Validate Policies at Load Time (Priority: P2)

**Goal**: Policy loading catches all structural and cross-reference errors with clear, path-annotated error messages.

**Independent Test**: Load intentionally invalid policies and verify specific, path-annotated error messages are thrown.

**Depends on**: Phase 2 (parser/schema foundation)

### Tests for User Story 6

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T051 [P] [US6] Write unit tests for cross-reference validator: undeclared role in grants throws with path, unknown relation in derived_roles throws with path, invalid $actor attribute reference throws, undeclared global_role reference throws, mutual exclusivity of derivation patterns enforced, valid policy passes in packages/toride/tests/unit/validator.test.ts

### Implementation for User Story 6

- [ ] T052 [US6] Implement cross-reference validation: check grants reference declared roles, derived_roles reference declared relations/global_roles/actor_types, rules reference declared permissions/roles, field_access references declared roles, $actor.x references match actor attribute declarations in packages/toride/src/policy/validator.ts
- [ ] T053 [US6] Implement derived role entry mutual exclusivity validation: exactly one pattern per entry (from_global_role XOR from_role+on_relation XOR from_relation XOR when-only), from_role requires on_relation and vice versa in packages/toride/src/policy/validator.ts
- [ ] T054 [US6] Integrate validator into loadYaml()/loadJson() pipeline: parse → structural validation (Valibot) → cross-reference validation → return Policy, all errors include logical paths (e.g., resources.Task.grants) in packages/toride/src/policy/parser.ts

**Checkpoint**: Invalid policies produce clear, actionable error messages with logical paths. Valid policies load without errors.

---

## Phase 9: User Story 7 — Sync Permissions to Client for UI Hints (Priority: P3)

**Goal**: Server generates permission snapshots; `TorideClient` provides synchronous client-side checks.

**Independent Test**: Generate a snapshot, create TorideClient, verify synchronous checks return correct results including false for unknown resources.

**Depends on**: US1+US5 (snapshot uses permittedActions)

### Tests for User Story 7

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T055 [P] [US7] Write unit tests for TorideClient: can() returns true for permitted action, false for non-permitted, false for unknown resource (default-deny) in packages/toride/tests/unit/client.test.ts
- [ ] T056 [P] [US7] Write integration test: snapshot() generates correct permission map for multiple resources, TorideClient round-trip from snapshot in packages/toride/tests/integration/client-sync.test.ts

### Implementation for User Story 7

- [ ] T057 [US7] Implement snapshot(): call permittedActions() for each resource in the list, build PermissionSnapshot (Record<string, string[]> keyed by Type:id) in packages/toride/src/snapshot.ts
- [ ] T058 [US7] Implement TorideClient class: constructor takes PermissionSnapshot, synchronous can(action, resource) lookups, unknown resources return false in packages/toride/src/client.ts
- [ ] T059 [US7] Wire snapshot() into Toride class in packages/toride/src/engine.ts
- [ ] T060 [US7] Export TorideClient and PermissionSnapshot from packages/toride/src/client.ts (subpath export toride/client)

**Checkpoint**: Permission snapshots generated server-side. TorideClient provides instant synchronous checks. Unknown resources safely denied.

---

## Phase 10: User Story 8 — Test Policies Declaratively in YAML (Priority: P3)

**Goal**: Developers write YAML test cases with inline mocks and run `npx toride test` to validate policies.

**Independent Test**: Write a YAML test file with mock data, run the test runner, verify pass/fail results.

**Depends on**: US1+US2+US3 (test runner uses full evaluation), US6 (policy loading/validation)

### Tests for User Story 8

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T061 [P] [US8] Write unit tests for test runner: mock resolver correctly built from test case roles/relations/attributes, expected:allow passes when access granted, expected:deny passes when access denied, global roles derived from actor attributes (not mocked) in packages/toride/tests/unit/test-runner.test.ts
- [ ] T062 [P] [US8] Write unit tests for CLI: validate command exits 0 for valid policy and 1 for invalid, test command exits 0 when all pass and 1 when any fail in packages/toride/tests/unit/cli.test.ts

### Implementation for User Story 8

- [ ] T063 [US8] Implement declarative test runner: parse TestCase/TestFile from YAML, build mock RelationResolver from inline roles/relations/attributes maps, instantiate Toride with mock resolver, run can() and compare to expected outcome in packages/toride/src/testing/runner.ts
- [ ] T064 [US8] Implement CLI entry point with command parsing (validate, test subcommands) in packages/toride/src/cli.ts
- [ ] T065 [US8] Implement `toride validate` command: load policy file, report errors with paths, exit 0/1; --strict flag adds static analysis warnings (unused roles, unreachable rules) in packages/toride/src/cli.ts
- [ ] T066 [US8] Implement `toride test` command: discover test files via glob pattern, run test runner, output pass/fail results with checkmark/cross formatting, exit 0/1 in packages/toride/src/cli.ts
- [ ] T067 [US8] Add bin entry "toride" pointing to dist/cli.js in packages/toride/package.json

**Checkpoint**: Declarative YAML tests work. CLI validates and tests policies. Pass/fail output with exit codes.

---

## Phase 11: User Story 9 — Control Field-Level Access (Priority: P3)

**Goal**: `canField()` and `permittedFields()` provide field-level access control based on roles.

**Independent Test**: Define a resource with field_access, resolve an actor's role, verify canField() and permittedFields() return correct results.

**Depends on**: US1+US2 (role resolution)

### Tests for User Story 9

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T068 [P] [US9] Write unit tests for field access: restricted field denied for non-listed role, restricted field allowed for listed role, unlisted field allowed for any role with resource-level permission in packages/toride/tests/unit/field-access.test.ts
- [ ] T069 [P] [US9] Write integration test: hr_admin can read salary, manager cannot read salary, any role can access unrestricted fields in packages/toride/tests/integration/field-access.test.ts

### Implementation for User Story 9

- [ ] T070 [US9] Implement canField() and permittedFields(): resolve actor's roles on resource, check field_access definition, unlisted fields unrestricted, return boolean / field list in packages/toride/src/field-access.ts
- [ ] T071 [US9] Wire canField() and permittedFields() into Toride class in packages/toride/src/engine.ts

**Checkpoint**: Field-level access control works. Unlisted fields unrestricted. Role-based field restrictions enforced.

---

## Phase 12: Polish & Cross-Cutting Concerns

**Purpose**: Remaining FRs, adapter packages, codegen, and cross-cutting features

- [ ] T072 [P] Implement mergePolicies(): additive union of actors/global_roles/resources, conflict detection for grants (throw on conflicting role→permission mappings), silent append for rules in packages/toride/src/policy/merger.ts
- [ ] T073 [P] Write unit tests for mergePolicies() in packages/toride/tests/unit/merger.test.ts
- [ ] T074 [P] Create @toride/codegen package: package.json, tsconfig.json, tsup.config.ts in packages/codegen/
- [ ] T075 Implement codegen CLI: parse policy file, generate TypeScript types (Actions union, Resources union, RelationMap, RoleMap, PermissionMap, TypedRelationResolver interface), --watch flag for re-generation in packages/codegen/src/index.ts and packages/codegen/src/cli.ts and packages/codegen/src/generator.ts
- [ ] T076 [P] Create @toride/prisma package: package.json, tsconfig.json, tsup.config.ts, implement createPrismaAdapter() per constraint-adapter contract (translate all leaf constraints, relation, hasRole, unknown, and/or/not) in packages/prisma/src/index.ts
- [ ] T077 [P] Create @toride/drizzle package: package.json, tsconfig.json, tsup.config.ts, implement createDrizzleAdapter() per constraint-adapter contract in packages/drizzle/src/index.ts
- [ ] T078 [P] Write unit tests for PrismaConstraintAdapter: each constraint type maps to correct Prisma where clause in packages/prisma/tests/unit/adapter.test.ts
- [ ] T079 [P] Write unit tests for DrizzleConstraintAdapter: each constraint type maps to correct Drizzle expression in packages/drizzle/tests/unit/adapter.test.ts
- [ ] T080 Export mergePolicies from packages/toride/src/index.ts and add ExplainResult type export
- [ ] T081 Run quickstart.md validation: verify all code examples from quickstart.md compile and execute correctly against the built library

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational
- **US2 (Phase 4)**: Depends on US1 (extends role resolution)
- **US3 (Phase 5)**: Depends on US1 (extends rule evaluation), benefits from US2 (conditions may reference derived roles)
- **US4 (Phase 6)**: Depends on US1+US2+US3 (constraint generation mirrors full evaluation)
- **US5 (Phase 7)**: Depends on US1+US2+US3 (explain shows complete trace)
- **US6 (Phase 8)**: Depends on Foundational only (validation is at load time, independent of engine)
- **US7 (Phase 9)**: Depends on US5 (snapshot uses permittedActions)
- **US8 (Phase 10)**: Depends on US1+US2+US3+US6 (test runner uses full engine + policy validation)
- **US9 (Phase 11)**: Depends on US1+US2 (field access builds on role resolution)
- **Polish (Phase 12)**: Can start after Phase 2; most tasks are independent packages

### User Story Dependencies

```
Phase 1 (Setup)
    |
Phase 2 (Foundational)
    |
    +---> US1 (P1: Basic can)
    |         |
    |         +---> US2 (P1: Derived roles)
    |         |         |
    |         |         +---> US3 (P1: Conditional rules)
    |         |                   |
    |         |                   +---> US4 (P2: Partial eval)
    |         |                   +---> US5 (P2: Debug/explain)
    |         |                   +---> US8 (P3: YAML tests)
    |         |
    |         +---> US7 (P3: Client sync) [after US5]
    |         +---> US9 (P3: Field access)
    |
    +---> US6 (P2: Validation) [independent of engine]
    |
    +---> Polish (adapters, codegen, merger) [independent packages]
```

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Types/schemas before evaluation logic
- Core logic before engine integration
- Unit tests before integration tests

### Parallel Opportunities

- **Phase 1**: T003, T004, T005 can run in parallel
- **Phase 2**: T010, T016 can run in parallel with sequential tasks
- **Each US**: Test tasks marked [P] can run in parallel within the story
- **US6**: Can be developed in parallel with US2/US3 (independent of engine evaluation)
- **Phase 12**: T072/T073, T074/T075, T076/T078, T077/T079 are independent parallel tracks

---

## Parallel Example: User Story 1

```bash
# Launch test-writing tasks in parallel:
Task T017: "Unit tests for grant evaluation in tests/unit/rule-engine.test.ts"
Task T018: "Integration test for basic can() in tests/integration/basic-can.test.ts"

# Then implement sequentially:
Task T019: "Grant evaluation logic in src/evaluation/rule-engine.ts"
Task T020: "can() method in src/engine.ts" (depends on T019)
Task T021: "canBatch() in src/engine.ts" (depends on T020)
Task T022: "onDecision audit callback" (depends on T020)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: `can()` works with direct roles, grants, default-deny
5. This alone is a usable authorization library for simple use cases

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 → Basic can() works (MVP!)
3. US2 → Derived roles via relations (core differentiator)
4. US3 → Conditional rules/ABAC (full evaluation engine)
5. US4 → Partial evaluation for data filtering
6. US5 → Debug/explain APIs
7. US6 → Policy validation (can overlap with US2-3)
8. US7-9 → DX enhancements (client sync, YAML tests, field access)
9. Polish → Adapter packages, codegen, merger

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: US1 → US2 → US3 (core evaluation pipeline)
   - Developer B: US6 (validation, independent of engine)
   - Developer C: Phase 12 adapter packages (independent)
3. After US1-3 complete: US4, US5, US7-9 can be distributed

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- US1-3 form a sequential pipeline (each extends the previous); US4-9 branch out from there
