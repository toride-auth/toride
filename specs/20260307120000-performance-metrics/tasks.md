# Tasks: Continuous Performance Metrics

**Input**: Design documents from `/specs/20260307120000-performance-metrics/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Compare script unit tests only (compare.test.ts)

**Organization**: Tasks grouped by user story. US1 (CI regression), US3 (PR comment), and US4 (artifacts) are merged into a single CI phase since they share `benchmark.yml`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Add bench target to the Nx monorepo and create the directory structure for benchmarks.

- [X] T001 Add `"bench": "vitest bench"` script to `packages/toride/package.json`
- [X] T002 Add `bench` target defaults to `nx.json` with `cache: false`
- [X] T003 Create benchmark directory structure: `packages/toride/bench/`, `packages/toride/bench/fixtures/`, `packages/toride/bench/helpers/`

**Checkpoint**: `pnpm exec nx run toride:bench` is recognized as a target (will fail since no bench files exist yet)

---

## Phase 2: Foundational (Benchmark Fixtures & Setup Helper)

**Purpose**: Create the three tier-specific policy fixture files and the shared setup helper that loads policies, creates engines, and provides mock resolvers. ALL user stories depend on this.

**CRITICAL**: No benchmark cases or comparison logic can be implemented until fixtures and setup helper are complete.

- [X] T004 Create small tier YAML policy fixture (~5 resources, simple roles, no conditions, no derived roles) in `packages/toride/bench/fixtures/small.yaml`
- [X] T005 [P] Create medium tier YAML policy fixture (~20 resources, derived roles, conditions, relations, field_access on 3 resources) in `packages/toride/bench/fixtures/medium.yaml`
- [X] T006 [P] Create large tier YAML policy fixture (50+ resources, deep derivation chains, complex conditions, forbid rules, field_access on 15+ resources) in `packages/toride/bench/fixtures/large.yaml`
- [X] T007 Implement shared benchmark setup helper in `packages/toride/bench/helpers/setup.ts` — exports functions to: load YAML fixture by tier name, create a Toride engine instance from a fixture, provide mock resolvers per tier that return appropriate attributes for condition evaluation (synchronous-like async for isolating engine perf from I/O)

**Checkpoint**: Setup helper can load all three fixtures and create working engine instances. Verify by importing in a scratch file and calling `can()` against each tier.

---

## Phase 3: User Story 2 — Developer Runs Benchmarks Locally (Priority: P2)

**Goal**: A developer runs `pnpm exec nx run toride:bench` from the repo root and sees results for all 9 operations across all 3 tiers.

**Independent Test**: Run the benchmark command locally and verify it produces readable output with timing data for all 27 operation-tier combinations in under 60 seconds.

### Implementation

- [ ] T008 [US2] Create `packages/toride/bench/operations.bench.ts` with all 27 benchmark cases (9 operations x 3 tiers). Use `describe()` blocks per tier and `bench()` calls per operation. Naming convention: `"{operation} - {tier}"` (e.g., `"can - small"`). Operations: `can`, `canBatch`, `permittedActions`, `buildConstraints`, `explain`, `snapshot`, `canField`, `permittedFields`, `resolvedRoles`. Import setup helper for engine creation and mock resolvers.
- [ ] T009 [US2] Run `pnpm exec nx run toride:bench` and verify: all 27 cases execute, output shows ops/sec and median times, total runtime < 60 seconds. Tune iteration counts if needed.

**Checkpoint**: `pnpm exec nx run toride:bench` produces a complete table of all 27 benchmark cases with stable timing data.

---

## Phase 4: User Stories 1+3+4 — CI Pipeline: Regression Detection, PR Comment, Artifacts (Priorities: P1+P2+P3)

**Goal**: A GitHub Actions workflow runs benchmarks on every PR, compares results against a main-branch baseline, posts a comparison comment on the PR, fails the check on >= 20% regression, and uploads results as a downloadable CI artifact.

**Independent Test**: Open a test PR with an intentional slowdown; verify CI fails with a clear regression report, a comparison comment is posted, and JSON artifacts are downloadable.

### Tests

- [ ] T010 [US1] Write unit tests for the comparison script in `packages/toride/bench/compare.test.ts`. Cover: normal comparison with no regressions (exit 0), comparison with >= 20% regression (exit 1), first run without baseline (exit 0), new operation in PR but not baseline (status "new", no failure), missing operation in PR (status "missing", no failure), markdown output format validation, threshold override via `--threshold` flag, invalid/missing input file handling (exit 2).

### Implementation

- [ ] T011 [US1] Implement the comparison script in `packages/toride/bench/compare.ts`. Parse vitest bench JSON output (extract operation and tier from bench names via `"{operation} - {tier}"` convention). Accept CLI args: `--baseline`, `--current`, `--threshold` (default 0.20), `--output`, `--markdown`. Produce `ComparisonReport` JSON per data-model.md. Generate markdown summary table per contracts/compare-cli.md. Exit 0 (no regressions / first run), 1 (regressions), 2 (script error).
- [ ] T012 [US1] Verify compare.test.ts passes with `pnpm exec nx run toride:test`
- [ ] T013 [US1] [US3] [US4] Create `.github/workflows/benchmark.yml` — GitHub Actions workflow triggered on `pull_request` targeting `main`. Steps: (1) checkout main, install deps, build toride, run `vitest bench --reporter=json --outputFile=baseline.json`, (2) checkout PR branch, install deps, build toride, run `vitest bench --reporter=json --outputFile=current.json`, (3) run `npx tsx packages/toride/bench/compare.ts --baseline baseline.json --current current.json --threshold 0.20 --output report.json --markdown summary.md`, (4) post/update PR comment using `github-script` with `<!-- toride-benchmark -->` marker, (5) upload `report.json` as CI artifact, (6) fail job if compare.ts exits 1. Set `permissions: pull-requests: write`.
- [ ] T014 [US1] Add error handling in `benchmark.yml` to distinguish benchmark infrastructure failures from performance regressions (check compare.ts exit code 2 vs 1, report accordingly).

**Checkpoint**: Full CI pipeline functional. A PR with intentional slowdown fails with clear regression report. A clean PR passes with comparison comment. JSON artifact is downloadable.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and edge case handling.

- [ ] T015 Validate quickstart.md scenarios end-to-end: local benchmark run, local comparison of two runs, verify documented commands work as written
- [ ] T016 Handle edge case: first-ever run on a new repo (no main branch baseline exists). Verify compare.ts exits 0 and benchmark.yml posts an informational comment
- [ ] T017 Handle edge case: new operation added to engine. Verify comparison reports it as "new" without failing

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1
- **Phase 3 (US2 — Local Benchmarks)**: Depends on Phase 2
- **Phase 4 (US1+US3+US4 — CI Pipeline)**: Depends on Phase 3 (needs working bench files)
- **Phase 5 (Polish)**: Depends on Phase 4

### Execution Order (Sequential)

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5
```

### Parallel Opportunities (within phases)

- **Phase 2**: T005 and T006 (medium/large fixtures) can be written in parallel. T004 should be done first as a template for the others.
- **Phase 4**: T010 (tests) should be written before T011 (implementation). T013 and T014 (workflow) depend on T011.

---

## Implementation Strategy

### MVP First (Phase 1 → Phase 3)

1. Complete Phase 1: Setup (bench target)
2. Complete Phase 2: Fixtures & setup helper
3. Complete Phase 3: Local benchmarks
4. **STOP and VALIDATE**: Run benchmarks locally, verify all 27 cases execute in < 60s

### Full Delivery (Phase 4 → Phase 5)

5. Complete Phase 4: CI pipeline with regression detection, PR comment, artifacts
6. Complete Phase 5: Polish and edge cases
7. **VALIDATE**: Open a test PR, verify full pipeline
