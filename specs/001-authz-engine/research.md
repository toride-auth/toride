# Research: Toride Authorization Engine

**Phase 0 Output** | **Date**: 2026-03-06

## 1. YAML Parsing + Schema Validation

### Decision: `yaml` package + Valibot

**Rationale**: The `yaml` npm package is the only YAML 1.2 compliant parser in the Node ecosystem with good error messages including source positions. Valibot provides TypeScript-first schema validation with significantly smaller bundle size than Zod (~1KB vs ~13KB minified), which matters for an isomorphic library.

**Alternatives considered**:
- `js-yaml`: YAML 1.1 only, no source position support — rejected for spec compliance
- Zod: Larger bundle, would bloat the library for edge/browser use cases — rejected
- AJV + JSON Schema: Heavy runtime, doesn't generate TypeScript types — rejected

**Approach**:
1. Parse YAML/JSON into a plain object using `yaml` package's `parse()` with `prettyErrors: true`
2. Validate the parsed object against Valibot schemas that mirror the policy format
3. Run a second pass for cross-reference validation (undeclared roles in grants, unknown relations in derived_roles, `$actor.x` attribute validation against actor declarations)
4. Error messages include logical paths like `resources.Task.grants references undeclared role "edtor"`

**Key pattern**: Valibot's `pipe()` and `transform()` for schema composition; `custom()` validators for cross-reference checks that need access to the full policy context.

## 2. pnpm Monorepo Structure

### Decision: pnpm workspaces with 4 packages under `packages/`

**Rationale**: pnpm workspaces provide efficient dependency management with hard links, strict dependency isolation, and native workspace protocol (`workspace:*`) for inter-package references.

**Alternatives considered**:
- Turborepo: Adds complexity for 4 packages with simple build graph — rejected (can add later if needed)
- npm workspaces: Less strict isolation, slower installs — rejected
- Single package with multiple entry points: Would conflate codegen CLI and ORM adapters with core engine — rejected

**Configuration details**:

```yaml
# pnpm-workspace.yaml
packages:
  - "packages/*"
```

**Package naming**:
- `packages/toride/` → publishes as `toride`
- `packages/codegen/` → publishes as `@toride/codegen`
- `packages/prisma/` → publishes as `@toride/prisma`
- `packages/drizzle/` → publishes as `@toride/drizzle`

**Subpath export for `toride/client`**: Use package.json `exports` field:
```json
{
  "exports": {
    ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" },
    "./client": { "import": "./dist/client.js", "types": "./dist/client.d.ts" }
  }
}
```

**tsup config**: ESM-only output, `.d.ts` generation via `dts: true`, multiple entry points for the core package (`src/index.ts`, `src/client.ts`).

**Vitest workspace**: Single `vitest.workspace.ts` at root pointing to each package's test directory. Each package can have its own vitest config for specific needs.

## 3. Constraint AST Design

### Decision: Discriminated union with `type` field + recursive function translation

**Rationale**: TypeScript discriminated unions provide exhaustive checking via `switch` statements. The `type` field discriminator maps naturally to the constraint kinds. Recursive translation functions (vs visitor pattern) are simpler for this use case since the tree structure is fixed.

**Alternatives considered**:
- Visitor pattern: More boilerplate for a fixed tree structure — rejected for v1 (can add if extensibility needed)
- Class hierarchy: Poor serialization, heavier runtime — rejected
- Tagged template literals: Not type-safe — rejected

**Approach**:
- Define `Constraint` as a discriminated union type in `constraint-types.ts` (public API, semver-stable)
- `LeafConstraint` subset type for `ConstraintAdapter.translate()` (field_eq, field_neq, etc.)
- `translateConstraints()` is a recursive function that pattern-matches on `constraint.type`
- `always` and `never` terminal nodes used internally; `translateConstraints()` simplifies these away before calling the adapter
- The `ConstraintResult` wrapper (`unrestricted | forbidden | constraints`) lets callers optimize common cases without touching the adapter

**Partial evaluation strategy**:
1. For each role the actor could have (including derivation paths), generate the constraints that would grant that role
2. For relation-based derived roles, emit `has_role` nodes (adapter translates to role assignment JOINs)
3. Inline `$actor` and `$env` values into concrete `field_eq`/`field_gt`/etc. nodes
4. Combine via `or` (multiple paths to access), apply `and` for rule conditions
5. Apply `not` for forbid rules
6. Simplify: `and([always, X])` → `X`, `or([never, X])` → `X`, etc.

## 4. Role Resolution Engine

### Decision: Single evaluation function returning trace data, used by both `can()` and `explain()`

**Rationale**: Using the same code path for `can()` and `explain()` prevents behavioral divergence (Constitution Principle V). The evaluation always collects full trace data; `can()` simply discards it while `explain()` returns it.

**Alternatives considered**:
- Separate fast path for `can()` (short-circuit): Would violate exhaustive evaluation requirement and risk divergence — rejected
- Lazy trace collection (only when `explain()` called): Would mean different code paths — rejected

**Approach**:

**Exhaustive evaluation loop**:
```
for each derived_role entry on the resource:
  evaluate the entry (may recurse for relation-based derivation)
  if matched: add to resolved roles set + record derivation path
  (never short-circuit — continue to next entry)
```

**Per-check cache**: A `Map<string, Promise<T>>` keyed by `${method}:${type}:${id}` (e.g., `getRoles:Task:42`). Store the Promise itself (not the resolved value) to handle concurrent access within a single evaluation. Cache is created at `can()` entry and passed down through all recursive calls. For `canBatch()`, the same cache instance is shared across all checks.

**Cycle detection**: Maintain a `Set<string>` of `${type}:${id}` pairs representing the current resolution path. Before recursing into a related resource, check if it's already in the path. If so, throw a `CycleError`. The set is cloned at each branch point (DAG-safe).

**Condition evaluator**: Recursive function with depth tracking. At each level:
1. Resolve property access (`resource.project.status` → resolve `project` relation, get attributes, access `status`)
2. Apply operator (eq, gt, in, etc.)
3. Handle cross-references (`$actor.x`, `$resource.y`, `$env.z`)
4. Strict null: `if (left == null || right == null) return false`
5. Logical combinators: `any` = OR, `all` = AND (implicit in `when` blocks)

**Fail-closed**: All resolver calls wrapped in try/catch at the evaluation boundary. On error: for `can()`, return denied; for custom evaluators in forbid rules, treat as matched; for custom evaluators in permit rules, treat as not matched.

## 5. CLI Architecture

### Decision: Dual CLI surface — `toride` command in core package, `toride-codegen` in codegen package

**Rationale**: `toride validate` and `toride test` are core operations that belong in the main package. Code generation is a separate concern with its own dependencies.

**Alternatives considered**:
- Single CLI for everything: Would pull codegen dependencies into core — rejected
- No CLI in core (only programmatic API): Would miss the DX opportunity for `validate` and `test` — rejected

**Approach**:
- Core package has `bin: { "toride": "./dist/cli.ts" }` for `validate` and `test` commands
- Codegen package has `bin: { "toride-codegen": "./dist/cli.ts" }` for type generation
- Both use a minimal CLI parser (no heavy framework like Commander for a library)

## 6. Declarative YAML Tests

### Decision: Tests as a policy feature (inline `tests:` section + separate `.test.yaml` files)

**Rationale**: Aligns with the architecture spec. Tests use inline mocks to avoid needing a real resolver or database. Global roles are always derived from actor attributes (no mock override).

**Approach**:
- Test runner creates a mock resolver from the test case's `roles`, `relations`, and `attributes` maps
- The mock resolver is passed to the engine along with the real policy
- Only `expected: allow | deny` assertions — no intermediate state checking
- `toride test` command supports glob patterns for test file discovery

## 7. Client-Side Sync

### Decision: Separate `TorideClient` class via subpath export `toride/client`

**Rationale**: Tree-shaking — server apps don't need client code. The client is a thin synchronous wrapper over a pre-computed permission map.

**Approach**:
- `snapshot()` on server evaluates `permittedActions()` for a list of resources, returns `Record<string, string[]>` keyed by `${type}:${id}`
- `TorideClient` stores the map and provides synchronous `can(action, resource)` → boolean
- Unknown resources return `false` (consistent with default-deny)
- No dependencies — pure TypeScript, works in any JS runtime

## 8. Custom Evaluators

### Decision: Named functions registered at engine construction time

**Rationale**: Per architecture spec section 4.7. Custom evaluators are an escape hatch for logic that can't be expressed in YAML conditions.

**Approach**:
- Registered via `customEvaluators` option on `Toride` constructor
- Evaluator receives a context object with `actor`, `resource`, `env`
- Error handling follows fail-closed: errors in forbid → matched (denied); errors in permit → not matched (no grant)
- Partial evaluation emits `{ type: "unknown", name: "evaluatorName" }` constraint nodes
