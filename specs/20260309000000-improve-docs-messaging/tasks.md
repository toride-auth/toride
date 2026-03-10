# Tasks: Improve Official Docs Messaging

**Input**: Design documents from `/specs/20260309000000-improve-docs-messaging/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Not requested — no test tasks included.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story. All tasks are Markdown/config file edits.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Docs site**: `docs/` at repository root
- **VitePress config**: `docs/.vitepress/config.ts`
- **Spec reference**: `specs/20260309000000-improve-docs-messaging/`

---

## Phase 1: Setup

**Purpose**: Create branch and new file scaffolding

- [X] T001 Create feature branch `improve-docs-messaging` from `main`
- [X] T002 Create empty file `docs/guide/why-toride.md` with `# Why Toride` heading

**Checkpoint**: Branch exists, new file scaffolded

---

## Phase 2: Foundational (VitePress Config)

**Purpose**: Update sidebar and nav config so the new page is navigable — MUST complete before content changes to avoid broken links

**⚠️ CRITICAL**: Config must be updated before the Why Toride page content is written

- [X] T003 Add "Why Toride" as first Guide sidebar item and update nav link in `docs/.vitepress/config.ts` — add `{ text: "Why Toride", link: "/guide/why-toride" }` before "Getting Started" in the Guide sidebar items array; update nav Guide link to `/guide/why-toride`

**Checkpoint**: VitePress config updated — `why-toride` appears in sidebar and nav

---

## Phase 3: User Story 1 — Landing Page Communicates Value (Priority: P1) 🎯 MVP

**Goal**: Rewrite the landing page hero tagline and feature cards so visitors immediately understand Toride's three value propositions without any database-centric language.

**Independent Test**: Visit the landing page and confirm: (1) no mention of "database" as a requirement, (2) three feature cards map to YAML type safety, database-agnostic design, and relation-aware role derivation, (3) "Why Toride" is a hero action.

### Implementation for User Story 1

- [X] T004 [US1] Rewrite hero section in `docs/index.md` — replace tagline (remove "resolve relations from your database"), add "Why Toride" as primary brand action before "Get Started", keep "View on GitHub" as alt action. Draft 2-3 tagline options per `specs/20260309000000-improve-docs-messaging/research.md` Decision 1 and choose the best. Tagline must convey: type-safe YAML policies, database-agnostic design, and relation-aware role derivation.
- [X] T005 [US1] Rewrite feature cards in `docs/index.md` — replace current 3 cards with cards mapping to 3 pillars: (1) YAML Policies + Type Safety (codegen validates policies at compile time), (2) Database-Agnostic (resolvers are just functions, any data source), (3) Relation-Aware (declarative role derivation through YAML relations). Remove "Generate database-level WHERE clauses" from current Partial Evaluation card.

**Checkpoint**: Landing page conveys all three value propositions, zero occurrences of "your database"

---

## Phase 4: User Story 2 — Getting Started Page Frames Resolvers Correctly (Priority: P1)

**Goal**: Reframe resolvers as generic data-access functions that work with any data source, not database connectors.

**Independent Test**: Read the Getting Started page and confirm resolvers are described as data-access functions with "data source" as the canonical term, no database-centric language.

### Implementation for User Story 2

- [X] T006 [US2] Rewrite intro paragraph in `docs/guide/getting-started.md` (line 3) — replace "provide a resolver that connects to your database" with language framing resolvers as functions that return attributes from any data source
- [X] T007 [US2] Update ORM Adapters body in `docs/guide/getting-started.md` (line 49) — replace "database-level WHERE clauses" with "query-level constraints" or "WHERE clauses for your ORM"
- [X] T008 [US2] Update Project Setup item 2 in `docs/guide/getting-started.md` (line 75) — replace "from your database" with "from any data source". Use canonical term "data source" per spec clarification.

**Checkpoint**: Getting Started page uses "data source" consistently, zero occurrences of "your database"

---

## Phase 5: User Story 3 — Quickstart Shows In-Memory First (Priority: P1)

**Goal**: Restructure the quickstart so the first resolver example uses plain in-memory objects (no `db.*` calls), with a follow-up "Real-World: Database Resolvers" section.

**Independent Test**: Follow the quickstart using only the in-memory example and successfully run a permission check without any database dependency.

### Implementation for User Story 3

- [X] T009 [US3] Rewrite Step 3 in `docs/guide/quickstart.md` — replace the current `db.*`-based resolver example with the in-memory resolver example from `specs/20260309000000-improve-docs-messaging/quickstart.md`. Update the framing text to explain that resolvers are functions returning attributes from any data source.
- [X] T010 [US3] Add new "Real-World: Database Resolvers" section in `docs/guide/quickstart.md` after Step 4 (renumber as Step 5 or new section before "Explore More Features") — use the database resolver example from `specs/20260309000000-improve-docs-messaging/quickstart.md`. Frame as "In production, your resolvers will typically query a database."
- [X] T011 [US3] Update "What's Next" links in `docs/guide/quickstart.md` (line 218) — replace "database-level filtering" with "query-level filtering"

**Checkpoint**: Quickstart shows in-memory first, database second; in-memory example is self-contained and runnable without a database

---

## Phase 6: User Story 4 — "Why Toride" Page (Priority: P2)

**Goal**: Create a dedicated value proposition page with 5 sections covering Toride's key strengths, using technical & concise tone with code/YAML examples.

**Independent Test**: Read the "Why Toride" page and confirm it covers all 5 value propositions, contains a 3+ level YAML hierarchy example, and mentions no competitor products.

### Implementation for User Story 4

- [X] T012 [US4] Write full content for `docs/guide/why-toride.md` per the page contract in `specs/20260309000000-improve-docs-messaging/contracts/page-contracts.md`. Structure: (1) one-paragraph positioning intro, (2) "YAML as the Single Source of Truth" with policy snippet, (3) "Type Safety via Codegen" with codegen example, (4) "Database-Agnostic by Design" with in-memory resolver example, (5) "Relation-Based Policies" with 3+ level hierarchy YAML (Org → Project → Task), (6) "Partial Evaluation" with constraint generation example. Use technical & concise tone — code examples and bullet points, no marketing prose. Zero competitor product names.

**Checkpoint**: Why Toride page exists with all 5 sections, 3+ level hierarchy YAML example, no competitor names

---

## Phase 7: User Story 5 — YAML Expressiveness in Concept Pages (Priority: P2)

**Goal**: Add "single source of truth" framing to Policy Format and Roles & Relations concept pages without restructuring.

**Independent Test**: Read the Policy Format and Roles & Relations pages and confirm they emphasize YAML as the single source of truth.

### Implementation for User Story 5

- [X] T013 [P] [US5] Update intro paragraph of `docs/concepts/policy-format.md` (line 3) — add "single source of truth" framing: policies declare the entire authorization model in one file, serving as the single source of truth for who can do what
- [X] T014 [P] [US5] Update intro paragraph of `docs/concepts/roles-and-relations.md` (line 3) — add note about all five derivation patterns being declared in YAML, reinforcing YAML as the authoritative source for the authorization model
- [X] T015 [US5] Update "Resolving Relations" section in `docs/concepts/roles-and-relations.md` (line 57) — replace `db.*` example with in-memory example (plain objects), add note that resolvers work with any data source. Use canonical term "data source".

**Checkpoint**: Concept pages emphasize YAML expressiveness with "single source of truth" framing

---

## Phase 8: User Story 6 — Remove All Database-Centric Language (Priority: P2)

**Goal**: Sweep all remaining database-centric language from non-integration docs pages.

**Independent Test**: Search the entire docs directory (excluding `integrations/`) for "your database" and confirm zero occurrences.

### Implementation for User Story 6

- [X] T016 [P] [US6] Update "What's Next" link text in `docs/concepts/policy-format.md` (line 310) — replace "filter data at the database level" with "push authorization into data-layer queries"
- [X] T017 [P] [US6] Update "What's Next" link text in `docs/concepts/roles-and-relations.md` (line 342) — replace "filter data at the database level" with "push authorization into data-layer queries"
- [X] T018 [P] [US6] Update "What's Next" link text in `docs/concepts/conditions-and-rules.md` (line 471) — replace "translate conditions into database queries" with "translate conditions into data-layer queries"
- [X] T019 [P] [US6] Update "What's Next" link text in `docs/concepts/client-side-hints.md` (line 263) — replace "filter data at the database level" with "push authorization into data-layer queries"
- [X] T020 [US6] Reframe `docs/concepts/partial-evaluation.md` — update intro (line 3) to add "when your data source is a database" framing; replace "your database's query format" (line 104) with "your data store's query format"; ensure language frames partial evaluation as an optional capability for database-backed data sources, not a core requirement. Keep "database" where technically accurate (e.g., "WHERE clauses") but add conditional framing.

**Checkpoint**: Zero occurrences of "your database" or "from your database" in non-integration docs; partial evaluation page uses conditional framing

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and cleanup across all changes

- [ ] T021 Run full-text search across `docs/**/*.md` (excluding `docs/integrations/`) for banned phrases: "your database", "from your database", "connects to your database", "fetch from your database" — fix any remaining occurrences
- [ ] T022 Verify canonical term usage — search for "data provider", "data access layer", "data access functions" across all docs and replace with "data source" where referring to resolver data origins
- [ ] T023 Verify the Prisma and Drizzle integration pages use "if you use Prisma/Drizzle" framing rather than "when you connect to your database" — make minor framing adjustments only if needed in `docs/integrations/prisma.md` and `docs/integrations/drizzle.md`
- [ ] T024 Build the VitePress docs site (`cd docs && npx vitepress build`) and confirm no build errors — verify all internal links resolve correctly

**Checkpoint**: All banned phrases eliminated, canonical terminology consistent, docs site builds cleanly

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — config must be updated before Why Toride content
- **US1 Landing Page (Phase 3)**: Depends on Phase 2
- **US2 Getting Started (Phase 4)**: Depends on Phase 2
- **US3 Quickstart (Phase 5)**: Depends on Phase 2
- **US4 Why Toride (Phase 6)**: Depends on Phase 2 (config already has sidebar entry)
- **US5 Concept Framing (Phase 7)**: Depends on Phase 2
- **US6 Language Sweep (Phase 8)**: Depends on Phases 3-7 (sweep after main content changes to avoid double-editing)
- **Polish (Phase 9)**: Depends on all previous phases

### User Story Dependencies

- **US1 (Landing Page)**: Independent — can start after Phase 2
- **US2 (Getting Started)**: Independent — can start after Phase 2
- **US3 (Quickstart)**: Independent — can start after Phase 2
- **US4 (Why Toride)**: Independent — can start after Phase 2
- **US5 (Concept Framing)**: Independent — can start after Phase 2
- **US6 (Language Sweep)**: Should run AFTER US1-US5 to avoid double-editing files already changed by earlier stories

### Parallel Opportunities

- **After Phase 2**: US1, US2, US3, US4, US5 can ALL run in parallel (different files)
- **Within Phase 7 (US5)**: T013 and T014 can run in parallel (different files)
- **Within Phase 8 (US6)**: T016, T017, T018, T019 can all run in parallel (different files)

---

## Parallel Example: After Phase 2

```bash
# All P1 stories can launch together (different files):
Task: "T004 [US1] Rewrite hero section in docs/index.md"
Task: "T006 [US2] Rewrite intro paragraph in docs/guide/getting-started.md"
Task: "T009 [US3] Rewrite Step 3 in docs/guide/quickstart.md"

# P2 stories can also run in parallel with P1:
Task: "T012 [US4] Write full content for docs/guide/why-toride.md"
Task: "T013 [US5] Update intro of docs/concepts/policy-format.md"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (branch + scaffolding)
2. Complete Phase 2: Foundational (VitePress config)
3. Complete Phase 3: US1 — Landing Page
4. **STOP and VALIDATE**: Preview landing page, confirm 3 pillars, no "database"
5. Ship if ready — landing page is the highest-impact change

### Incremental Delivery

1. Setup + Foundational → Config ready
2. US1 (Landing Page) → First impression fixed (MVP!)
3. US2 (Getting Started) + US3 (Quickstart) → Core pages fixed
4. US4 (Why Toride) → Value proposition page live
5. US5 (Concept Framing) → YAML expressiveness emphasized
6. US6 (Language Sweep) → All database-centric language removed
7. Polish → Final validation, clean build

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Commit after each phase for clean git history
- All changes are Markdown edits except T003 (TypeScript config) and T024 (build verification)
- Use "data source" as canonical term everywhere (per spec clarification)
- Refer to `specs/20260309000000-improve-docs-messaging/research.md` for detailed design decisions
- Refer to `specs/20260309000000-improve-docs-messaging/quickstart.md` for in-memory resolver code examples
- Refer to `specs/20260309000000-improve-docs-messaging/contracts/page-contracts.md` for page structure contracts
