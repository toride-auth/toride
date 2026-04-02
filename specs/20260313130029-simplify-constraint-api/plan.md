# Implementation Plan: Simplify Constraint API & Deep Attribute Type Safety

**Branch**: `simplify-constraint-api` | **Date**: 2026-03-13 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/20260313130029-simplify-constraint-api/spec.md`

## Summary

Replace the redundant three-way `ConstraintResult` union with an `ok`-based result type, introduce recursive `AttributeSchema` for nested objects/arrays in YAML policies (max 3 levels), update codegen to generate nested TypeScript types, type the `ResourceResolver` return value, and add strict dot-path validation in the policy validator. Ships as a semver major version with adapter package updates.

## Technical Context

**Language/Version**: TypeScript (strict mode), Node.js 20+ LTS
**Primary Dependencies**: valibot (schema validation), yaml (policy parsing), tsup (build), vitest (test), tsd (type testing)
**Storage**: N/A (in-process library, file-based YAML/JSON policies)
**Testing**: vitest (unit/integration), tsd (compile-time type tests), TDD per constitution
**Target Platform**: Node.js, edge runtimes, browsers (isomorphic)
**Project Type**: Library (pnpm monorepo with 4 packages: toride, @toride/codegen, @toride/drizzle, @toride/prisma)
**Performance Goals**: No regression from current benchmarks (see bench/ fixtures)
**Constraints**: Zero external infrastructure, minimal dependencies, fail-closed security posture
**Scale/Scope**: 4 packages affected, ~15 source files modified, ~5 new files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Security-First / Fail-Closed | PASS | `ok: false` preserves default-deny. `never` constraint → `ok: false`. No access escalation paths introduced. Prototype-pollution guards on nested path traversal maintained. |
| II. Type-Safe Library / Zero Infrastructure | PASS | Core improvement — adds deeper compile-time type safety. No new infrastructure. Isomorphic. |
| III. Explicit Over Clever | PASS | YAML syntax extensions are natural map/array notation, not a custom DSL. `type: array` + `items` is explicit. Shorthand `string[]` is YAML-only syntactic sugar, normalized before validation. |
| IV. Stable Public API / Semver | PASS | Breaking changes ship as major version (FR-016). `ConstraintResult`, `AttributeType`, `ResourceResolver` are public API — major bump required and planned. |
| V. Test-First | PASS | All changes follow TDD. Type tests (tsd) for compile-time contracts. Integration tests for nested attribute parsing, dot-path validation, and constraint result shapes. |

**Post-Phase 1 re-check**: All principles remain satisfied. The recursive `AttributeSchema` type is a clean discriminated union (Principle III). Depth limit enforcement (max 3) prevents unbounded recursion (Principle I).

## Project Structure

### Documentation (this feature)

```text
specs/20260313130029-simplify-constraint-api/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 research
├── data-model.md        # Phase 1 data model
├── quickstart.md        # Phase 1 quickstart
├── contracts/           # Phase 1 contracts
│   ├── constraint-result.ts
│   ├── attribute-schema.ts
│   └── forbidden-error.ts
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
packages/toride/src/
├── types.ts                          # AttributeSchema type, ForbiddenError, updated ResourceResolver
├── index.ts                          # Export ForbiddenError, AttributeSchema types
├── engine.ts                         # Updated buildConstraints/translateConstraints signatures
├── partial/
│   ├── constraint-types.ts           # New ConstraintResult type
│   ├── constraint-builder.ts         # Return new ConstraintResult shape
│   └── translator.ts                 # Updated error messages
├── policy/
│   ├── schema.ts                     # Recursive AttributeSchemaNode valibot schema
│   ├── parser.ts                     # YAML shorthand normalization, nested attribute parsing
│   └── validator.ts                  # Dot-path validation against AttributeSchema
├── __typetests__/
│   ├── constraint-pipeline.test-d.ts # Updated for new ConstraintResult
│   ├── resolvers.test-d.ts           # Resolver return type tests
│   └── schema.test-d.ts             # Nested attribute type tests
└── __integration__/
    └── partial-eval.test.ts          # Updated for new result shape

packages/codegen/src/
└── generator.ts                      # Nested TypeScript type generation

packages/drizzle/src/
└── index.ts                          # Peer dependency version bump

packages/prisma/src/
└── index.ts                          # Peer dependency version bump

scripts/
└── generate-schema.mjs               # JSON Schema update for nested attributes
```

**Structure Decision**: Existing monorepo structure. No new packages or directories. Changes are modifications to existing files plus new type/error exports.

## Complexity Tracking

No constitution violations. No complexity justifications needed.
