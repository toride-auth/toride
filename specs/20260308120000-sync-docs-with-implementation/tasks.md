# Tasks: Sync Documentation with Implementation

**Input**: Design documents from `/specs/20260308120000-sync-docs-with-implementation/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Not included (not requested).

**Organization**: All tasks in a single phase given the small scope (3 files, docs-only changes).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Sync Documentation with Actual API

**Goal**: Rewrite the Quickstart guide to use the correct `resolvers` map pattern, fix Getting Started terminology, and remove the outdated spec.md file.

**Independent Test**: All code snippets compile against `toride` exports; no docs file contains `getRoles`, `getRelated`, `RelationResolver`, or the old 3-method pattern; VitePress builds without errors.

### Implementation

- [ ] T001 [P] [US1] Rewrite the resolver section in `docs/guide/quickstart.md` — replace the `RelationResolver` import and 3-method object with the per-type `resolvers` map pattern (`Task` and `Project` resolvers returning flat attribute objects with relation refs)
- [ ] T002 [P] [US1] Update the engine constructor in `docs/guide/quickstart.md` — change `new Toride({ policy, resolver })` to `new Toride({ policy, resolvers: { ... } })` with the inline resolvers map
- [ ] T003 [P] [US1] Replace the resolver explanation table in `docs/guide/quickstart.md` — remove the 3-row `getRoles`/`getRelated`/`getAttributes` table and replace with a prose explanation of per-type resolver functions that return attributes and relation refs
- [ ] T004 [P] [US1] Update the policy example in `docs/guide/quickstart.md` — add `derived_roles` entries on the Project resource showing at least 3 patterns (global_role, from_role+on_relation, actor_type+when) to demonstrate role derivation without `getRoles`
- [ ] T005 [P] [US1] Rewrite the "How it works" step-by-step in `docs/guide/quickstart.md` — replace `getRoles`/`getRelated` flow with: derive roles via policy → resolve attributes via resolvers → traverse relations → expand grants → evaluate rules
- [ ] T006 [P] [US2] Update resolver description in `docs/guide/getting-started.md` — change "how to look up roles, relations, and attributes" to "how to fetch attributes for each resource type"
- [ ] T007 [P] [US2] Update project structure listing in `docs/guide/getting-started.md` — change `resolver.ts  # Relation resolver` to `resolver.ts  # Resource resolvers`
- [ ] T008 [P] [US3] Delete the file `docs/spec.md`

**Checkpoint**: All 3 user stories complete. Quickstart uses correct `resolvers` map pattern, Getting Started uses correct terminology, outdated spec.md is removed.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1**: No dependencies — can start immediately. All tasks operate on different files or independent sections.

### User Story Dependencies

- **US1 (P1)**: No dependencies. T001–T005 all edit different sections of `docs/guide/quickstart.md` — they should be applied sequentially within the file but can be authored in parallel.
- **US2 (P2)**: No dependencies on US1. T006–T007 edit `docs/guide/getting-started.md`.
- **US3 (P3)**: No dependencies on US1 or US2. T008 deletes `docs/spec.md`.

### Parallel Opportunities

- T001–T005 (US1) edit the same file but different sections — an LLM agent can apply them all in one pass
- T006–T007 (US2) edit a different file — fully parallel with US1
- T008 (US3) is a file deletion — fully parallel with US1 and US2
- All 3 user stories can be executed simultaneously by different agents

---

## Implementation Strategy

### Single Pass Delivery

1. All tasks are in one phase — execute T001–T008
2. **VALIDATE**: Run `pnpm --filter docs build` to verify VitePress builds cleanly
3. **VALIDATE**: Grep `docs/` for removed terms (`getRoles`, `getRelated`, `RelationResolver`) — expect zero matches
4. Commit and PR

---

## Notes

- [P] tasks = different files or independent sections, no dependencies
- [Story] label maps task to specific user story for traceability
- Code snippets in quickstart MUST match actual `toride` package exports (see data-model.md for exact types)
- Use pseudocode DB calls (`db.task.findById`) consistent with other concept pages (see research.md R5)
- Refer to `specs/20260308120000-sync-docs-with-implementation/quickstart.md` for exact before/after content
