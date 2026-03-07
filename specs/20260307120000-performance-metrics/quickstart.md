# Quickstart: Performance Benchmarks

## Run benchmarks locally

```bash
# From repo root — runs all 27 benchmark cases
pnpm exec nx run toride:bench

# Or directly with vitest
cd packages/toride && npx vitest bench
```

Expected output: A table showing operations per second, median time, and iterations for all 9 operations across 3 tiers. Should complete in < 60 seconds.

## Compare two runs locally

```bash
# Run benchmarks and save JSON output
cd packages/toride
npx vitest bench --reporter=json --outputFile=baseline.json
# ... make changes ...
npx vitest bench --reporter=json --outputFile=current.json

# Compare
npx tsx bench/compare.ts --baseline baseline.json --current current.json --markdown report.md
echo $?  # 0 = no regressions, 1 = regressions found
cat report.md
```

## How CI works

1. On every PR targeting `main`, the `benchmark.yml` workflow triggers
2. It checks out `main`, runs benchmarks, saves `baseline.json`
3. It checks out the PR branch, runs benchmarks, saves `current.json`
4. The comparison script runs and produces a markdown report
5. The workflow posts/updates a comment on the PR with the results
6. If any operation regresses >= 20%, the PR check fails
7. Benchmark results are uploaded as CI artifacts (downloadable JSON)

## Adding a new operation to benchmarks

1. Add a new `bench()` call in `packages/toride/bench/operations.bench.ts`
2. Follow the naming convention: `bench("newOperation - small", async () => { ... })`
3. Repeat for `medium` and `large` tiers
4. The comparison script handles new operations gracefully (reported as "new", no failure)
