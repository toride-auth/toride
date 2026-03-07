# Implementation Plan: Continuous Performance Metrics

**Branch**: `performance-metrics` | **Date**: 2026-03-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/20260307120000-performance-metrics/spec.md`

## Summary

Add continuous performance benchmarking to the core `toride` package using vitest bench. Benchmarks cover all 9 public engine operations across 3 policy complexity tiers (27 cases). A standalone GitHub Actions workflow runs benchmarks on every PR, compares against a main-branch baseline executed in the same job, posts a comparison comment, and fails the PR on >= 20% regression. A TypeScript comparison script handles result diffing and markdown generation.

## Technical Context

**Language/Version**: TypeScript (strict mode), Node.js 20+ LTS
**Primary Dependencies**: vitest ^2.0.0 (bench mode / tinybench), existing toride engine
**Storage**: N/A (JSON artifacts stored as CI artifacts)
**Testing**: vitest bench (benchmarking), vitest run (existing tests unmodified)
**Target Platform**: Node.js (CI: ubuntu-latest GitHub Actions runner)
**Project Type**: Library (in-process authorization engine)
**Performance Goals**: Full benchmark suite completes in < 60 seconds locally
**Constraints**: 20% per-operation per-tier regression threshold; high iteration count for stable medians
**Scale/Scope**: 9 operations x 3 tiers = 27 benchmark cases

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Security-First / Fail-Closed | PASS | Benchmarks are read-only measurement; no changes to authorization logic |
| II. Type-Safe Library / Zero Infrastructure | PASS | Benchmarks are dev-only tooling; no runtime dependencies added. vitest already a devDependency |
| III. Explicit Over Clever | PASS | Dedicated fixture policies with controlled complexity; no hidden magic |
| IV. Stable Public API / Semver | PASS | No public API changes; benchmarks exercise the existing public API surface |
| V. Test-First | N/A | Benchmarks are not features — they measure existing functionality. Comparison script will have unit tests |

**Gate result**: PASS — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/20260307120000-performance-metrics/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
packages/toride/
├── bench/
│   ├── fixtures/
│   │   ├── small.yaml          # ~5 resources, simple roles
│   │   ├── medium.yaml         # ~20 resources, derived roles, conditions
│   │   └── large.yaml          # 50+ resources, deep derivation chains
│   ├── helpers/
│   │   └── setup.ts            # Shared benchmark setup (load policies, create engines, mock resolvers)
│   ├── operations.bench.ts     # All 27 benchmark cases (9 ops x 3 tiers)
│   ├── compare.ts              # TypeScript comparison script (baseline vs PR results)
│   └── compare.test.ts         # Tests for the comparison script
├── src/                        # (existing, unchanged)
├── package.json                # (add "bench" script)
├── tsconfig.json               # (existing)
└── tsup.config.ts              # (existing)

.github/workflows/
├── ci.yml                      # (existing, unchanged)
└── benchmark.yml               # New: standalone benchmark workflow
```

**Structure Decision**: Benchmarks live in `packages/toride/bench/` as a sibling to `src/`. Fixture policies are dedicated files designed for controlled complexity at each tier. The comparison script is co-located in the bench directory. A new Nx `bench` target is added to `packages/toride/package.json`.

## Complexity Tracking

> No constitution violations — table not needed.
