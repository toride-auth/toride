# Feature Specification: End-to-End Type Safety

**Feature Branch**: `improve-typesafety`
**Created**: 2026-03-11
**Status**: Clarified
**Input**: User description: "Improve type safety across the entire Toride authorization engine — core types, codegen output, integration packages, and client — so that resource names, actions, actor types, and attributes are all statically checked at compile time."

## Clarifications

### Session 2026-03-11

- Q: Should type safety be codegen-only or should the core Toride class become generic? → A: Both layers. Toride becomes generic (`Toride<TSchema>`) with minimum type safety by default. Codegen produces a richer schema type for maximum safety.
- Q: Should the core generic infer types from Policy literals or use a simple schema interface? → A: Simple core generic. `TorideSchema` is a flat interface that codegen fills. No deep conditional types — keeps IDE fast and error messages clear.
- Q: Should the policy schema extend to support resource attributes? → A: Yes. Resources gain an optional `attributes: { field: type }` declaration, matching actors. Codegen uses this for typed `ResourceAttributeMap`.
- Q: What shape should the codegen output take? → A: Schema interface only. Codegen emits a `GeneratedSchema` interface extending `TorideSchema`. No wrapper functions or typed factories generated — users pass `GeneratedSchema` as the type parameter.
- Q: Should backward compatibility be maintained? → A: Breaking changes are OK (major version bump). Migration is minimal: add `<GeneratedSchema>` type parameter.
- Q: Should actor refs be fully typed? → A: Yes. `TypedActorRef<S>` is a discriminated union over actor types with typed attributes per type.
- Q: Should integration packages be in scope? → A: Yes, all in one spec. End-to-end type safety including `@toride/drizzle` and `@toride/prisma`.
- Q: Should `TorideClient` be typed? → A: Yes. `TorideClient<TSchema>` narrows action and resource.type.
- Q: Should `env` be typed? → A: No. Keep `CheckOptions.env` as `Record<string, unknown>` — env values are inherently dynamic.
- Q: How should `canBatch()` handle heterogeneous resource types? → A: Use global `Actions` union for the action field. Per-resource narrowing isn't feasible in heterogeneous arrays.
- Q: Should return types be narrowed? → A: Yes. `permittedActions()` returns `PermissionMap[R][]`, `explain()` returns typed `grantedPermissions`, etc.
- Q: How should actor refs be typed in method signatures? → A: Discriminated union. `can()` is generic only over resource type R; actor is a union type accepted as-is.
- Q: What shape should the `TorideSchema` interface use? → A: Flat maps — separate top-level properties (permissionMap, roleMap, resourceAttributeMap, etc.). Each independently accessible. Matches existing codegen structure.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Typed Authorization Checks (Priority: P1)

A developer using Toride with codegen wants compile-time errors when they pass an invalid action or resource type to `can()`. Today, `can(actor, "reed", { type: "Docuemnt", id: "1" })` compiles fine despite both typos. After this change, the TypeScript compiler catches both immediately.

**Why this priority**: This is the core value proposition — every `can()` call site becomes a compile-time contract. Typos in action names and resource types are the most common authorization bugs, and they are currently invisible until runtime.

**Independent Test**: Can be fully tested by writing a typed `can()` call with a known-good action/resource and verifying it compiles, then writing one with a typo and verifying it fails type-checking.

**Acceptance Scenarios**:

1. **Given** a Toride instance parameterized with a schema that declares `Document` with permissions `["read", "write"]`, **When** a developer calls `can(actor, "read", { type: "Document", id: "1" })`, **Then** it compiles without error.
2. **Given** the same schema, **When** a developer calls `can(actor, "reed", { type: "Document", id: "1" })`, **Then** the TypeScript compiler reports an error that `"reed"` is not assignable to `"read" | "write"`.
3. **Given** the same schema, **When** a developer calls `can(actor, "read", { type: "Docuemnt", id: "1" })`, **Then** the TypeScript compiler reports an error that `"Docuemnt"` is not a valid resource type.
4. **Given** a schema with multiple resource types each having different permissions, **When** a developer calls `can(actor, action, resource)`, **Then** the `action` parameter is narrowed to the permissions declared for that specific resource type (not the global union).

---

### User Story 2 - Typed Resource Attributes in Resolvers (Priority: P1)

A developer writing a resolver for `Document` wants the type system to enforce that the resolver returns the correct attribute shape (`{ status: string, ownerId: string }`) as declared in the policy. Today, resolvers return `Record<string, unknown>`, so a resolver that returns `{ stauts: "draft" }` (typo) compiles fine but silently breaks authorization conditions.

**Why this priority**: Resolvers are the data bridge between the application and the authorization engine. Untyped resolver return values are a major source of silent failures where conditions reference attributes that the resolver misspells or omits.

**Independent Test**: Can be tested by writing a resolver that returns the correct attribute shape (compiles) and one that returns a misspelled attribute (fails to compile).

**Acceptance Scenarios**:

1. **Given** a policy declaring `Document` with attributes `{ status: string, ownerId: string }`, **When** a developer registers a resolver for `"Document"` that returns `{ status: "draft", ownerId: "user-1" }`, **Then** it compiles without error.
2. **Given** the same policy, **When** a resolver for `"Document"` returns `{ stauts: "draft" }`, **Then** the compiler reports a type error.
3. **Given** the same policy, **When** a resolver for `"Document"` returns `{ status: 42 }` (wrong type), **Then** the compiler reports a type error.
4. **Given** a schema with no resolver registered for a resource type, **When** the developer provides inline attributes on `ResourceRef`, **Then** those attributes are also type-checked against the declared attribute schema.

---

### User Story 3 - Typed Actor Refs (Priority: P2)

A developer constructing an `ActorRef` wants compile-time validation that the actor type exists in the policy and that the attributes match the declared schema. Today, `{ type: "Usr", id: "1", attributes: { emal: "x" } }` compiles fine.

**Why this priority**: Actor refs are constructed at every authorization call site. While less varied than resource types (most apps have 1-3 actor types), typos in actor attributes silently break derived role conditions.

**Independent Test**: Can be tested by constructing an actor ref with valid type and attributes (compiles) vs. invalid ones (fails).

**Acceptance Scenarios**:

1. **Given** a schema declaring actor type `User` with attributes `{ email: string, is_admin: boolean }`, **When** a developer creates `{ type: "User", id: "1", attributes: { email: "a@b.com", is_admin: true } }`, **Then** it compiles.
2. **Given** the same schema, **When** a developer creates `{ type: "Usr", id: "1", attributes: { email: "a@b.com", is_admin: true } }`, **Then** it fails with a type error on `"Usr"`.
3. **Given** the same schema, **When** a developer creates `{ type: "User", id: "1", attributes: { emal: "a@b.com" } }`, **Then** it fails with a type error on the misspelled attribute.

---

### User Story 4 - Codegen Produces Complete Schema Interface (Priority: P1)

A developer runs `@toride/codegen` against their policy YAML and gets a generated schema interface that captures all type information: resource names, per-resource permissions, per-resource roles, per-resource attributes, actor types, actor attributes, and relation targets. They pass this schema as the type parameter to `Toride<MySchema>`.

**Why this priority**: Codegen is the bridge between the YAML policy (source of truth) and the TypeScript type system. Without a complete schema interface, no downstream type safety is possible.

**Independent Test**: Can be tested by running codegen on a sample policy and verifying the output contains typed maps for all declared entities.

**Acceptance Scenarios**:

1. **Given** a policy YAML with resources, actors, permissions, roles, relations, and attributes, **When** the developer runs codegen, **Then** the output contains a schema interface with `Resources`, `Actions`, `PermissionMap`, `RoleMap`, `RelationMap`, `ActorTypes`, `ActorAttributeMap`, and `ResourceAttributeMap`.
2. **Given** a resource `Document` with `attributes: { status: string, ownerId: string }`, **When** codegen runs, **Then** `ResourceAttributeMap` contains `Document: { status: string; ownerId: string }`.
3. **Given** an actor `User` with `attributes: { email: string, is_admin: boolean }`, **When** codegen runs, **Then** `ActorAttributeMap` contains `User: { email: string; is_admin: boolean }`.

---

### User Story 5 - Typed Batch Checks, Explain, and Other Engine Methods (Priority: P2)

A developer using `canBatch()`, `explain()`, `permittedActions()`, `buildConstraints()`, `canField()`, and `permittedFields()` wants the same type safety as `can()` — actions narrowed per resource, resource types validated, return types reflecting the schema.

**Why this priority**: These methods share the same parameters as `can()` and should benefit from the same type narrowing. Without this, developers might use the typed `can()` but fall back to untyped strings when using advanced methods.

**Independent Test**: Can be tested by calling each method with typed arguments and verifying compile-time checks.

**Acceptance Scenarios**:

1. **Given** a typed Toride instance, **When** calling `canBatch(actor, [{ action: "reed", resource: ... }])`, **Then** the compiler reports a type error on `"reed"`.
2. **Given** a typed Toride instance, **When** calling `explain(actor, "read", { type: "Document", id: "1" })`, **Then** the return type's `grantedPermissions` is typed as the permission union for `Document`, not `string[]`.
3. **Given** a typed Toride instance, **When** calling `buildConstraints(actor, "read", "Document")`, **Then** the `resourceType` parameter is narrowed to valid resource type names.
4. **Given** a typed Toride instance, **When** calling `permittedActions(actor, resource)`, **Then** the return type is the permission union array for that resource type.

---

### User Story 6 - Typed Client-Side Permission Checks (Priority: P3)

A frontend developer using `TorideClient` wants compile-time validation on `client.can(action, resource)` so that action names and resource types are checked against the same schema used server-side.

**Why this priority**: Client-side checks are the last mile of authorization UX. Type safety here prevents frontend/backend permission name drift. Lower priority because client-side checks are supplementary (server is authoritative).

**Independent Test**: Can be tested by constructing a typed `TorideClient<MySchema>` and verifying `can("reed", ...)` fails to compile.

**Acceptance Scenarios**:

1. **Given** a `TorideClient<MySchema>` instance, **When** calling `can("read", { type: "Document", id: "1" })`, **Then** it compiles.
2. **Given** the same client, **When** calling `can("reed", { type: "Document", id: "1" })`, **Then** the compiler reports a type error.
3. **Given** the same client, **When** calling `permittedActions({ type: "Docuemnt", id: "1" })`, **Then** the compiler reports a type error on the resource type.

---

### User Story 7 - Typed Integration Packages (Priority: P3)

A developer using `@toride/drizzle` or `@toride/prisma` wants type-safe resolver creation and constraint adapters that leverage the schema types. For example, `createDrizzleResolver` should know which resource type it resolves and enforce the correct return attribute shape.

**Why this priority**: Integration packages are the practical layer where most developers interact with Toride. Type safety here completes the end-to-end story but depends on core + codegen being done first.

**Independent Test**: Can be tested by creating a typed Drizzle/Prisma resolver for a known resource type and verifying attribute shape enforcement.

**Acceptance Scenarios**:

1. **Given** a schema with `Document` attributes `{ status: string, ownerId: string }`, **When** creating a Drizzle resolver for `"Document"`, **Then** the resolver's return type is constrained to `{ status: string; ownerId: string }`.
2. **Given** the same schema, **When** creating a resolver for `"Docuemnt"` (typo), **Then** the compiler reports a type error.

---

### Edge Cases

- What happens when a developer uses `Toride` without a type parameter? It must still work with `string` types everywhere (backward-compatible default schema).
- What happens when a policy has no actors declared? The actor type should default to `string` with `Record<string, unknown>` attributes.
- What happens when a resource has no `attributes` section in the policy? The attribute type should fall back to `Record<string, unknown>` for that resource.
- What happens when codegen encounters attribute types beyond `string | number | boolean`? It should map them to TypeScript equivalents or produce a clear error.
- What happens when a developer passes a union resource type (e.g., `"Document" | "Task"`) to `can()`? The action parameter should be the intersection of valid actions for both types (i.e., only actions valid for ALL types in the union).
- What happens with the `"all"` grant shorthand? It should not appear as a literal action type; codegen should expand it to the full permission set.

## Requirements *(mandatory)*

### Functional Requirements

#### Policy Schema Extension

- **FR-001**: The policy schema MUST support an optional `attributes` declaration on resource blocks, using the same `{ field_name: type }` format as actor declarations, where type is `"string" | "number" | "boolean"`.
- **FR-002**: Resource attributes MUST be optional — resources without declared attributes fall back to `Record<string, unknown>` in the type system.
- **FR-003**: Policy validation MUST validate resource attribute declarations (valid type names, no duplicates).

#### Core Schema Interface

- **FR-004**: The core package MUST define a `TorideSchema` interface (or equivalent) that serves as the type parameter shape, containing at minimum: a resource names union, an actor types union, per-resource permission maps, per-resource role maps, per-resource attribute maps, per-actor attribute maps, and per-resource relation maps.
- **FR-005**: The core package MUST provide a `DefaultSchema` type where all fields are `string` and attributes are `Record<string, unknown>`, used when no type parameter is provided.
- **FR-006**: `Toride<TSchema>` MUST default the type parameter to `DefaultSchema` so that `new Toride(opts)` without a type parameter works identically to the current untyped behavior.

#### Typed Engine Methods

- **FR-007**: `can()` MUST accept a generic resource type parameter and narrow the `action` argument to the permissions declared for that specific resource type in the schema.
- **FR-008**: `can()` MUST narrow the `resource.type` field to the union of resource names declared in the schema.
- **FR-009**: `can()` MUST narrow `actor.type` to the union of actor type names and `actor.attributes` to the corresponding typed attribute map.
- **FR-010**: `canBatch()` MUST type-check each `BatchCheckItem`'s action and resource against the schema.
- **FR-011**: `explain()` MUST have the same type narrowing as `can()` for its parameters.
- **FR-012**: `permittedActions()` MUST return the typed permission union array for the given resource type.
- **FR-013**: `buildConstraints()` MUST narrow its `resourceType` parameter to valid resource type names.
- **FR-014**: `canField()` and `permittedFields()` MUST type-check their resource parameter.
- **FR-015**: `resolvedRoles()` MUST type-check its resource parameter.
- **FR-016**: `snapshot()` MUST type-check its resource array parameter.
- **FR-017**: Inline `ResourceRef.attributes` MUST be type-checked against the declared resource attribute schema when a typed schema is provided.

#### Typed Resolvers

- **FR-018**: The `Resolvers` type (or its codegen equivalent) MUST map resource type names to resolver functions whose return type matches the declared resource attributes.
- **FR-019**: Resolver keys MUST be narrowed to valid resource type names from the schema.
- **FR-020**: When both inline attributes and resolver results are present, both MUST be typed against the same attribute schema.

#### Codegen Output

- **FR-021**: Codegen MUST generate a `ResourceAttributeMap` interface mapping each resource name to its typed attribute object (based on the new resource `attributes` declaration).
- **FR-022**: Codegen MUST generate an `ActorAttributeMap` interface mapping each actor type to its typed attribute object (from existing actor declarations).
- **FR-023**: Codegen MUST generate a unified schema interface (e.g., `GeneratedSchema`) that aggregates all type maps and can be passed directly as `Toride<GeneratedSchema>`.
- **FR-024**: Codegen MUST generate a typed `ResolverMap` where each resolver's return type matches the resource's declared attributes.
- **FR-025**: Codegen MUST continue generating the existing type declarations (`Actions`, `Resources`, `RoleMap`, `PermissionMap`, `RelationMap`) in addition to the new maps.

#### Typed Client

- **FR-026**: `TorideClient` MUST accept a schema type parameter and narrow `action` and `resource.type` in its `can()` and `permittedActions()` methods.
- **FR-027**: `TorideClient` without a type parameter MUST default to `string` types for backward compatibility.

#### Typed Integrations

- **FR-028**: `@toride/drizzle`'s `createDrizzleResolver` MUST accept a schema type parameter to enforce the resolver return type against declared resource attributes.
- **FR-029**: `@toride/prisma`'s `createPrismaResolver` MUST accept a schema type parameter to enforce the resolver return type against declared resource attributes.
- **FR-030**: Integration adapter factory functions MUST narrow resource type parameters against the schema.

#### Backward Compatibility

- **FR-031**: All type improvements MUST be additive — providing no type parameter defaults to the current `string`-based behavior. This is a breaking change release but migration MUST be straightforward (add a type parameter to opt in).

### Key Entities

- **TorideSchema**: The shape interface that carries all type information (resource names, actor types, permission maps, attribute maps, etc.). Serves as the single type parameter for `Toride<T>`.
- **DefaultSchema**: A concrete schema type where everything is `string` / `Record<string, unknown>`. Used as the default type parameter.
- **ResourceAttributeMap**: A generated interface mapping resource type names to their typed attribute objects.
- **ActorAttributeMap**: A generated interface mapping actor type names to their typed attribute objects.
- **GeneratedSchema**: The codegen-produced concrete schema type that implements `TorideSchema` with all policy-derived type information.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Typos in action names cause compile-time errors in 100% of typed engine method calls (`can`, `canBatch`, `explain`, `buildConstraints`, `canField`, `permittedFields`, `permittedActions`).
- **SC-002**: Typos in resource type names cause compile-time errors in 100% of typed engine method calls.
- **SC-003**: Typos in actor type names cause compile-time errors when constructing typed actor refs.
- **SC-004**: Resolver functions that return incorrect attribute shapes cause compile-time errors.
- **SC-005**: Inline resource attributes that don't match the declared schema cause compile-time errors.
- **SC-006**: All existing tests continue to pass without modification (runtime behavior is unchanged).
- **SC-007**: Developers can adopt type safety incrementally by adding a single type parameter (`Toride<MySchema>`) — no other API changes required.
- **SC-008**: IDE autocompletion suggests valid action names, resource types, actor types, and attribute keys when using a typed Toride instance.
- **SC-009**: Codegen output from a sample policy with 5 resources, 3 actor types, and 10+ permissions produces a valid schema interface that compiles without errors.
- **SC-010**: Client-side `TorideClient<MySchema>` catches invalid action/resource combinations at compile time.

## Assumptions

- The policy YAML format can be extended with an `attributes` field on resource blocks without breaking existing policies (it's optional).
- TypeScript 5.0+ features (const type parameters, satisfies, template literal types) are available in the target environment.
- The attribute type system is limited to `string | number | boolean` (matching the existing actor attribute types). Complex types (arrays, nested objects) are out of scope.
- The `env` field in `CheckOptions` remains untyped (`Record<string, unknown>`) as environment variables are inherently dynamic.
- Breaking changes are acceptable — this will be a major version bump.

## Scope Boundaries

### In Scope
- Policy schema extension for resource attributes
- Core `Toride` class generic type parameter
- All engine method type narrowing
- Codegen schema interface generation
- `TorideClient` type parameter
- `@toride/drizzle` and `@toride/prisma` type parameter support
- `ResolverMap` typed return values
- `ActorRef` and `ResourceRef` type narrowing

### Out of Scope
- Typing the `env` field in `CheckOptions`
- Complex attribute types beyond `string | number | boolean`
- Runtime type validation of attributes (this is compile-time only)
- Inferring types directly from Policy object literals (complex conditional types) — codegen handles this
- Changes to the authorization evaluation logic or runtime behavior
