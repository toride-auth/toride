# Implementation Plan: README and Official Documentation Site

**Branch**: `add-readme-and-official-site` | **Date**: 2026-03-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/20260308100000-readme-and-docs-site/spec.md`

## Summary

Add a root-level README.md to the toride repository and build an official documentation site using VitePress 1.6.4. The docs site lives in a standalone `docs/` directory with its own `package.json`, deployed automatically to GitHub Pages (`toride-auth.github.io/toride`) via a path-filtered GitHub Actions workflow. The site covers getting started, core concepts (policy format, roles, conditions, partial evaluation, client-side hints), and integration guides for all four packages.

## Technical Context

**Language/Version**: TypeScript (VitePress config), Markdown (content), YAML (GitHub Actions)
**Primary Dependencies**: VitePress 1.6.4 (standalone in `docs/`)
**Storage**: N/A (static site generator, Markdown files)
**Testing**: Manual verification (VitePress build success, visual review). No automated tests for docs content.
**Target Platform**: Static site hosted on GitHub Pages; dev server on localhost
**Project Type**: Documentation site (static) + README
**Performance Goals**: Site loads in under 3 seconds on standard broadband (SC-004). VitePress handles this by default.
**Constraints**: Base path must be `/toride/` for GitHub Pages project site. Path-filtered CI to avoid unnecessary deployments.
**Scale/Scope**: 11 content pages, 1 README, 1 GitHub Actions workflow

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Applicable? | Status | Notes |
|-----------|-------------|--------|-------|
| I. Security-First / Fail-Closed | No | N/A | Documentation-only feature. No authorization logic. |
| II. Type-Safe Library / Zero Infrastructure | No | N/A | No runtime code changes. Docs are static content. |
| III. Explicit Over Clever | Partially | PASS | Code examples in docs will demonstrate explicit policy patterns. No hidden magic in examples. |
| IV. Stable Public API / Semver | No | N/A | No API changes. Docs describe existing APIs. |
| V. Test-First | No | PASS (exempted) | Documentation is not executable code. VitePress build success serves as the "test" — broken Markdown or config will fail the build. |

**Pre-Phase 0 Gate**: PASS — no violations.
**Post-Phase 1 Gate**: PASS — design introduces no new code, no API changes, no authorization logic. All constitution principles are respected in the documentation content (examples demonstrate fail-closed, explicit policies, type safety).

## Project Structure

### Documentation (this feature)

```text
specs/20260308100000-readme-and-docs-site/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── docs-site-structure.md
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
README.md                           # Root README (new)

docs/                               # VitePress documentation site (new)
├── package.json                    # Standalone deps (vitepress)
├── .vitepress/
│   └── config.ts                   # VitePress configuration
├── index.md                        # Landing page (hero + CTA)
├── guide/
│   ├── getting-started.md          # Installation and setup
│   └── quickstart.md               # Step-by-step first auth check
├── concepts/
│   ├── policy-format.md            # YAML policy structure
│   ├── roles-and-relations.md      # Role types, derivation, relations
│   ├── conditions-and-rules.md     # Permit/forbid rules, ABAC conditions
│   ├── partial-evaluation.md       # Data filtering with constraints
│   └── client-side-hints.md        # Permission snapshots for UI
└── integrations/
    ├── prisma.md                   # @toride/prisma adapter
    ├── drizzle.md                  # @toride/drizzle adapter
    └── codegen.md                  # @toride/codegen CLI

.github/workflows/
└── deploy-docs.yml                 # GitHub Pages deployment (new)
```

**Structure Decision**: Standalone `docs/` directory at repo root, not an Nx project. VitePress has its own dev server and build pipeline. Dependencies are isolated from the monorepo packages. The GitHub Actions workflow is a new file alongside the existing `ci.yml`, `benchmark.yml`, and `publish.yml`.

## Complexity Tracking

> No constitution violations. Table intentionally left empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none) | — | — |
