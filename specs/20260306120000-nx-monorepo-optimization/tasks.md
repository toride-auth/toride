# Tasks: Nx Monorepo Optimization

**Input**: Design documents from `/specs/20260306120000-nx-monorepo-optimization/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Verification tasks included after each user story phase.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install Nx and create the workspace configuration

- [X] T001 Install `nx` as root devDependency via `pnpm add -Dw nx`
- [X] T002 Create `nx.json` at repository root per contracts/nx-json.md (extends `nx/presets/npm.json`, namedInputs, targetDefaults for build/test/lint)
- [X] T003 Append `.nx/cache` and `.nx/workspace-data` to `.gitignore`

**Checkpoint**: `pnpm exec nx show projects` lists all 4 packages

---

## Phase 2: Foundational (Package Configuration)

**Purpose**: Configure each package for Nx and update root scripts. MUST complete before user story verification.

**CRITICAL**: No user story verification can begin until this phase is complete.

- [X] T004 Add `"nx": { "tags": ["type:core"] }` to `packages/toride/package.json`
- [X] T005 Add `"nx": { "tags": ["type:codegen"] }` to `packages/codegen/package.json`
- [X] T006 Add `"nx": { "tags": ["type:integration"] }` to `packages/drizzle/package.json`
- [X] T007 Add `"nx": { "tags": ["type:integration"] }` to `packages/prisma/package.json`
- [X] T008 Update root `package.json` scripts: `build` -> `nx run-many -t build`, `test` -> `nx run-many -t test`, `lint` -> `nx run-many -t lint`

**Checkpoint**: `pnpm exec nx run-many -t build` succeeds and respects dependency order (toride builds before satellites)

---

## Phase 3: User Story 1 - AI Agent Understands Package Boundaries (Priority: P1)

**Goal**: AI agents can understand package scope, dependencies, and conventions via root CLAUDE.md and Nx commands, without scanning irrelevant packages.

**Independent Test**: Root CLAUDE.md contains Nx-aware monorepo instructions; `nx show project <name>` returns meaningful info per package.

### Implementation for User Story 1

- [X] T009 [US1] Ensure each package.json has a meaningful `description` field in `packages/toride/package.json`, `packages/codegen/package.json`, `packages/drizzle/package.json`, `packages/prisma/package.json`
- [X] T010 [US1] Update root `CLAUDE.md` with Nx-aware monorepo navigation instructions: package overview, Nx commands for discovery (`nx show project`, `nx graph`), per-package build/test/lint commands, dependency graph summary

### Verification for User Story 1

- [X] T011 [US1] Verify `pnpm exec nx show project @toride/drizzle` outputs correct tags, targets, and dependencies
- [X] T012 [US1] Verify root CLAUDE.md contains package boundary info and Nx commands for AI agent context

**Checkpoint**: An AI agent reading root CLAUDE.md can understand the monorepo structure and use Nx commands for per-package discovery

---

## Phase 4: User Story 2 - Fast Cached Builds with Nx (Priority: P2)

**Goal**: Repeated builds with no changes complete instantly via Nx local cache; `nx affected` only rebuilds changed packages.

**Independent Test**: Run `nx run-many -t build` twice; second run completes in <2s (cache hit).

### Verification for User Story 2

- [ ] T013 [US2] Run `pnpm exec nx run-many -t build` and verify all 4 packages build successfully with correct dependency order
- [ ] T014 [US2] Run `pnpm exec nx run-many -t build` again with no changes and verify all tasks are cache hits (complete in <2s)
- [ ] T015 [US2] Modify a file in `packages/drizzle/src/`, run `pnpm exec nx affected -t build`, and verify only `@toride/drizzle` rebuilds

**Checkpoint**: Cached builds work; affected builds skip unchanged packages

---

## Phase 5: User Story 3 - Targeted Test Runs (Priority: P2)

**Goal**: `nx affected -t test` runs only tests for changed packages and their dependents.

**Independent Test**: Modify one package and verify only relevant tests run.

### Verification for User Story 3

- [ ] T016 [US3] Run `pnpm exec nx run-many -t test` and verify all package tests pass
- [ ] T017 [US3] Modify a file in `packages/prisma/src/`, run `pnpm exec nx affected -t test`, and verify only `@toride/prisma` tests run
- [ ] T018 [US3] Modify a file in `packages/toride/src/`, run `pnpm exec nx affected -t test`, and verify tests run for all 4 packages (all depend on core)

**Checkpoint**: Targeted test runs work correctly based on the dependency graph

---

## Phase 6: User Story 4 - CI Pipeline with Nx (Priority: P3)

**Goal**: GitHub Actions CI workflow uses `nx affected` to only build, test, and lint PR-affected packages.

**Independent Test**: CI workflow file exists and uses correct actions and Nx affected commands.

### Implementation for User Story 4

- [ ] T019 [US4] Create `.github/workflows/` directory structure
- [ ] T020 [US4] Create `.github/workflows/ci.yml` per contracts/ci-workflow.md (checkout with fetch-depth:0, pnpm setup, node 20, nx-set-shas, `nx affected -t lint test build`)

### Verification for User Story 4

- [ ] T021 [US4] Validate `.github/workflows/ci.yml` syntax with `pnpm exec nx show projects` (smoke test that Nx is operational for CI)

**Checkpoint**: CI workflow file is ready for use on pull requests

---

## Phase 7: User Story 5 - Nx Project Graph for Dependency Visibility (Priority: P3)

**Goal**: Developers and AI agents can query dependency relationships via `nx graph` and `nx show project`.

**Independent Test**: `nx graph` shows correct dependency tree with toride as core and 3 dependents.

### Verification for User Story 5

- [ ] T022 [US5] Run `pnpm exec nx graph --file=output.json` and verify the dependency graph shows toride as core with codegen, drizzle, prisma depending on it
- [ ] T023 [US5] Run `pnpm exec nx show project @toride/drizzle` and verify output includes targets (build, test, lint), tags (type:integration), and dependencies (toride)

**Checkpoint**: Project graph correctly represents the monorepo dependency structure

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and cleanup

- [ ] T024 Run quickstart.md validation: execute all commands from `specs/20260306120000-nx-monorepo-optimization/quickstart.md` and verify they work
- [ ] T025 Verify `.gitignore` excludes `.nx/cache` and `.nx/workspace-data`
- [ ] T026 Run full `pnpm exec nx affected -t lint test build` from clean state and verify all tasks pass

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 (Setup) - BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 (Foundational)
- **US2 (Phase 4)**: Depends on Phase 2 (Foundational)
- **US3 (Phase 5)**: Depends on Phase 2 (Foundational)
- **US4 (Phase 6)**: Depends on Phase 2 (Foundational)
- **US5 (Phase 7)**: Depends on Phase 2 (Foundational)
- **Polish (Phase 8)**: Depends on all user stories (Phases 3-7)

### User Story Dependencies

- **US1 (P1)**: After Foundational. No dependencies on other stories.
- **US2 (P2)**: After Foundational. No dependencies on other stories.
- **US3 (P2)**: After Foundational. No dependencies on other stories.
- **US4 (P3)**: After Foundational. No dependencies on other stories.
- **US5 (P3)**: After Foundational. No dependencies on other stories.

### Execution Order (Sequential, Single Developer)

```
Phase 1 (Setup) → Phase 2 (Foundational) → Phase 3 (US1) → Phase 4 (US2) → Phase 5 (US3) → Phase 6 (US4) → Phase 7 (US5) → Phase 8 (Polish)
```

### Parallel Opportunities

All user stories (Phases 3-7) are independent and could be parallelized if needed. However, the recommended sequential order above follows priority (P1 → P2 → P3).

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: Foundational (T004-T008)
3. Complete Phase 3: US1 - AI Agent Context (T009-T012)
4. **STOP and VALIDATE**: Verify CLAUDE.md and `nx show project` work correctly

### Incremental Delivery

1. Setup + Foundational → Nx is installed and configured
2. US1 → AI agents can navigate the monorepo (MVP!)
3. US2 → Cached builds working
4. US3 → Targeted tests working
5. US4 → CI pipeline ready
6. US5 → Dependency graph verified
7. Polish → Everything validated end-to-end
