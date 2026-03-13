# Tasks: Policy JSON Schema & IDE Integration

**Input**: Design documents from `/specs/20260313080428-policy-schema-ide-integration/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included (TDD — tests before implementation)

**Organization**: US1+US2 merged (schema + build integration), US3 (CLI docs), US4 (IDE setup docs)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Project structure and scaffolding for schema generation

- [X] T001 Create `packages/toride/scripts/` directory and `packages/toride/schema/` directory
- [X] T002 [P] Add `"schema"` to the `files` array in `packages/toride/package.json` so the generated schema is included in the npm package

**Checkpoint**: Directories and package config ready for schema generation work

---

## Phase 2: Schema Generation & Build Integration (US1 + US2, Priority: P1) 🎯 MVP

**Goal**: Generate a JSON Schema from valibot `PolicySchema`, integrate into the build pipeline, and enforce freshness in CI

**Independent Test**: Run `pnpm run build` in `packages/toride/`, verify `schema/policy.schema.json` is generated. Open a policy YAML with the schema comment in VS Code — get red squiggles on invalid keys. Modify a valibot schema, rebuild, verify the JSON Schema updates. Run `git diff --exit-code packages/toride/schema/policy.schema.json` to simulate CI check.

### Tests for US1+US2

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [X] T003 [P] [US1] Write unit tests for the valibot-to-JSON-Schema converter in `packages/toride/tests/generate-schema.test.ts` — test each valibot construct mapping (object, string, literal, picklist, array, record, optional, union, unknown, lazy) and verify correct JSON Schema output per research.md R1 mapping table
- [X] T004 [P] [US1] Write snapshot test in `packages/toride/tests/generate-schema.test.ts` that imports the real `PolicySchema`, runs the converter, and snapshots the full generated JSON Schema output for regression detection

### Implementation for US1+US2

- [X] T005 [US1] Implement the hand-written valibot-to-JSON-Schema converter script in `packages/toride/scripts/generate-schema.mjs` — import compiled valibot schemas from `dist/`, pattern-match on valibot types per research.md R1 table, handle recursive `ConditionExpression` via `$defs`/`$ref` (R2), add `title`/`description` metadata (R7), output `schema/policy.schema.json` conforming to the contract in `contracts/json-schema-contract.md`
- [X] T006 [US2] Update `packages/toride/tsup.config.ts` to add an `onSuccess` hook that runs `node scripts/generate-schema.mjs` after compilation (R3)
- [X] T007 [US2] Add schema drift check step to `.github/workflows/ci.yml` — after the build step, run `git diff --exit-code packages/toride/schema/policy.schema.json` with a clear failure message (R4)
- [X] T008 [US1] Run `pnpm exec nx run toride:build` to generate `packages/toride/schema/policy.schema.json` and commit the generated file

**Checkpoint**: Schema generation works end-to-end — build produces the JSON Schema, tests pass, CI will catch drift

---

## Phase 3: User Story 3 — CLI Reference Documentation (Priority: P2)

**Goal**: Document the existing `toride validate` and `toride test` CLI commands on the docs site

**Independent Test**: Visit the docs site, navigate to the CLI reference page, verify all commands, flags, exit codes, and examples are documented per `contracts/cli-reference-contract.md`

### Implementation for US3

- [X] T009 [US3] Create CLI reference docs page at `docs/reference/cli.md` — document `toride validate` (synopsis, `--strict` flag, exit codes, output examples) and `toride test` (synopsis, glob support, inline vs separate test files, exit codes, output examples) per `contracts/cli-reference-contract.md`
- [X] T010 [US3] Update VitePress sidebar config in `docs/.vitepress/config.ts` to add a "Reference" top-level section with the CLI reference page link

---

## Phase 4: User Story 4 — IDE Setup Guide (Priority: P2)

**Goal**: Guide developers to configure their editor to use the toride JSON Schema for policy file validation

**Independent Test**: Follow the guide from scratch in a fresh VS Code workspace with the Red Hat YAML extension — verify schema validation works with both per-file comment and workspace settings methods

### Implementation for US4

- [X] T011 [P] [US4] Create IDE setup guide at `docs/reference/ide-setup.md` — cover VS Code + Red Hat YAML extension setup, per-file schema comment method, workspace settings method (both from `contracts/json-schema-contract.md` integration points), and a general note for other editors supporting YAML language server
- [X] T012 [US4] Update VitePress sidebar config in `docs/.vitepress/config.ts` to add the IDE setup guide link under the "Reference" section (alongside CLI reference from T010)

**Checkpoint**: Both docs pages live, sidebar updated, reference section complete

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and cleanup

- [X] T013 Run all tests via `pnpm exec nx run toride:test` and fix any failures
- [X] T014 Run full build via `pnpm run build` and verify schema output matches snapshot
- [X] T015 Validate quickstart.md workflow end-to-end: install, add schema comment, verify IDE validation works
- [X] T016 Run `pnpm run lint` across all affected packages and fix any issues

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **US1+US2 (Phase 2)**: Depends on Phase 1 — core MVP
- **US3 (Phase 3)**: Depends on Phase 1 only (no code dependency on schema work) — can run in parallel with Phase 2
- **US4 (Phase 4)**: Depends on Phase 2 (needs the generated schema to exist for the guide to reference) — runs after Phase 2
- **Polish (Phase 5)**: Depends on all previous phases

### User Story Dependencies

- **US1+US2 (P1, merged)**: Core schema generation — no dependencies on other stories
- **US3 (P2)**: CLI docs — fully independent, can start after setup
- **US4 (P2)**: IDE setup guide — references the schema file path, so benefits from US1+US2 being done first

### Parallel Opportunities

- T003 and T004 (tests) can run in parallel
- T009 (CLI docs) can run in parallel with Phase 2 entirely
- T011 (IDE setup guide) can run in parallel with T009 (different files)
- T010 and T012 (sidebar config updates) should be sequential (same file)

---

## Parallel Example: Phase 2 (US1+US2)

```bash
# Launch tests in parallel:
Task: T003 "Unit tests for converter in packages/toride/tests/generate-schema.test.ts"
Task: T004 "Snapshot test for full PolicySchema output in packages/toride/tests/generate-schema.test.ts"

# Then implementation (sequential — converter before build hook):
Task: T005 "Converter script in packages/toride/scripts/generate-schema.mjs"
Task: T006 "tsup onSuccess hook in packages/toride/tsup.config.ts"
Task: T007 "CI drift check in .github/workflows/ci.yml"
Task: T008 "Generate and commit schema/policy.schema.json"
```

---

## Implementation Strategy

### MVP First (US1+US2 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: US1+US2 (converter + build + CI)
3. **STOP and VALIDATE**: Build generates schema, tests pass, IDE validation works
4. Ship — developers get IDE validation immediately

### Incremental Delivery

1. Setup → Foundation ready
2. US1+US2 → Schema generation works → **MVP shipped**
3. US3 → CLI reference docs live
4. US4 → IDE setup guide live → Feature complete
5. Polish → All validations pass

### Suggested takt Usage

```bash
# Phase 1: Setup
takt run coder "Create packages/toride/scripts/ and schema/ directories, add schema to package.json files array"

# Phase 2: US1+US2 — Schema Generation & Build Integration
takt run coder "Write unit and snapshot tests for valibot-to-JSON-Schema converter in packages/toride/tests/generate-schema.test.ts"
takt run coder "Implement valibot-to-JSON-Schema converter in packages/toride/scripts/generate-schema.mjs, update tsup.config.ts onSuccess hook, add CI drift check to .github/workflows/ci.yml, generate and commit schema/policy.schema.json"

# Phase 3: US3 — CLI Reference Documentation
takt run coder "Create CLI reference docs at docs/reference/cli.md and add Reference section to VitePress sidebar in docs/.vitepress/config.ts"

# Phase 4: US4 — IDE Setup Guide
takt run coder "Create IDE setup guide at docs/reference/ide-setup.md and add to VitePress sidebar Reference section"

# Phase 5: Polish
takt run coder "Run all tests, full build, lint, and validate quickstart.md workflow end-to-end"
```

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Verify tests fail before implementing (TDD)
- Commit after each task or logical group
- Stop at any checkpoint to validate independently
