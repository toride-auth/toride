# Implementation Plan: Toride Authorization Engine

**Branch**: `001-authz-engine` | **Date**: 2026-03-06 | **Spec**: [specs/001-authz-engine/spec.md](/specs/001-authz-engine/spec.md)
**Input**: Feature specification from `/specs/001-authz-engine/spec.md`
**Architecture Reference**: [docs/spec.md](/docs/spec.md) (Architecture Specification v1.1)

## Summary

Build a relation-aware authorization engine as a framework-agnostic TypeScript library. The engine combines resource-centric YAML/JSON policies, relation-based role derivation (5 patterns), permit/forbid rules with condition expressions, and partial evaluation for data filtering via constraint ASTs. Organized as a pnpm monorepo with 4 packages: `toride` (core), `@toride/codegen`, `@toride/prisma`, `@toride/drizzle`.

## Technical Context

**Language/Version**: TypeScript (strict mode), Node.js 20+ (current LTS)
**Primary Dependencies**: `yaml` (YAML 1.2 parsing), Valibot (schema validation), tsup (build)
**Storage**: N/A (in-process library; user provides data via `RelationResolver` interface)
**Testing**: Vitest (ESM-native, TypeScript support)
**Target Platform**: Node.js (LTS), edge runtimes, browsers (isomorphic)
**Project Type**: Library (core engine) + CLI (`@toride/codegen`, `toride validate/test`)
**Module Format**: ESM-only, named exports only
**Performance Goals**: Sub-millisecond `can()` checks when resolver returns from cache (engine overhead negligible)
**Constraints**: Minimal runtime dependencies; policies held in memory (hundreds to low thousands of resources); no external service dependencies
**Scale/Scope**: 4 workspace packages, ~30 functional requirements, 9 user stories across 3 priority tiers

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Principle | Status | Evidence |
|---|-----------|--------|----------|
| I | Security-First / Fail-Closed | PASS | Default-deny semantics (FR-006), forbid-wins (FR-007), fail-closed on resolver errors (FR-014), strict null semantics (FR-010), custom evaluator error handling per spec |
| II | Type-Safe Library / Zero Infrastructure | PASS | In-process TypeScript library, no external services, generics for actions/resources (Section 7.9), `RelationResolver` interface for data access, isomorphic design |
| III | Explicit Over Clever | PASS | Valid YAML/JSON only (no custom DSL), co-located resource blocks, explicit grants/derived_roles/rules per resource, `all` scoped to resource permissions, forbid rules direct-only |
| IV | Stable Public API / Semver | PASS | Constraint AST types documented as public stable API, `RelationResolver`/`can()`/`buildConstraints()` etc. are public API, named exports only |
| V | Test-First | PASS | Vitest for test suite, declarative YAML tests (FR-021), `explain()` uses same code path as `can()` (FR-005/FR-015), integration test coverage required |

**Gate Result**: ALL PASS — no violations. Proceed to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/001-authz-engine/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
packages/
├── toride/                        # Core engine package
│   ├── src/
│   │   ├── index.ts               # Public exports: Toride, createToride, loadYaml, loadJson, mergePolicies
│   │   ├── client.ts              # Subpath export: toride/client → TorideClient
│   │   ├── engine.ts              # Toride class: can(), canBatch(), explain(), etc.
│   │   ├── policy/
│   │   │   ├── parser.ts          # YAML/JSON loading + Valibot validation
│   │   │   ├── schema.ts          # Valibot schema definitions for policy format
│   │   │   ├── validator.ts       # Cross-reference validation (undeclared roles, etc.)
│   │   │   └── merger.ts          # mergePolicies() implementation
│   │   ├── evaluation/
│   │   │   ├── role-resolver.ts   # Exhaustive role resolution (5 patterns)
│   │   │   ├── condition.ts       # Condition expression evaluator
│   │   │   ├── rule-engine.ts     # Permit/forbid rule evaluation
│   │   │   └── cache.ts           # Per-check resolver result cache
│   │   ├── partial/
│   │   │   ├── constraint-builder.ts  # buildConstraints() implementation
│   │   │   ├── constraint-types.ts    # Constraint AST type definitions (public API)
│   │   │   └── translator.ts          # translateConstraints() with ConstraintAdapter
│   │   ├── field-access.ts        # canField(), permittedFields()
│   │   ├── snapshot.ts            # snapshot() for client-side sync
│   │   └── types.ts               # Core types: ActorRef, ResourceRef, Policy, etc.
│   ├── tests/
│   │   ├── unit/                  # Unit tests per module
│   │   └── integration/           # End-to-end authorization scenarios
│   ├── package.json
│   └── tsup.config.ts
│
├── codegen/                       # @toride/codegen package
│   ├── src/
│   │   ├── index.ts               # Codegen API
│   │   ├── cli.ts                 # CLI entry point (toride-codegen)
│   │   └── generator.ts           # Type generation from policy
│   ├── tests/
│   ├── package.json
│   └── tsup.config.ts
│
├── prisma/                        # @toride/prisma package
│   ├── src/
│   │   └── index.ts               # PrismaConstraintAdapter
│   ├── tests/
│   ├── package.json
│   └── tsup.config.ts
│
└── drizzle/                       # @toride/drizzle package
    ├── src/
    │   └── index.ts               # DrizzleConstraintAdapter
    ├── tests/
    ├── package.json
    └── tsup.config.ts

pnpm-workspace.yaml
package.json                       # Root workspace config
vitest.workspace.ts                # Vitest workspace config
tsconfig.base.json                 # Shared TypeScript config
```

**Structure Decision**: pnpm monorepo with 4 packages under `packages/`. The core `toride` package uses subpath exports for `toride/client`. Adapter packages (`@toride/prisma`, `@toride/drizzle`) depend on the core via workspace protocol. `@toride/codegen` is a standalone CLI tool that reads policy files.

## Constitution Re-Check (Post Phase 1 Design)

| # | Principle | Status | Post-Design Evidence |
|---|-----------|--------|---------------------|
| I | Security-First / Fail-Closed | PASS | Data model enforces default-deny via evaluation flow; `ExplainResult.finalDecision` makes denial reasons visible; error types (`CycleError`, `DepthLimitError`) all resolve to denial; `ConstraintResult.forbidden` sentinel for partial eval |
| II | Type-Safe Library / Zero Infrastructure | PASS | Generics on `Toride<TActions, TResources>` and `createToride<>()` factory; `ConstraintAdapter<TQuery>` generic; `TorideClient` is pure synchronous TS with zero deps; subpath export isolates client from server code |
| III | Explicit Over Clever | PASS | All 5 derived role patterns explicitly enumerated in data model; condition expressions use known operators (no eval/scripting); policy schema validated by Valibot with logical path errors; no implicit inheritance in any contract |
| IV | Stable Public API / Semver | PASS | `Constraint` discriminated union, `ConstraintAdapter`, `RelationResolver`, and all engine methods documented as public API contracts; `LeafConstraint` subset type for adapter stability; error types are part of public API |
| V | Test-First | PASS | Declarative test model (`TestCase`) supports inline mocks; CLI contract specifies `toride test` with pass/fail output; `explain()` contract uses same code path as `can()` (shared evaluation function returning trace data) |

**Post-Design Gate Result**: ALL PASS — design is constitution-compliant.

## Complexity Tracking

> No constitution violations found — this section is intentionally empty.
