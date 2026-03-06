# Implementation Plan: Nx Monorepo Optimization

**Branch**: `add-nx` | **Date**: 2026-03-06 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/20260306120000-nx-monorepo-optimization/spec.md`

## Summary

Add Nx to the existing pnpm monorepo to enable cached builds, targeted test/lint runs via `nx affected`, and optimized CI. Uses the package-based approach with inferred targets from `package.json` scripts — no Nx plugins or `project.json` files. Per-package AGENTS.md files are dropped in favor of an updated root CLAUDE.md with Nx-aware instructions.

## Technical Context

**Language/Version**: TypeScript (strict mode), Node.js 20+ (current LTS)
**Primary Dependencies**: nx (v21.x), tsup (build), vitest (test), pnpm (10.x)
**Storage**: N/A (configuration-only feature)
**Testing**: Verification via `nx run-many`, `nx affected`, cache hit validation
**Target Platform**: Linux (CI), macOS/Linux (dev)
**Project Type**: Library monorepo (4 packages)
**Performance Goals**: Cached builds complete in <2s; affected builds skip unchanged packages
**Constraints**: No Nx Cloud, no Nx plugins, preserve existing pnpm workspace structure
**Scale/Scope**: 4 packages — toride (core), codegen, drizzle, prisma

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Security-First / Fail-Closed | N/A | No authorization logic changes |
| II. Type-Safe Library / Zero Infrastructure | PASS | Nx is a dev dependency only, not runtime. No infrastructure added. |
| III. Explicit Over Clever | PASS | All config is explicit JSON (nx.json, package.json). No hidden magic. |
| IV. Stable Public API / Semver | N/A | No public API changes |
| V. Test-First | PASS | Existing tests preserved. Nx orchestrates when they run, not how. |
| TC: Minimal dependencies | PASS | Only `nx` added as devDependency |
| TC: No custom DSL | PASS | Standard JSON configuration |

**Post-Phase 1 re-check**: All gates still pass. No design decisions introduced constitution violations.

## Project Structure

### Documentation (this feature)

```text
specs/20260306120000-nx-monorepo-optimization/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   ├── nx-json.md       # nx.json configuration contract
│   └── ci-workflow.md   # GitHub Actions CI workflow contract
└── tasks.md             # Phase 2 output (NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
.                           # Existing monorepo root
├── nx.json                 # NEW: Nx workspace configuration
├── .gitignore              # MODIFIED: Add .nx/cache
├── .github/
│   └── workflows/
│       └── ci.yml          # NEW: GitHub Actions CI with nx affected
├── package.json            # MODIFIED: Scripts use nx commands
├── CLAUDE.md               # MODIFIED: Nx-aware monorepo instructions
├── pnpm-workspace.yaml     # UNCHANGED
├── packages/
│   ├── toride/
│   │   └── package.json    # MODIFIED: Add nx.tags
│   ├── codegen/
│   │   └── package.json    # MODIFIED: Add nx.tags
│   ├── drizzle/
│   │   └── package.json    # MODIFIED: Add nx.tags
│   └── prisma/
│       └── package.json    # MODIFIED: Add nx.tags
```

**Structure Decision**: Existing monorepo structure preserved. Nx layers on top via `nx.json` at root and `nx` key in each `package.json`. No directory restructuring.

## Complexity Tracking

No constitution violations to justify. This feature adds only a dev tooling layer with zero runtime impact.
