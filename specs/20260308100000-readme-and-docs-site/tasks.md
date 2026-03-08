# Tasks: README and Official Documentation Site

**Input**: Design documents from `/specs/20260308100000-readme-and-docs-site/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/docs-site-structure.md

**Tests**: No automated tests (spec exemption — VitePress build success serves as validation).

**Organization**: Tasks grouped by user story for independent implementation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Exact file paths included in descriptions

---

## Phase 1: Setup

**Purpose**: Initialize VitePress project and docs directory structure

- [X] T001 Create `docs/package.json` with VitePress 1.6.4 dependency and dev/build/preview scripts
- [X] T002 Create VitePress config in `docs/.vitepress/config.ts` with base path `/toride/`, site title, description, search provider, sidebar navigation, nav bar, and social links per contracts/docs-site-structure.md
- [X] T003 Create `.gitignore` entries for `docs/.vitepress/dist/` and `docs/.vitepress/cache/` (add to root `.gitignore` or create `docs/.gitignore`)

**Checkpoint**: `cd docs && pnpm install && pnpm build` succeeds (may need a placeholder index.md)

---

## Phase 2: User Story 1 — Discover Toride on GitHub (Priority: P1)

**Goal**: A developer visiting the repo sees a clear README with description, badges, features, install, usage example, package list, and docs link.

**Independent Test**: View README on GitHub — all sections render, badges resolve, code example is valid TypeScript, docs link works.

- [X] T004 [US1] Create root `README.md` with badge row (npm version, license, CI status), one-liner description, key features list, install command, minimal usage example (policy YAML + resolver + `can()` check), packages table (all 4 packages), and link to documentation site

**Checkpoint**: README renders correctly on GitHub with all required sections (FR-001 through FR-004b).

---

## Phase 3: User Story 2 — Browse Documentation Site for Getting Started (Priority: P1)

**Goal**: A developer visits the docs site, sees a landing page, and navigates through installation and quickstart guides.

**Independent Test**: Run `pnpm dev` in `docs/`, navigate landing → getting started → quickstart. All pages render, navigation works, code examples are complete.

- [ ] T005 [US2] Create landing page `docs/index.md` with VitePress hero frontmatter (name: Toride, tagline, description, "Get Started" CTA → `/guide/getting-started`, "View on GitHub" secondary button). No code examples on landing page.
- [ ] T006 [US2] Create getting started guide `docs/guide/getting-started.md` with installation instructions for all 4 packages, basic project setup, and link to quickstart
- [ ] T007 [US2] Create quickstart guide `docs/guide/quickstart.md` with step-by-step walkthrough: define YAML policy, implement resolver, create engine, run first `can()` check

**Checkpoint**: Docs site landing page renders with hero, navigation to Guide section works, getting-started and quickstart pages are complete and render correctly.

---

## Phase 4: User Story 3 — Learn Core Concepts In-Depth (Priority: P2)

**Goal**: Concept guides covering policy format, roles/relations, conditions/rules, partial evaluation, and client-side hints — each with explanations, YAML syntax, and TypeScript examples.

**Independent Test**: Navigate to each concept page, verify explanations are clear, code examples are present, cross-links to related concepts work.

- [ ] T008 [US3] Create policy format guide `docs/concepts/policy-format.md` covering YAML policy structure, resource types, actions, roles, rules, and conditions
- [ ] T009 [US3] Create roles and relations guide `docs/concepts/roles-and-relations.md` covering direct roles, derived roles (all 5 derivation sources), global roles, and relation definitions
- [ ] T010 [US3] Create conditions and rules guide `docs/concepts/conditions-and-rules.md` covering permit/forbid rules, ABAC conditions, condition expressions, and rule evaluation order
- [ ] T011 [US3] Create partial evaluation guide `docs/concepts/partial-evaluation.md` covering `buildConstraints()`, constraint output format, and usage with Prisma/Drizzle adapters
- [ ] T012 [US3] Create client-side hints guide `docs/concepts/client-side-hints.md` covering permission snapshots for UI rendering, `buildPermissionHints()`, and frontend usage patterns

**Checkpoint**: All 5 concept pages render, cross-links between concepts work, each page has YAML and TypeScript examples.

---

## Phase 5: User Story 4 — Read Integration Package Docs (Priority: P2)

**Goal**: Dedicated pages for @toride/prisma, @toride/drizzle, and @toride/codegen with installation, configuration, and usage examples.

**Independent Test**: Navigate to each integration page, verify install instructions, adapter setup, and at least one complete usage example per page.

- [ ] T013 [US4] Create Prisma integration guide `docs/integrations/prisma.md` with install instructions, adapter creation, and complete `buildConstraints()` → Prisma WHERE example
- [ ] T014 [US4] Create Drizzle integration guide `docs/integrations/drizzle.md` with install instructions, adapter creation, and complete `buildConstraints()` → Drizzle WHERE example
- [ ] T015 [US4] Create Codegen integration guide `docs/integrations/codegen.md` with install instructions, CLI usage, and TypeScript type generation from policy files

**Checkpoint**: All 3 integration pages render with complete install + usage examples. Cross-links to partial evaluation concept page work.

---

## Phase 6: User Story 5 — Docs Site is Deployed Automatically (Priority: P2)

**Goal**: GitHub Actions workflow builds and deploys docs to GitHub Pages on `main` pushes affecting `docs/**`, with manual dispatch support.

**Independent Test**: Push a docs change to `main`, verify workflow triggers, builds, and deploys. Push a non-docs change, verify workflow is skipped.

- [ ] T016 [US5] Create GitHub Actions workflow `.github/workflows/deploy-docs.yml` with push trigger (path filter `docs/**`), `workflow_dispatch`, Node 20 + pnpm setup, VitePress build in `docs/`, artifact upload via `actions/upload-pages-artifact@v3`, and deployment via `actions/deploy-pages@v4`. Set permissions (contents: read, pages: write, id-token: write) and concurrency group.

**Checkpoint**: Workflow file is valid YAML, references correct actions versions, has proper path filters and permissions.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and cross-cutting improvements

- [ ] T017 Verify all cross-links between pages (guide → concepts, concepts → integrations, integrations → concepts) are correct
- [ ] T018 Run `cd docs && pnpm install && pnpm build` to verify the full site builds without errors
- [ ] T019 Verify README docs link points to correct GitHub Pages URL (`https://toride-auth.github.io/toride/`)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (US1 - README)**: No dependency on docs setup — can start after or in parallel with Phase 1
- **Phase 3 (US2 - Getting Started)**: Depends on Phase 1 (needs VitePress config and project structure)
- **Phase 4 (US3 - Concepts)**: Depends on Phase 1
- **Phase 5 (US4 - Integrations)**: Depends on Phase 1
- **Phase 6 (US5 - Deployment)**: Depends on Phase 1 (workflow references docs build)
- **Phase 7 (Polish)**: Depends on all previous phases

### Parallel Opportunities

- Phase 1 and Phase 2 can run in parallel (README is independent of docs site)
- Phases 3, 4, 5, 6 can all run in parallel after Phase 1 completes (different files, no dependencies between stories)
- Within Phase 4: all 5 concept pages can be written in parallel
- Within Phase 5: all 3 integration pages can be written in parallel

---

## Implementation Strategy

### MVP First (US1 + US2)

1. Complete Phase 1: Setup (VitePress project)
2. Complete Phase 2: US1 (README)
3. Complete Phase 3: US2 (Landing + Getting Started + Quickstart)
4. **STOP and VALIDATE**: README renders on GitHub, docs site builds and serves locally
5. The core developer experience (discover → get started) is complete

### Incremental Delivery

1. Setup + README + Getting Started → MVP (developer can discover and start using toride)
2. Add Concept Guides → Proficient users (understand advanced features)
3. Add Integration Docs → Production users (set up Prisma/Drizzle adapters)
4. Add Deployment Workflow → Automated publishing (docs stay in sync)
5. Polish → Cross-link validation, build verification
