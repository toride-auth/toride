# Implementation Plan: Policy JSON Schema & IDE Integration

**Branch**: `policy-schema-ide` | **Date**: 2026-03-13 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/20260313080428-policy-schema-ide-integration/spec.md`

## Summary

Generate a JSON Schema from the existing valibot `PolicySchema` to enable real-time IDE validation of toride policy YAML files. A hand-written converter script runs as a tsup `onSuccess` hook, outputting `schema/policy.schema.json` into the npm package. CI enforces schema freshness via git-diff check. Docs site gains a new "Reference" section with CLI reference and IDE setup guide pages.

## Technical Context

**Language/Version**: TypeScript (strict mode), Node.js 20+ LTS
**Primary Dependencies**: valibot ^1.2.0, yaml ^2.3.0, tsup (build), vitest (test)
**Storage**: N/A (file-based: generated JSON Schema artifact)
**Testing**: vitest (unit tests for converter, snapshot tests for generated schema)
**Target Platform**: Node.js (build-time script), npm package distribution
**Project Type**: Library (toride core package) + docs site (VitePress)
**Performance Goals**: Schema generation < 5 seconds (SC-002)
**Constraints**: Zero new runtime dependencies; converter is a build-time .mjs script
**Scale/Scope**: Single JSON Schema file (~200-400 lines), 2 docs pages, 1 CI step

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Security-First / Fail-Closed | ✅ PASS | Schema validation is additive (IDE hints). Does not affect engine authorization decisions. |
| II. Type-Safe Library / Zero Infrastructure | ✅ PASS | No external services added. Schema is a static build artifact. No new runtime dependencies. |
| III. Explicit Over Clever | ✅ PASS | JSON Schema is a standard, explicit format. No custom DSL or hidden behavior. |
| IV. Stable Public API / Semver | ⚠️ NOTE | The generated JSON Schema becomes a published artifact in the npm package. Changes to `PolicySchema` will automatically update it via the build. The schema file path (`schema/policy.schema.json`) becomes part of the public API surface — document this. |
| V. Test-First | ✅ PASS | Converter will have unit tests. Schema output verified by snapshot tests. CI drift check tests freshness. |

**Gate result**: PASS — no violations.

## Project Structure

### Documentation (this feature)

```text
specs/20260313080428-policy-schema-ide-integration/
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
├── scripts/
│   └── generate-schema.mjs     # Hand-written valibot→JSON Schema converter
├── schema/
│   └── policy.schema.json      # Generated output (committed, checked by CI)
├── src/
│   └── policy/
│       └── schema.ts           # Source of truth (existing valibot schemas)
├── tsup.config.ts              # Updated: onSuccess hook runs generator
└── package.json                # Updated: files includes schema/

docs/
└── reference/
    ├── cli.md                  # CLI reference (validate, test)
    └── ide-setup.md            # IDE setup guide (VS Code + general)

.github/workflows/
└── ci.yml                      # Updated: schema drift check step
```

**Structure Decision**: All schema generation lives within `packages/toride/`. The converter is a standalone `.mjs` script under `scripts/` that imports from `dist/` after tsup compilation. Generated schema goes to `schema/` (adjacent to `dist/`, `src/`). Docs pages go in a new `reference/` section.

## Complexity Tracking

> No constitution violations — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
