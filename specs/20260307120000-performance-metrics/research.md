# Research: Continuous Performance Metrics

## R1: vitest bench configuration and output format

**Decision**: Use vitest bench with `--reporter=json` for machine-readable output and default reporter for human-readable local output.

**Rationale**: vitest ^2.0.0 includes built-in benchmarking via tinybench. The `bench` mode uses `.bench.ts` files with `bench()` and `describe()` from vitest. JSON reporter outputs structured results including `hz` (ops/sec), `mean`, `median`, `min`, `max`, `p75`, `p99`, and `samples`. This gives us everything needed for comparison without additional dependencies.

**Alternatives considered**:
- `tinybench` directly: Would work but loses vitest integration (shared config, reporter ecosystem)
- `benchmark.js`: Legacy library, not actively maintained
- Custom timing loop: Reinventing the wheel; tinybench handles warmup, iteration count, statistical analysis

**Key findings**:
- Bench files use `.bench.ts` extension by convention
- `vitest bench --reporter=json` outputs to stdout; use `--outputFile` to write to a file
- Default iteration count is determined by tinybench's time-based approach (runs for ~500ms per bench by default)
- Can override with `{ iterations: N, time: T }` options per bench call
- Median is the recommended metric for comparison (robust against outliers)

## R2: Baseline comparison strategy (same-job approach)

**Decision**: In the CI workflow, checkout and bench main branch first, then checkout PR branch and bench it, all in the same job. Compare results using the TypeScript comparison script.

**Rationale**: Running both benchmarks on the same runner in the same job eliminates hardware variance between jobs. The spec explicitly requires this approach. Order (main first, then PR) avoids any caching/warmup bias favoring the first run.

**Alternatives considered**:
- Separate jobs for baseline and PR: Different runners = incomparable results
- Cache baseline from main branch pushes: Stale data, different hardware
- GitHub Actions `benchmark-action`: Over-engineered for this use case, adds external dependency

**Key findings**:
- `git checkout` + `pnpm install` between runs adds ~20s overhead but ensures clean comparison
- The comparison script receives two JSON files (baseline.json, pr.json) and produces markdown + exit code
- First-ever run (no main branch baseline): script detects missing baseline and exits 0

## R3: GitHub Actions PR comment posting

**Decision**: Use `github-script` action with `GITHUB_TOKEN` to post/update a single benchmark comment on the PR.

**Rationale**: The default `GITHUB_TOKEN` has sufficient permissions for PR comments when the workflow has `pull-requests: write` permission. Using `github-script` keeps the logic in JavaScript/TypeScript inline without external actions.

**Alternatives considered**:
- `peter-evans/create-or-update-comment`: External action dependency; prefer inline for simplicity
- Custom GitHub App: Overkill per spec clarification
- `gh pr comment`: Simpler but harder to update existing comments (would create duplicates)

**Key findings**:
- Use a marker comment (`<!-- toride-benchmark -->`) to find and update existing comments
- `github.rest.issues.listComments` + `createComment`/`updateComment` pattern
- Workflow needs `permissions: pull-requests: write`

## R4: Nx bench target integration

**Decision**: Add `"bench": "vitest bench"` script to `packages/toride/package.json`. Nx will auto-infer the target. Configure in `nx.json` with `cache: false` (benchmarks should never be cached).

**Rationale**: Benchmarks produce timing data that depends on hardware state, not just source code. Caching would return stale results. The Nx target enables `pnpm exec nx run toride:bench` for consistency with other commands.

**Alternatives considered**:
- Cache benchmarks: Wrong — timing data is hardware-dependent
- Root-level script only: Breaks Nx conventions; loses `nx run` integration
- Separate Nx project for benchmarks: Overcomplicated

**Key findings**:
- Add `bench` to `targetDefaults` in `nx.json` with `cache: false`
- Benchmark files should be excluded from the `production` named input (already excluded by not being in `src/`)
- `bench` target should `dependsOn: ["build"]` since benchmarks import from the package source (but vitest resolves TS directly, so this may not be needed — verify)

## R5: Benchmark fixture policy design

**Decision**: Create three dedicated YAML policy files with controlled complexity.

**Rationale**: Dedicated fixtures ensure consistent, reproducible benchmarks. The three tiers map to the spec requirements:
- **Small** (~5 resources): Simple RBAC with direct role grants, no conditions, no derived roles
- **Medium** (~20 resources): Derived roles with conditions, relations between resources, `$resource` attribute checks
- **Large** (50+ resources): Deep derivation chains (3+ levels), complex conditions with `$actor` and `$resource` cross-references, forbid rules, field_access definitions

**Alternatives considered**:
- Reuse test fixtures: Test policies are designed for correctness testing, not complexity tiers
- Generate policies programmatically: Harder to review and maintain; YAML is explicit per Constitution III

**Key findings**:
- Each fixture needs corresponding mock resolvers that return attributes for condition evaluation
- The mock resolvers should use synchronous-like async (return immediately) to isolate engine performance from I/O
- Fixture design must exercise all 9 operations meaningfully (e.g., field_access in all tiers, batch checks with multiple resources)

## R6: Regression threshold and statistical approach

**Decision**: Use median timing for comparison. Fail if any operation-tier pair regresses >= 20%. Report all deltas in the PR comment.

**Rationale**: Median is robust against outliers (GC pauses, background processes). The 20% threshold per-operation per-tier (not aggregate) catches targeted regressions while tolerating normal CI variance. vitest bench default behavior already uses sufficient iterations for stable medians.

**Alternatives considered**:
- Mean: Sensitive to outliers
- p95/p99: Too sensitive for CI environment noise
- Aggregate threshold: Masks individual operation regressions
- Statistical significance testing (t-test): Overcomplicated for this use case; single run with high iterations is sufficient per spec

**Key findings**:
- vitest bench reports median by default
- The comparison script computes `(pr_median - baseline_median) / baseline_median * 100`
- Positive delta = regression, negative delta = improvement
- New operations (present in PR but not baseline) are reported but don't fail
- Missing operations (present in baseline but not PR) should warn but not fail

## R7: Benchmark result JSON schema

**Decision**: The comparison script reads vitest bench JSON output and produces a structured result JSON for the CI artifact.

**Rationale**: vitest bench `--reporter=json` produces its own format. The comparison script normalizes this into a clean schema with operation names, tiers, timing, commit metadata.

**Key findings**:
- vitest bench JSON output structure: `{ testResults: [{ name, perfStats: { hz, mean, median, ... } }] }`
- Need to parse bench names to extract operation and tier (naming convention: `"can() - small"`)
- The artifact JSON should include: `{ commit, timestamp, results: [{ operation, tier, median, mean, hz, samples }] }`
