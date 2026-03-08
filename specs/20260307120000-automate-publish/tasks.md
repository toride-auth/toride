# Tasks: Automated npm Package Publishing

**Input**: Design documents from `/specs/20260307120000-automate-publish/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/workflow-contract.md, quickstart.md

**Tests**: No tests — CI workflow is validated via dry-run and manual tag push (per plan.md).

**Organization**: Single-phase implementation. All 3 user stories build incrementally on the same workflow file (`.github/workflows/publish.yml`).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Automated npm Publish Pipeline

**Purpose**: Set up Nx release configuration, install dependencies, and create the full publish workflow covering stable releases (US1), pre-releases (US2), and GitHub Release creation (US3).

### Setup

- [X] T001 [P] Add `@nx/js` dev dependency to root package.json
- [X] T002 [P] Add `release` configuration block to nx.json with `projects: ["packages/*"]`, `conventionalCommits: false`, `changelog.enabled: false`

### User Story 1 — Stable Publish (P1)

- [X] T003 [US1] Create `.github/workflows/publish.yml` with `on: push: tags: ['v*']` trigger, concurrency control (`group: publish`, `cancel-in-progress: true`), and permissions (`contents: write`, `id-token: write`, `actions: read`)
- [X] T004 [US1] Add tag validation step: extract version from tag, validate semver format, derive `is_prerelease` and `dist_tag` values as job outputs
- [X] T005 [US1] Add branch check step: verify tagged commit is on `main` for stable releases (skip for pre-releases)
- [X] T006 [US1] Add setup steps: checkout, pnpm setup, Node.js 20, install dependencies
- [X] T007 [US1] Add version bump step: `pnpm exec nx release version $VERSION` to update all package.json files
- [X] T008 [US1] Add CI checks step: `pnpm exec nx run-many -t lint test build`
- [X] T009 [US1] Add publish step: `pnpm exec nx release publish` with `--tag $DIST_TAG`, npm auth via `NPM_TOKEN` secret, `--provenance`, and `--access public` for scoped packages

### User Story 2 — Pre-release Publish (P2)

- [X] T010 [US2] Add pre-release dist-tag derivation logic: extract first segment before first `.` in prerelease identifier (e.g., `beta.1` → `beta`) in the tag validation step of `.github/workflows/publish.yml`
- [X] T011 [US2] Ensure publish step uses derived dist-tag (`beta`, `rc`, `alpha`, etc.) instead of `latest` for pre-release tags in `.github/workflows/publish.yml`

### User Story 3 — GitHub Release (P3)

- [X] T012 [US3] Add GitHub Release creation step after successful publish: use `gh release create` or `actions/create-release` with auto-generated release notes in `.github/workflows/publish.yml`
- [X] T013 [US3] Mark GitHub Release as pre-release when tag contains a pre-release identifier in `.github/workflows/publish.yml`

### Polish

- [X] T014 Validate workflow end-to-end: dry-run with `act` or review YAML syntax, verify all FR requirements (FR-001 through FR-015) are covered in `.github/workflows/publish.yml`

**Checkpoint**: Complete publish pipeline — push a `v*` tag to trigger automated publish of all 4 packages with provenance, correct dist-tags, and GitHub Release creation.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1**: Single phase — no inter-phase dependencies.

### Task Dependencies

- **T001, T002**: Independent setup tasks, can run in parallel.
- **T003–T009 (US1)**: Sequential within the workflow file — each step builds on the previous. T003 creates the file, T004–T009 add steps.
- **T010–T011 (US2)**: Extend the workflow created in US1. Depend on T004 (tag validation) and T009 (publish step).
- **T012–T013 (US3)**: Add GitHub Release step after publish. Depend on T009 (publish step).
- **T014 (Polish)**: Depends on all previous tasks.

### Within the Workflow

Since all user stories modify the same file (`.github/workflows/publish.yml`), tasks are **sequential** — no parallelism within US1/US2/US3 workflow tasks. Only T001 and T002 (different files) can run in parallel.

### Parallel Opportunities

```
Parallel group 1: T001 (package.json) + T002 (nx.json)
Sequential:       T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010 → T011 → T012 → T013 → T014
```

---

## Implementation Strategy

### Single Increment (All Stories)

1. Complete T001 + T002 (setup — parallel)
2. Build workflow file incrementally: T003 → T014
3. **VALIDATE**: Review workflow YAML against spec requirements
4. Test with a real tag push (manual validation)

### MVP Scope

US1 (stable publish) is the minimum viable feature. After T009, the workflow is functional for stable releases. US2 and US3 add pre-release and GitHub Release support incrementally.

---

## Notes

- All workflow tasks modify `.github/workflows/publish.yml` — commit after logical groups (e.g., after US1, after US2, after US3)
- npm `NPM_TOKEN` must be configured as a GitHub repository secret before first use
- First publish should use `--first-release` flag (see quickstart.md)
- Scoped packages (`@toride/*`) require `--access public`
