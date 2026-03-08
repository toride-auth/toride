# Tasks: Release Conventions & AI-Assisted Release Prep

**Input**: Design documents from `specs/20260308023450-release-conventions/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not included (this feature is tooling/configuration with manual verification only).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install tooling devDependencies and configure postinstall hook for automatic Lefthook setup.

- [x] T001 Add devDependencies (`lefthook`, `@commitlint/cli`, `@commitlint/config-conventional`) and `"postinstall": "lefthook install"` script to `package.json` (root)

**Checkpoint**: `pnpm install` succeeds and `lefthook install` runs automatically via postinstall hook.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add Conventional Commits instructions to CLAUDE.md so Claude Code generates compliant commit messages in all subsequent work.

**CRITICAL**: This must be in place before any user story work begins, as it establishes the commit convention that US1 and US2 depend on.

- [x] T002 Add Conventional Commits instructions section to `CLAUDE.md` — include allowed types (`feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `ci`, `build`), optional scopes (`toride`, `codegen`, `drizzle`, `prisma`), breaking change syntax (`type!:` or `BREAKING CHANGE:` footer), and commit message format rules per `contracts/conventional-commits-contract.md`

**Checkpoint**: CLAUDE.md contains complete Conventional Commits instructions. Claude Code will use this format for all future commits in this project.

---

## Phase 3: User Story 1 - AI-Assisted Release Preparation (Priority: P1) MVP

**Goal**: A `/release` Claude Code slash command that analyzes commits since the last tag, determines the semver bump, generates a Keep a Changelog entry, and outputs the exact git commands to run.

**Independent Test**: Run `/release` after making several commits. Verify it identifies the bump type, produces a readable changelog, and outputs copy-pasteable git commands. Also test with no unreleased commits to confirm "No unreleased changes" behavior.

### Implementation for User Story 1

- [x] T003 [US1] Create the `/release` skill prompt at `.claude/commands/release.md` implementing all behavior from `contracts/release-skill-contract.md`: pre-flight checks (uncommitted changes, branch warning, no unreleased changes), commit analysis with Conventional Commits semantics (fix→patch, feat→minor, feat!/BREAKING CHANGE→major), grouped changelog output (Added, Changed, Fixed, Removed), lockstep version update across all 5 `package.json` files (root + 4 packages), draft CHANGELOG.md entry in Keep a Changelog format, version override support, pre-release support, and exact git commands output (commit → tag → push). The skill MUST NOT execute `git tag` or `git push` itself. It MAY write CHANGELOG.md and update package.json files after maintainer approval.

**Checkpoint**: `/release` command is available in Claude Code and produces correct output when run against the repository.

---

## Phase 4: User Story 2 - Conventional Commits Enforcement (Priority: P2)

**Goal**: Git commit-msg hook that validates Conventional Commits format, rejecting non-compliant commits with a helpful error message.

**Independent Test**: Attempt to commit with a non-conventional message (e.g., `git commit -m "bad message"`) and verify it's rejected. Then commit with a valid message (e.g., `git commit -m "fix: test"`) and verify it succeeds.

### Implementation for User Story 2

- [x] T004 [P] [US2] Create `lefthook.yml` at repo root with a `commit-msg` hook that runs `pnpm exec commitlint --edit {1}` per `research.md` Decision 3
- [x] T005 [P] [US2] Create `commitlint.config.js` at repo root with `export default { extends: ['@commitlint/config-conventional'] }` per `research.md` Decision 3

**Checkpoint**: A non-conventional commit message is rejected by the hook. A conventional commit message passes. `pnpm install` in a fresh clone auto-installs the hooks.

---

## Phase 5: User Story 3 - Publish Workflow & GitHub Releases (Priority: P3)

**Goal**: A tag-triggered GitHub Actions workflow that publishes all 4 packages to npm and creates a GitHub Release with changelog content.

**Independent Test**: Push a `v*` tag and verify the workflow triggers, builds all packages, publishes to npm, and creates a GitHub Release with the correct changelog entry.

### Implementation for User Story 3

- [x] T006 [US3] Create `.github/workflows/publish.yml` per `contracts/publish-workflow-contract.md`: trigger on `push: tags: ['v*']`, checkout → setup pnpm + Node.js 20 → `pnpm install --frozen-lockfile` → `pnpm exec nx run-many -t build` → extract changelog entry for tagged version from CHANGELOG.md → publish each package (`pnpm publish --filter <pkg> --no-git-checks --access public`) → create GitHub Release with `gh release create` using extracted changelog as notes. Permissions: `contents: write`. Secrets: `NPM_TOKEN`.

**Checkpoint**: The workflow file is valid YAML and contains all required steps. Actual publishing is verified on the first real release.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end validation of the complete release workflow.

- [x] T007 Run `quickstart.md` validation — verify the documented release flow works: conventional commit → `/release` → review changelog → git commands → tag push → publish workflow triggers
- [x] T008 Review all acceptance scenarios from `spec.md` and verify each is addressed by the implementation

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup (Phase 1) — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational (Phase 2)
- **US2 (Phase 4)**: Depends on Setup (Phase 1) — can run in parallel with US1
- **US3 (Phase 5)**: Depends on Foundational (Phase 2) — can run in parallel with US1 and US2
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Depends on Phase 2 (CLAUDE.md instructions). No dependencies on other stories.
- **User Story 2 (P2)**: Depends on Phase 1 (devDependencies installed). Can run in parallel with US1.
- **User Story 3 (P3)**: Depends on Phase 2 (CLAUDE.md instructions). Can run in parallel with US1 and US2.

### Within Each User Story

- US1: Single task (the prompt file encompasses all release skill logic)
- US2: lefthook.yml and commitlint.config.js can be created in parallel [P]
- US3: Single task (the workflow file)

### Parallel Opportunities

- T004 and T005 (US2) can run in parallel — different files, no dependencies
- US1 (Phase 3), US2 (Phase 4), and US3 (Phase 5) can all run in parallel after their prerequisites are met
- In practice (single developer): Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (install devDependencies)
2. Complete Phase 2: Foundational (CLAUDE.md instructions)
3. Complete Phase 3: User Story 1 (/release skill)
4. **STOP and VALIDATE**: Run `/release` and verify output
5. The maintainer can now do AI-assisted releases

### Incremental Delivery

1. Setup + Foundational → Convention established
2. Add US1 → AI-assisted releases work (MVP!)
3. Add US2 → Commits are enforced by git hooks
4. Add US3 → Releases auto-publish and create GitHub Releases
5. Polish → Full end-to-end validation

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- This feature is entirely config/tooling — no runtime code changes
- CHANGELOG.md is created by the `/release` skill at runtime, not as a setup task
- All acceptance scenarios from spec.md should be covered by the skill prompt and workflow
