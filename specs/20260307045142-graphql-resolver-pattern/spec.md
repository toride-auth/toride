# Feature Specification: GraphQL Resolver Pattern for Authorization

**Feature Branch**: `improve-resolvers`
**Created**: 2026-03-07
**Status**: Draft
**Input**: GitHub Issues #13, #15, #16 — Redesign RelationResolver using GraphQL Resolver pattern
**Related Issues**: #13, #15, #16

## Clarifications

### Session 2026-03-07

- Q: Are actor attributes affected by this redesign, or does the actor side remain unchanged? → A: Actor unchanged. Actor attributes continue to be provided at `can()` call time. This redesign only affects resource-side data resolution. Actor resolvers are out of scope.
- Q: When a resolver returns a value for a field declared as a relation but the value is NOT a valid ResourceRef (missing type/id), what should happen? → A: Throw a validation error. Fail fast with a clear error indicating the relation field doesn't contain a valid ResourceRef. This catches resolver bugs early. (Note: this is stricter than the inline case, where non-ResourceRef values for relation fields are treated as plain attributes.)

## User Scenarios & Testing

### User Story 1 - Per-Type Attribute Resolver (Priority: P1)

As a library consumer, I define a resolver function per resource type so that each resolver is focused, type-safe, and does not require branching on resource type internally.

**Why this priority**: The per-type resolver is the foundation of the new design. Without it, inline attributes and relation resolution have nowhere to plug in.

**Independent Test**: Can be tested by creating an engine with per-type resolvers and verifying that the correct resolver is called for each resource type during policy evaluation.

**Acceptance Scenarios**:

1. **Given** an engine configured with resolvers for "Document" and "Organization", **When** a `can()` check is performed on a Document resource, **Then** only the Document resolver is invoked (not Organization).
2. **Given** an engine configured with a resolver for "Document" but not "Workspace", **When** a `can()` check references a Workspace resource, **Then** the engine behaves like a GraphQL trivial resolver — fields not present are treated as undefined, and policy conditions referencing them evaluate accordingly (no error thrown).
3. **Given** an engine with no resolvers configured, **When** all required attributes are provided inline on the ResourceRef, **Then** authorization evaluation succeeds without any resolver calls.

---

### User Story 2 - Inline Attributes on ResourceRef (Priority: P1)

As a library consumer, I can attach attributes directly to the ResourceRef when I already have the data in memory, avoiding redundant resolver calls.

**Why this priority**: This eliminates the most common performance complaint — the engine always calling the resolver even when the caller already has the data.

**Independent Test**: Can be tested by providing attributes inline and verifying the resolver is never called.

**Acceptance Scenarios**:

1. **Given** a ResourceRef with `attributes: { status: "draft" }`, **When** the policy checks `$resource.status`, **Then** the inline value "draft" is used without calling any resolver.
2. **Given** a ResourceRef with `attributes: { status: "draft" }` and a policy that also checks `$resource.owner_id`, **When** the engine evaluates, **Then** the resolver is called to fetch the missing `owner_id`, and the inline `status` is still used (not overwritten by the resolver result).
3. **Given** a ResourceRef with no attributes and no resolver registered for that type, **When** the engine evaluates a policy referencing `$resource.status`, **Then** `$resource.status` evaluates as undefined (GraphQL trivial resolver behavior).

---

### User Story 3 - Relation Resolution via Attributes (Priority: P1)

As a library consumer, I express resource relationships as ResourceRef values within attributes (instead of a separate `getRelated` method), and the engine traverses them using relation declarations in the policy.

**Why this priority**: This replaces `getRelated` and is essential for cross-resource policy evaluation (e.g., `$resource.org.plan`).

**Independent Test**: Can be tested by defining a relation in policy YAML, providing a ResourceRef in attributes, and verifying nested attribute access works.

**Acceptance Scenarios**:

1. **Given** a Document with `attributes: { org: { type: "Organization", id: "org1" } }` and a policy declaring `relations: { org: Organization }`, **When** the policy checks `$resource.org.plan`, **Then** the engine recognizes `org` as a ResourceRef (via the relation declaration), calls the Organization resolver to get `plan`, and evaluates the condition.
2. **Given** a Document with `attributes: { org: { type: "Organization", id: "org1", plan: "enterprise" } }`, **When** the policy checks `$resource.org.plan`, **Then** the engine uses the inline `plan` value from the nested ResourceRef without calling the Organization resolver (cascading inline attributes / trivial resolver).
3. **Given** a two-level relation path `$resource.org.parent` where `org` is on Document and `parent` is a relation on Organization, **When** the engine evaluates, **Then** it lazily cascades — resolving Document → Organization → Parent organization, calling resolvers only for missing fields at each level.

---

### User Story 4 - Declarative Role Derivation Without getRoles (Priority: P2)

As a library consumer, I derive all roles through policy YAML (`derived_roles` with `when` conditions, `from_role + on_relation`, etc.) instead of implementing a `getRoles` callback.

**Why this priority**: Depends on per-type resolvers and inline attributes being in place. Removes the "degraded Zanzibar" anti-pattern.

**Independent Test**: Can be tested by defining derived_roles with attribute-based conditions and verifying correct role assignment without any getRoles function.

**Acceptance Scenarios**:

1. **Given** a policy with `derived_roles` where `role: owner` has `when: { $resource.owner_id: { eq: $actor.id } }`, **When** the resource's `owner_id` matches the actor's ID (via inline attributes or resolver), **Then** the actor is assigned the "owner" role.
2. **Given** a policy with `derived_roles` using `from_role: admin` and `on_relation: org`, **When** the actor has the "admin" role on the related Organization resource, **Then** the actor inherits the derived role on the Document.
3. **Given** an application that previously used `getRoles` to return `["editor"]` for specific actor-resource pairs, **When** migrated to use `$resource.editor_ids` attribute with `when: { $actor.id: { in: $resource.editor_ids } }`, **Then** the same authorization decisions are produced.

---

### User Story 5 - Simplified Relation Declarations in Policy YAML (Priority: P2)

As a policy author, I declare relations with just a type name instead of an object with `resource` and `cardinality` fields.

**Why this priority**: Simplifies policy authoring. Depends on the new attribute-based relation model.

**Independent Test**: Can be tested by writing a policy with simplified relation syntax and verifying it parses and evaluates correctly.

**Acceptance Scenarios**:

1. **Given** a policy with `relations: { org: Organization }` (simplified syntax), **When** the policy is loaded, **Then** the engine correctly recognizes `org` as a relation to the Organization resource type.
2. **Given** a policy using the old syntax `relations: { org: { resource: Organization, cardinality: one } }`, **When** the policy is loaded, **Then** the engine rejects it with a clear validation error (pre-1.0, no backward compatibility).

---

### Edge Cases

- What happens when inline attributes contain a field matching a relation name but the value is not a valid ResourceRef (no `type`/`id`)? The engine treats it as a plain attribute value, not a relation (lenient — caller may intentionally pass non-ResourceRef data).
- What happens when a resolver returns a value for a relation field that is not a valid ResourceRef? The engine throws a validation error (strict — resolver results are persistent configuration and should be correct).
- What happens when a resolver returns a field that conflicts with an inline attribute? Inline attributes take precedence — the resolver result for that field is discarded.
- What happens when a relation target's resolver throws an error? The error propagates to the `can()` caller (standard promise rejection).
- What happens when circular relations exist (A → B → A)? The per-`can()` cache (keyed by `${type}:${id}`) prevents infinite loops — a cached result is returned on the second encounter.
- What happens when `permittedActions` or `canBatch` is called? A shared cache is used across all evaluations within that call (existing behavior, unchanged).

## Requirements

### Functional Requirements

- **FR-001**: The engine MUST accept a `resolvers` option as a map of resource type names to resolver functions, where each function takes a ResourceRef and returns a promise of attributes.
- **FR-002**: The engine MUST accept an optional `attributes` field on ResourceRef, containing key-value pairs of pre-fetched resource data.
- **FR-003**: When evaluating a policy condition that references a resource attribute, the engine MUST first check inline attributes before calling the resolver. If the field exists inline, the resolver MUST NOT be called for that field.
- **FR-004**: When a resolver is called, the engine MUST merge the resolver result with any existing inline attributes, giving precedence to inline attributes for overlapping fields.
- **FR-005**: The engine MUST recognize attribute values as ResourceRefs when the attribute name matches a declared relation in the policy AND the value contains `type` and `id` fields.
- **FR-006**: When traversing a relation path (e.g., `$resource.org.plan`), the engine MUST lazily resolve each level — only fetching the next level's attributes when they are needed and not already provided inline.
- **FR-007**: Extra fields beyond `type` and `id` on a relation-target object MUST be treated as inline attributes for that referenced resource (cascading inline attributes).
- **FR-008**: The `getRoles` method MUST be removed from the resolver interface. Role resolution MUST be handled entirely through `derived_roles` and policy conditions.
- **FR-009**: The `getRelated` method MUST be removed from the resolver interface. Relation targets MUST be expressed as ResourceRef values within resource attributes.
- **FR-010**: Policy relation declarations MUST use the simplified syntax (type name only: `org: Organization`). The `cardinality` field MUST be removed.
- **FR-011**: When no resolver is registered for a resource type and no inline attributes are provided, the engine MUST behave like a GraphQL trivial resolver — fields are treated as undefined, and policy conditions referencing them evaluate accordingly. No error is thrown.
- **FR-012**: The `resolvers` option MUST be optional. An engine configured without resolvers MUST function correctly when all required data is provided via inline attributes.
- **FR-013**: The cache strategy MUST use `${type}:${id}` as the cache key. Cache lifetime MUST be per-`can()` call. `permittedActions` and `canBatch` MUST share a single cache across their internal evaluations.
- **FR-014**: The existing `on_relation + from_role` derived role pattern MUST continue to work, with the relation target sourced from attributes (inline or resolver) instead of `getRelated`.
- **FR-015**: Actor attributes are out of scope for this redesign. Actors MUST continue to be provided with their attributes at `can()` call time (existing behavior, unchanged).
- **FR-016**: When a resolver returns a value for a field declared as a relation in policy, and the value is NOT a valid ResourceRef (missing `type` or `id`), the engine MUST throw a validation error. This is stricter than the inline case (where non-ResourceRef values for relation fields are treated as plain attributes), because resolver results represent persistent configuration that should be correct.

### Key Entities

- **ResourceRef**: A reference to a resource with `type`, `id`, and optional `attributes`. The fundamental unit passed to authorization checks.
- **Resolver**: A per-resource-type async function that fetches attributes for a given ResourceRef. Serves as the PIP (Policy Information Point) fallback.
- **Relation Declaration**: A policy-level mapping from a field name to a resource type, used by the engine to recognize which attribute values are ResourceRefs.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Library consumers can perform authorization checks by providing only a resource type and ID (with resolvers handling data fetching), or by providing all data inline (with no resolvers configured), or any combination thereof.
- **SC-002**: When all required attributes are provided inline, zero resolver calls are made during a `can()` evaluation.
- **SC-003**: Each resource type's data fetching logic is isolated in its own resolver function — no single function handles multiple resource types.
- **SC-004**: Policies referencing nested relation paths (e.g., `$resource.org.plan`) resolve correctly through attribute-based traversal, with resolvers called only for missing fields at each level.
- **SC-005**: All authorization scenarios previously handled by `getRoles` can be expressed using `derived_roles` with attribute-based conditions.
- **SC-006**: All authorization scenarios previously handled by `getRelated` can be expressed using ResourceRef values in attributes combined with relation declarations.
- **SC-007**: For many-to-many role patterns (e.g., shared editor lists), the attribute-based escape hatch (`$resource.editor_ids` with `in` condition) works correctly. Soft guidance recommends this pattern for sets under ~100 members, with OpenFGA or similar for larger scale.

## Assumptions

- This is a pre-1.0 breaking change. No backward compatibility with the current `RelationResolver` interface is required.
- The existing `derived_roles` patterns (5 patterns) remain unchanged in structure. Only the data source changes (from `getRoles`/`getRelated` to attributes).
- Static analysis of required attributes (analyzing policy `when` clauses to pre-determine needed fields) is deferred to a future version. v1 calls the resolver whenever any referenced field is missing from inline attributes.
- DataLoader-style batching is out of scope for this version.
- Relation depth is not artificially limited, but the per-`can()` cache prevents infinite loops from circular references.
