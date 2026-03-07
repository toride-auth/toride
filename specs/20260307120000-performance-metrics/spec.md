# Feature Specification: Continuous Performance Metrics

**Feature Branch**: `performance-metrics`
**Created**: 2026-03-07
**Status**: Draft
**Input**: User description: "we want to continuously measure the performance of toride. Ensure that it is fast. be aware when changes significantly impact performance."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Developer Detects Performance Regression in PR (Priority: P1)

A developer opens a pull request that modifies the core toride authorization engine. The CI pipeline automatically runs performance benchmarks against the PR branch and compares results to the baseline (main branch). If any operation regresses by 20% or more, the PR is blocked from merging and the developer receives a clear summary of which operations regressed and by how much.

**Why this priority**: This is the core value proposition — catching regressions before they reach production. Without this, performance problems silently accumulate.

**Independent Test**: Can be fully tested by submitting a PR that intentionally introduces a slowdown (e.g., adding a sleep or extra loop in `can()`) and verifying the CI fails with a clear regression report.

**Acceptance Scenarios**:

1. **Given** a PR that makes `can()` 25% slower, **When** CI benchmarks run, **Then** the PR check fails and a comment is posted identifying the `can()` regression with before/after numbers.
2. **Given** a PR that makes no performance-relevant changes, **When** CI benchmarks run, **Then** the PR check passes and a comment is posted confirming no significant regressions.
3. **Given** a PR that improves performance by 30%, **When** CI benchmarks run, **Then** the PR check passes and the comment highlights the improvement.

---

### User Story 2 - Developer Runs Benchmarks Locally (Priority: P2)

A developer working on performance-sensitive code runs benchmarks locally before pushing to get fast feedback. They execute a single command from the repository root and see results for all operations across all policy complexity tiers.

**Why this priority**: Local iteration is faster than waiting for CI. Developers need quick feedback during optimization work.

**Independent Test**: Can be tested by running the benchmark command locally and verifying it produces readable output with timing data for all operations.

**Acceptance Scenarios**:

1. **Given** a developer at the repo root, **When** they run the benchmark command, **Then** results are displayed for all operations (can, canBatch, permittedActions, buildConstraints, explain, snapshot, canField, permittedFields, resolvedRoles) across small, medium, and large policy tiers.
2. **Given** a developer modifies engine code, **When** they re-run benchmarks, **Then** they can compare results to see if their changes improved or degraded performance.

---

### User Story 3 - Reviewer Sees Performance Impact on PR (Priority: P2)

A PR reviewer sees a benchmark summary comment on the pull request showing a table of all operations, their baseline timing, current timing, and percentage change. This helps the reviewer make informed merge decisions even when the threshold is not breached.

**Why this priority**: Visibility into performance trends helps maintainers make informed decisions, even when regressions are below the failure threshold.

**Independent Test**: Can be tested by opening any PR and verifying that a benchmark summary comment appears with a structured comparison table.

**Acceptance Scenarios**:

1. **Given** a PR with mixed results (some operations faster, some slightly slower but under 20%), **When** CI completes, **Then** a comment is posted with a table showing each operation, baseline time, PR time, and percentage delta.
2. **Given** a PR that only changes documentation, **When** CI completes, **Then** benchmarks still run and post results (ensuring no hidden performance impact from unrelated changes).

---

### User Story 4 - Team Tracks Performance Over Time (Priority: P3)

Benchmark results are stored as CI artifacts on each PR run, allowing the team to download and compare historical results when investigating performance trends.

**Why this priority**: Historical data supports root-cause analysis when gradual regressions slip through individual PR thresholds.

**Independent Test**: Can be tested by running CI on multiple PRs and verifying that benchmark JSON artifacts are downloadable from each run.

**Acceptance Scenarios**:

1. **Given** a completed CI run, **When** a team member navigates to the CI artifacts, **Then** they find a JSON file containing structured benchmark results with operation names, policy tiers, timing data, and metadata (commit SHA, timestamp).

---

### Edge Cases

- What happens when CI runners have high variance (noisy neighbors)? The 20% threshold should account for typical CI noise; benchmarks should use sufficient iterations to produce stable medians.
- What happens when a new operation is added to the engine? Benchmarks should be structured so new operations can be added without breaking existing comparisons. A missing baseline for a new operation should not fail the PR.
- What happens when the baseline benchmark data doesn't exist yet (first run on a new repo)? The first run should establish the baseline and pass without comparison.
- What happens when benchmark execution itself fails (out of memory, timeout)? The CI check should fail with a clear error message distinguishing benchmark infrastructure failure from a performance regression.

## Clarifications

### Session 2026-03-07

- Q: How should the CI obtain the baseline (main branch) benchmark results for comparison? → A: Run main-branch benchmarks in the same CI job (checkout main, bench, then bench PR) for identical hardware/environment comparison.
- Q: Which benchmarking tool should be used? → A: vitest bench (built-in vitest benchmarking via tinybench), consistent with existing test infrastructure.
- Q: What is the maximum acceptable time for the local benchmark suite to complete? → A: Under 60 seconds.
- Q: How should benchmark stability be achieved to minimize false positives from CI noise? → A: Single run with high iteration count, report median (vitest bench default behavior).
- Q: Should the benchmark comparison script be written in TypeScript or as shell/CI logic? → A: TypeScript script in the repo (testable, reusable for local comparison).
- Q: How should the PR comment be posted? → A: Using the default GITHUB_TOKEN (Actions token), no dedicated GitHub App needed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST benchmark all public operations on the core Toride engine: `can()`, `canBatch()`, `permittedActions()`, `buildConstraints()`, `explain()`, `snapshot()`, `canField()`, `permittedFields()`, and `resolvedRoles()`.
- **FR-002**: System MUST run benchmarks against three policy complexity tiers: small (approximately 5 resources, simple roles), medium (approximately 20 resources, derived roles, conditions), and large (50+ resources, deep derivation chains, complex conditions).
- **FR-003**: System MUST compare PR benchmark results against a baseline derived from the main branch. The baseline MUST be obtained by running benchmarks on a checkout of the main branch within the same CI job, ensuring identical hardware and environment for comparison.
- **FR-004**: System MUST fail the PR check when any operation regresses by 20% or more relative to the baseline.
- **FR-005**: System MUST post a summary comment on the PR showing a comparison table with operation names, policy tier, baseline timing, PR timing, and percentage change.
- **FR-006**: System MUST store benchmark results as a downloadable CI artifact in structured format (JSON) including operation names, policy tiers, timing data, commit SHA, and timestamp.
- **FR-007**: System MUST support running benchmarks locally via a single command from the repository root.
- **FR-008**: System MUST run benchmarks in CI on every pull request targeting the main branch.
- **FR-009**: System MUST handle the first-ever run gracefully by establishing a baseline without comparison.
- **FR-010**: System MUST clearly distinguish between benchmark infrastructure failures and performance regression failures in CI output.
- **FR-011**: Benchmarks MUST only cover the core `toride` package (not satellite packages @toride/drizzle, @toride/prisma, @toride/codegen).

### Key Entities

- **Benchmark Suite**: A collection of benchmark cases organized by operation and policy complexity tier. Contains the benchmark definitions, fixture policies, and mock resolvers.
- **Benchmark Result**: The output of a single benchmark run. Contains operation name, policy tier, timing statistics (median, mean, standard deviation, iterations), commit SHA, and timestamp.
- **Baseline**: The benchmark result from the main branch used as the reference point for regression detection on PRs.
- **Regression Report**: A comparison between PR results and baseline results, identifying operations that exceed the regression threshold.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All nine public Toride engine operations are benchmarked across three policy complexity tiers (27 benchmark cases total).
- **SC-002**: A PR that introduces a 20% or greater performance regression is blocked from merging with a clear explanation of which operations regressed.
- **SC-003**: Every PR receives an automated benchmark comparison comment within the CI pipeline execution time.
- **SC-004**: Developers can run the full benchmark suite locally with a single command and receive results within 60 seconds.
- **SC-005**: Benchmark results are stable enough that normal CI variance does not cause false positives (fewer than 5% false positive rate on non-regressing PRs).
- **SC-006**: Benchmark result artifacts are available for download after each CI run.

## Assumptions

- CI runners provide sufficiently consistent performance for benchmark comparison with a 20% threshold. Benchmarks use a single run with high iteration count and report the median (vitest bench default behavior) to minimize noise.
- Benchmarks use vitest bench (built-in benchmarking mode using tinybench internally), requiring no additional dependencies.
- Mock resolvers (already present in the test suite) can be reused for benchmark fixtures, avoiding real database calls.
- The 20% regression threshold applies per-operation per-tier (not as an aggregate across all benchmarks).
