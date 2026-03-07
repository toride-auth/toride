# Research: GraphQL Resolver Pattern for Authorization

## R1: GraphQL Resolver Pattern Applied to Authorization

**Decision**: Adopt GraphQL's per-type resolver pattern — each resource type gets its own resolver function that returns all attributes for a given resource reference.

**Rationale**: GraphQL resolvers are well-understood, predictable, and composable. The "trivial resolver" concept (missing resolver = undefined fields, no error) eliminates the need for exhaustive resolver registration. Per-type functions are easier to test, type, and maintain than a monolithic 3-method interface.

**Alternatives considered**:
- Keep monolithic `RelationResolver` with 3 methods: Rejected — branches on resource type internally, poor separation of concerns, forces users to implement methods they don't need.
- DataLoader-style batching resolvers: Deferred to future version — adds complexity without proven need. Current per-`can()` cache handles deduplication.
- Field-level resolvers (one function per field per type): Rejected — too granular, high registration overhead, minimal benefit over full-object resolvers with inline attribute precedence.

## R2: Inline Attributes + Resolver Merge Strategy

**Decision**: `ResourceRef.attributes` provides pre-fetched data. When a resolver is called, its results are merged with inline attributes, with inline taking precedence for overlapping fields. The resolver is called at most once per `${type}:${id}` per evaluation.

**Rationale**: This follows GraphQL's pattern where parent resolvers can pass down partial data, and child resolvers fill in the gaps. Inline precedence means callers who already have data never pay for redundant fetches. The "call once, merge once" model is simple and predictable.

**Alternatives considered**:
- Per-field lazy resolution (only call resolver for missing fields): Deferred — requires static analysis of policy to determine needed fields. Spec explicitly defers this.
- Resolver always wins (overrides inline): Rejected — violates the principle that the caller knows best. Would force unnecessary fetches even when data is available.

## R3: Relation Resolution via Attributes

**Decision**: Relations are expressed as `ResourceRef` values within resource attributes. The engine recognizes a field as a relation when (a) it's declared in the policy's `relations` map AND (b) the attribute value contains `type` and `id` fields.

**Rationale**: Eliminates the separate `getRelated` method. Relations become just another attribute value, traversed lazily. This unifies the data model — everything flows through attributes.

**Key behaviors**:
- Inline attributes: non-ResourceRef values for relation fields are treated as plain attributes (lenient)
- Resolver results: non-ResourceRef values for relation fields throw a validation error (strict, FR-016)
- Extra fields on a relation-target object are cascading inline attributes for the referenced resource

**Alternatives considered**:
- Keep `getRelated` alongside resolvers: Rejected — two data paths for relations creates confusion and duplication.
- Automatic relation detection without policy declarations: Rejected — violates "explicit over clever" principle. Users must declare relations in YAML.

## R4: Removing getRoles — Derived Roles Only

**Decision**: Remove `getRoles` entirely. All role assignment happens through `derived_roles` patterns (5 existing patterns) evaluated against resource attributes.

**Rationale**: `getRoles` is a "degraded Zanzibar" anti-pattern — it offloads role resolution to user code, making policies unauditable. Attribute-based conditions (`when: { $resource.owner_id: { eq: $actor.id } }`) achieve the same result declaratively and are visible in the policy.

**Migration patterns**:
- `getRoles` returning `["owner"]` → `derived_roles` with `when: { $resource.owner_id: { eq: $actor.id } }`
- `getRoles` returning `["editor"]` based on membership → `when: { $actor.id: { in: $resource.editor_ids } }`
- `getRoles` returning `["admin"]` based on org role → `from_role: admin` + `on_relation: org`

**Alternatives considered**:
- Keep `getRoles` as an escape hatch: Rejected — undermines the declarative model and creates two role-resolution paths.
- Optional `getRoles` adapter: Rejected — pre-1.0, clean break is preferred.

## R5: Simplified Relation Declarations

**Decision**: Relations use type-name-only syntax: `relations: { org: Organization }`. Remove `cardinality` field.

**Rationale**: Cardinality was needed when `getRelated` returned `ResourceRef | ResourceRef[]`. In the new model, the attribute value itself determines cardinality — a single `ResourceRef` is one, an array of `ResourceRef[]` is many. The policy doesn't need to declare what the resolver will return.

**Impact on cardinality:many ANY semantics**: The condition evaluator already handles array values with ANY semantics (T053). When a relation attribute is an array of ResourceRefs, the engine collects values from all targets. This behavior is preserved — it's driven by the runtime value shape, not the declaration.

**Alternatives considered**:
- Keep `cardinality` as optional: Rejected — it's now redundant and misleading. Pre-1.0 clean break.

## R6: Cache Design

**Decision**: Full-object cache keyed by `${type}:${id}`. Cache stores the merged result (inline + resolver). Cache lifetime is per-`can()` call; `canBatch`/`permittedActions` share a single cache.

**Rationale**: Simplest model. One call per unique resource per evaluation. The cache stores Promises (not resolved values) to prevent duplicate concurrent calls for the same key — same pattern as the existing `ResolverCache`.

**Key change from current cache**: The current cache has separate keys for `getRoles`, `getRelated`, and `getAttributes`. The new cache only needs one key per resource since there's only one resolver function per type.

## R7: ORM Adapter Pattern (Drizzle/Prisma)

**Decision**: Thin adapter functions that wrap ORM queries into the new per-type resolver signature. Not a full factory — users still choose which fields to expose. More structured than just examples, less magic than auto-generation from schema.

**Pattern**:
```typescript
// @toride/drizzle example shape
function createDrizzleResolver(
  db: DrizzleInstance,
  table: AnyTable,
  options?: { select?: string[] }
): (ref: ResourceRef) => Promise<Record<string, unknown>>
```

**Rationale**: ORM adapters currently only implement `ConstraintAdapter` (for `buildConstraints` → WHERE clauses). The new resolver adapters are a separate concern — they handle data fetching, not query generation. Keeping them thin avoids coupling the authorization library to specific ORM versions or schema patterns.

## R8: Codegen Updates

**Decision**: Remove `TypedRelationResolver` and `RelationMap` (cardinality field). Generate per-type resolver type map instead.

**New generated types**:
- `ResolverMap`: maps resource type names to resolver function types
- `TypedResourceRef<R>`: ResourceRef with typed `attributes` field per resource type
- Remove `TypedRelationResolver` (replaced by `ResolverMap`)
- Update `RelationMap` to use simplified syntax (type name only, no cardinality)
