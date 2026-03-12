# Research: Deep Type Safety

## Decision 1: ConstraintResult carries resource type R

**Decision**: `ConstraintResult<R extends string = string>` — the resource type flows from `buildConstraints` through to `translateConstraints`.

**Rationale**: Eliminates the need for the caller to repeat the resource type when translating constraints. TypeScript can infer R from the `ConstraintResult<R>` passed to `translateConstraints`, enabling a clean pipeline: `buildConstraints(actor, "read", "Document") → ConstraintResult<"Document"> → translateConstraints(result, adapter) → Prisma.DocumentWhereInput`.

**Alternatives considered**:
- Explicit R on `translateConstraints` call: More verbose, requires the user to specify the resource type twice. Rejected for ergonomic reasons.

## Decision 2: Adapter uses TQueryMap, not schema S

**Decision**: `ConstraintAdapter<TQueryMap extends Record<string, unknown> = Record<string, unknown>>` where TQueryMap maps resource names to query types.

**Rationale**: The adapter doesn't need to know about the full schema — it only cares about mapping resource types to query output types. Schema validation happens at the engine level. This keeps the adapter interface simple and decoupled.

**Alternatives considered**:
- `ConstraintAdapter<S extends TorideSchema, TQueryMap>`: Over-constrains the adapter. The adapter doesn't need actor types, roles, or permissions. Rejected for unnecessary coupling.

## Decision 3: Clean break on ConstraintAdapter interface

**Decision**: Change `ConstraintAdapter<TQuery>` to `ConstraintAdapter<TQueryMap>` without backward-compatibility shims. This is a breaking change handled as a minor version bump per spec clarification.

**Rationale**: The spec explicitly states that breaking the adapter interface is acceptable with a minor version bump. A backward-compat default would add complexity to the type definitions. Since this is a pre-1.0 library, a clean break is preferred.

**Alternatives considered**:
- Default `TQueryMap = Record<string, TQuery>` for backward compat: Adds type complexity. Rejected — pre-1.0, clean break is simpler.

## Decision 4: Generic can<R>() for TorideClient

**Decision**: `TorideClient.can<R extends S['resources']>(action: S['permissionMap'][R], resource: ClientResourceRef<S, R>)` with R inferred from `resource.type`.

**Rationale**: Same pattern as engine methods. TypeScript infers R from the literal type of `resource.type`, enabling per-resource action narrowing without discriminated union overloads.

**Alternatives considered**:
- Discriminated union overloads: Requires codegen to produce overloads per resource. Doesn't scale, adds codegen complexity. Rejected.

## Decision 5: Field types derived from resourceAttributeMap

**Decision**: `canField<R>(actor, op, resource, field: keyof S['resourceAttributeMap'][R] & string)` — field names are derived from existing `resourceAttributeMap`, no new type map needed.

**Rationale**: Per spec clarification — single source of truth. `resourceAttributeMap` already contains the field names per resource. Adding a separate `fieldMap` would create duplication and divergence risk.

**Alternatives considered**:
- Separate `fieldMap` in TorideSchema: Redundant with `resourceAttributeMap`. Rejected per spec clarification.

## Decision 6: Role types from existing roleMap

**Decision**: `resolvedRoles<R>()` returns `S['roleMap'][R][]` — role types are derived from the existing `roleMap`.

**Rationale**: `roleMap` already contains per-resource role unions. No new type map needed.

## Decision 7: PermissionSnapshot carries schema generic

**Decision**: `PermissionSnapshot<S extends TorideSchema = DefaultSchema>` where the snapshot remains a runtime `Record<string, string[]>` but the type parameter flows through to `TorideClient<S>`.

**Rationale**: Per spec clarification — the snapshot is runtime-serializable (JSON transport). The schema generic is a phantom type that provides type safety at compile time without affecting runtime behavior.

## Decision 8: Implementation order

**Decision**: Core types first, tests alongside. Not strict TDD for type-level changes.

**Rationale**: Type-level changes are iterative — the type definition and its test evolve together. Writing a tsd test for a type that doesn't exist yet provides less value than for runtime behavior. Tests are still written before any runtime code changes.

**Order**:
1. Update `TorideSchema` + engine method signatures + type tests
2. Update codegen to emit any needed changes
3. Update adapters (Prisma, Drizzle) with `TQueryMap`
4. Update `TorideClient` + `PermissionSnapshot` + type tests

## Decision 9: No new TorideSchema properties needed

**Decision**: The existing TorideSchema interface has all the maps needed. Field names come from `keyof resourceAttributeMap[R]`, roles from `roleMap[R]`. No new properties are added.

**Rationale**: Per spec clarification — single source of truth. The existing maps already contain the information needed for field and role typing.

## TypeScript Patterns Research

### Inferring R from resource.type literal

TypeScript can infer `R` from a literal type passed as `resource.type` when the function signature constrains `R extends S['resources']` and the parameter is typed as `{ type: R; ... }`. This works because TypeScript's generic inference resolves `R` from the literal type of the `type` property.

```typescript
// This pattern already works in the codebase (engine.can):
async can<R extends S["resources"]>(
  actor: ActorRef<S>,
  action: S["permissionMap"][R],
  resource: ResourceRef<S, R>,
): Promise<boolean>
```

### Phantom type on ConstraintResult

Adding `R` as a phantom type parameter to `ConstraintResult` (a discriminated union) requires either:
1. Adding a phantom `readonly __resource?: R` field (unused at runtime)
2. Using a branded type pattern

Option 1 is simpler and aligns with TypeScript conventions. The optional phantom field has zero runtime cost.

### TQueryMap lookup with fallback

For `ConstraintAdapter<TQueryMap>`, the adapter methods return `TQueryMap[string]` (a union of all values in TQueryMap). `translateConstraints` returns `TQueryMap[R]` where R is inferred from `ConstraintResult<R>`. When TQueryMap is `Record<string, unknown>` (default), all methods return `unknown` — backward compatible.
