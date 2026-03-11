# Tasks: Default Resolver Formalization

**Input**: Design documents from `/specs/20260311131506-default-resolver/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/jsdoc-contract.md, quickstart.md

**Tests**: TDD — write dedicated test file first, verify tests pass (formalizing existing behavior).

**Organization**: US1+US2 merged into one phase (tests + inline behavior). US3 (JSDoc) and US4 (VitePress) as separate phases.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Verify existing behavior is intact before making any changes

- [X] T001 Run existing test suite to confirm baseline passes: `pnpm exec nx run toride:test`
- [X] T002 Run existing lint to confirm baseline passes: `pnpm exec nx run toride:lint`

**Checkpoint**: All existing tests and lint pass — safe to proceed

---

## Phase 2: Default Resolver Tests (US1 + US2, Priority: P1) 🎯 MVP

**Goal**: Create a dedicated test file that explicitly exercises and names the "default resolver" behavior — inline-only attribute resolution without a registered `ResourceResolver`.

**Independent Test**: Run `pnpm exec nx run toride:test -- --grep "default resolver"` and verify all cases pass.

### Tests (TDD — write first, verify they pass against existing behavior)

- [X] T003 [US1] [US2] Create test file `packages/toride/src/__integration__/default-resolver.test.ts` with describe block "default resolver"
- [X] T004 [P] [US1] [US2] Add test: inline attributes resolve `$resource.<field>` conditions without a registered resolver (SC-001, acceptance 1.1)
- [X] T005 [P] [US1] [US2] Add test: missing inline fields resolve to undefined and conditions fail — default-deny preserved (SC-001, acceptance 1.2)
- [X] T006 [P] [US1] [US2] Add test: operator conditions (e.g., `gt`) work with inline-only data (SC-001, acceptance 1.3)
- [X] T007 [P] [US1] [US2] Add test: multiple fields resolve independently from inline attributes
- [X] T008 [P] [US1] [US2] Add test: when resolver IS registered alongside inline attributes, inline takes precedence (merge behavior, acceptance 2.2)
- [X] T009 [US1] [US2] Run full test suite to confirm new tests pass and no regressions: `pnpm exec nx run toride:test`

**Checkpoint**: Dedicated default-resolver test file exists with all scenarios passing. SC-001 and FR-004 satisfied.

---

## Phase 3: JSDoc Documentation (US3, Priority: P2)

**Goal**: Add JSDoc comments on resolver-related types so IDE tooltips explain that resolvers are optional and inline attributes serve as the default data source.

**Independent Test**: Read JSDoc on `ResourceResolver`, `Resolvers`, `TorideOptions.resolvers`, and `AttributeCache` — each must mention optional resolvers and inline fallback. Run lint to confirm no type errors.

### Implementation

- [ ] T010 [P] [US3] Update JSDoc on `ResourceResolver` type in `packages/toride/src/types.ts` — explain resolver is optional per resource type, inline attributes used as fallback (per contracts/jsdoc-contract.md)
- [ ] T011 [P] [US3] Update JSDoc on `Resolvers` type in `packages/toride/src/types.ts` — clarify "trivial resolution" as the "default resolver" pattern, mention inline attributes as default data source
- [ ] T012 [P] [US3] Update JSDoc on `TorideOptions.resolvers` property in `packages/toride/src/types.ts` — add `@example` block showing inline-only usage without resolvers, explain merge precedence
- [ ] T013 [P] [US3] Update JSDoc on `AttributeCache` class in `packages/toride/src/evaluation/cache.ts` — frame "no resolver" paths as "default resolver behavior", reference GraphQL analogy
- [ ] T014 [US3] Run lint to confirm JSDoc changes introduce no type errors: `pnpm exec nx run toride:lint`

**Checkpoint**: All 4 target types have updated JSDoc. SC-002 and FR-005 satisfied.

---

## Phase 4: VitePress Documentation Page (US4, Priority: P2)

**Goal**: Create a resolver concepts page in the docs site explaining the default resolver concept with code examples.

**Independent Test**: Run `cd docs && pnpm run dev` and navigate to Concepts > Resolvers. Page must cover: resolvers are optional, inline attributes as default, merge precedence, at least 2 code examples.

### Implementation

- [ ] T015 [US4] Create resolver concepts page at `docs/concepts/resolvers.md` covering: (a) what resolvers do, (b) default resolver concept, (c) inline-only code example, (d) resolver + inline merge code example, (e) precedence rules, (f) no data = deny behavior
- [ ] T016 [US4] Add sidebar entry for resolvers page in `docs/.vitepress/config.ts` under the Concepts section

**Checkpoint**: Resolvers page is reachable from site navigation with all required content. SC-003 and FR-006 satisfied.

---

## Phase 5: Polish & Validation

**Purpose**: Final validation across all stories

- [ ] T017 Run full test suite across all packages: `pnpm run test`
- [ ] T018 Run full lint across all packages: `pnpm run lint`
- [ ] T019 Validate quickstart.md scenarios manually (run code snippets from `specs/20260311131506-default-resolver/quickstart.md`)
- [ ] T020 Verify no breaking changes: confirm existing `inline-attributes.test.ts` is unmodified (FR-007, SC-004)

**Checkpoint**: All success criteria (SC-001 through SC-004) met. Feature complete.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Tests — US1+US2)**: Depends on Phase 1 (baseline must pass)
- **Phase 3 (JSDoc — US3)**: Depends on Phase 1 only (independent of Phase 2)
- **Phase 4 (VitePress — US4)**: Depends on Phase 1 only (independent of Phase 2 and 3)
- **Phase 5 (Polish)**: Depends on Phases 2, 3, and 4 completion

### User Story Dependencies

- **US1+US2 (P1)**: Can start after Phase 1 — no dependencies on other stories
- **US3 (P2)**: Can start after Phase 1 — independent of US1/US2 (JSDoc describes existing behavior)
- **US4 (P2)**: Can start after Phase 1 — independent of all other stories

### Parallel Opportunities

- T004, T005, T006, T007, T008 can all run in parallel (different test cases in same file, but independent scenarios)
- T010, T011, T012, T013 can all run in parallel (different JSDoc blocks in different locations)
- Phase 2, Phase 3, and Phase 4 can run in parallel after Phase 1 (different files, no dependencies)

---

## Parallel Example: Phase 2 (Tests)

```bash
# After T003 creates the file, launch all test cases in parallel:
Task T004: "inline attributes resolve without resolver"
Task T005: "missing fields resolve to undefined"
Task T006: "operator conditions with inline data"
Task T007: "multiple fields resolve independently"
Task T008: "inline takes precedence over resolver"
```

## Parallel Example: Cross-Phase

```bash
# After Phase 1 completes, launch all three story phases in parallel:
Phase 2: Default resolver tests (US1+US2)
Phase 3: JSDoc documentation (US3)
Phase 4: VitePress page (US4)
```

---

## Implementation Strategy

### MVP First (Phase 2 Only)

1. Complete Phase 1: Setup verification
2. Complete Phase 2: Default resolver tests (US1+US2)
3. **STOP and VALIDATE**: Run `pnpm exec nx run toride:test -- --grep "default resolver"`
4. Tests formalize the contract — MVP done

### Incremental Delivery

1. Phase 1 → Baseline verified
2. Phase 2 → Tests written (MVP — contract formalized)
3. Phase 3 → JSDoc added (IDE experience improved)
4. Phase 4 → VitePress page (docs site complete)
5. Phase 5 → Final validation
6. Each phase adds documentation value without runtime changes

---

## Notes

- No runtime code changes — this feature is purely tests + documentation
- All tests should pass immediately since they formalize existing behavior
- [P] tasks = different files or independent test cases, no dependencies
- Commit after each phase checkpoint
