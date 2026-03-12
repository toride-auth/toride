# Feature Specification: Deep Type Safety

**Feature Branch**: `improve-typesafety2`
**Created**: 2026-03-12
**Status**: Draft
**Input**: User description: "Make toride extremely type-safe — per-resource action narrowing everywhere, typed constraint pipeline, typed adapter outputs, typed fields, typed roles, typed snapshots"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Resource-Typed Constraint Pipeline (Priority: P1)

A developer using `engine.buildConstraints(actor, "read", "Document")` wants the returned constraint result to carry the resource type `"Document"` so that when they pass it to `engine.translateConstraints(result, prismaAdapter)`, the output is `Prisma.DocumentWhereInput` instead of an opaque `Record<string, unknown>`. This eliminates unsafe casts and enables IDE autocomplete on the resulting query object.

**Why this priority**: The constraint pipeline (buildConstraints → translateConstraints) is the primary data-filtering workflow. Untyped adapter output (`PrismaWhere = Record<string, unknown>`) is the biggest type-safety gap — users cannot see what's inside the result without casting.

**Independent Test**: Can be fully tested by creating a typed adapter with a resource-to-query-type map and verifying that the TypeScript compiler infers the correct output type at each stage of the pipeline.

**Acceptance Scenarios**:

1. **Given** a `Toride<GeneratedSchema>` engine and a Prisma adapter created with `createPrismaAdapter<{ Document: Prisma.DocumentWhereInput; Organization: Prisma.OrganizationWhereInput }>()`, **When** the developer calls `buildConstraints(actor, "read", "Document")` and passes the result to `translateConstraints()`, **Then** the return type is `Prisma.DocumentWhereInput` (not `Record<string, unknown>`).
2. **Given** the same setup, **When** the developer passes a misspelled resource type like `"Docuemnt"`, **Then** the TypeScript compiler produces a type error.
3. **Given** the same setup, **When** the developer passes an action not valid for the resource (e.g., `"manage"` for `"Document"`), **Then** the TypeScript compiler produces a type error.
4. **Given** no type parameter is provided (DefaultSchema), **When** the developer uses the constraint pipeline, **Then** the adapter output defaults to the adapter's base type (e.g., `PrismaWhere`) — backward compatible.

---

### User Story 2 - Per-Resource Action Narrowing on TorideClient (Priority: P1)

A frontend developer using `TorideClient<GeneratedSchema>` wants `client.can("read", { type: "Document", id: "d1" })` to only accept actions valid for Document (`"read" | "write" | "delete"`), not the global actions union. This catches errors like `client.can("manage", docRef)` at compile time.

**Why this priority**: The client is the primary consumer of permission checks in frontend code. Per-resource narrowing prevents a class of bugs where actions valid for one resource are accidentally checked against another.

**Independent Test**: Can be tested with tsd type tests verifying that invalid action/resource combinations produce compile errors on `TorideClient.can()`.

**Acceptance Scenarios**:

1. **Given** a `TorideClient<GeneratedSchema>`, **When** the developer calls `client.can("read", { type: "Document", id: "d1" })`, **Then** it compiles successfully.
2. **Given** the same client, **When** the developer calls `client.can("manage", { type: "Document", id: "d1" })`, **Then** the TypeScript compiler produces a type error because `"manage"` is not a Document permission.
3. **Given** the same client, **When** the developer calls `client.permittedActions({ type: "Document", id: "d1" })`, **Then** the return type is `("read" | "write" | "delete")[]`, not the global actions union.

---

### User Story 3 - Typed Fields for canField and permittedFields (Priority: P2)

A developer using `engine.canField(actor, "read", docRef, "status")` wants the `field` parameter to be constrained to the known attribute names for that resource (e.g., `"status" | "ownerId"` for Document). `permittedFields()` should return the same typed union array.

**Why this priority**: Catching field name typos at compile time prevents silent authorization failures where a misspelled field silently returns `false`.

**Independent Test**: Can be tested with tsd type tests verifying field parameter autocomplete and compile errors for invalid field names.

**Acceptance Scenarios**:

1. **Given** a `Toride<GeneratedSchema>` engine and a Document resource, **When** the developer calls `canField(actor, "read", docRef, "status")`, **Then** it compiles successfully.
2. **Given** the same setup, **When** the developer calls `canField(actor, "read", docRef, "nonexistent")`, **Then** the TypeScript compiler produces a type error.
3. **Given** the same setup, **When** the developer calls `permittedFields(actor, "read", docRef)`, **Then** the return type is `("status" | "ownerId")[]`.

---

### User Story 4 - Typed Roles from resolvedRoles (Priority: P2)

A developer calling `engine.resolvedRoles(actor, docRef)` wants the return type to be `("owner" | "editor" | "viewer")[]` instead of `string[]`, enabling autocomplete and type-safe role comparisons.

**Why this priority**: Role names are a common source of typos. Typed roles enable safe comparisons like `roles.includes("editor")` where `"editr"` would be caught at compile time.

**Independent Test**: Can be tested with tsd type tests verifying the return type narrows per resource.

**Acceptance Scenarios**:

1. **Given** a `Toride<GeneratedSchema>` engine, **When** the developer calls `resolvedRoles(actor, docRef)`, **Then** the return type is `("owner" | "editor" | "viewer")[]`.
2. **Given** the same setup, **When** the developer calls `resolvedRoles(actor, orgRef)`, **Then** the return type is `("admin" | "member")[]`.

---

### User Story 5 - Typed PermissionSnapshot (Priority: P3)

A developer generating a snapshot with `engine.snapshot()` wants the resulting object to carry type information so that when it's deserialized on the client, invalid resource/action combinations are caught.

**Why this priority**: Snapshots bridge server and client. Typing the snapshot ensures the type contract is maintained across the serialization boundary.

**Independent Test**: Can be tested with tsd type tests verifying the snapshot type carries schema info.

**Acceptance Scenarios**:

1. **Given** a `Toride<GeneratedSchema>` engine, **When** the developer calls `snapshot(actor, [docRef, orgRef])`, **Then** the return type is `PermissionSnapshot<GeneratedSchema>` (schema generic preserved).
2. **Given** a `TorideClient<GeneratedSchema>` constructed from a typed snapshot, **When** the developer accesses permissions, **Then** resource and action types are preserved because the schema generic flows through from the snapshot.

---

### User Story 6 - Codegen Generates All Required Type Maps (Priority: P1)

A developer running `@toride/codegen` against their policy YAML wants the generated `GeneratedSchema` to include all type maps needed for the new type-safety features: per-resource field name unions, per-resource role unions, and the existing maps (permissionMap, resourceAttributeMap, etc.).

**Why this priority**: Codegen is the entry point for type safety. If codegen doesn't produce the right types, none of the downstream type-safety features work.

**Independent Test**: Can be tested by running codegen on a sample policy and verifying the output includes all required type maps that satisfy the updated TorideSchema interface.

**Acceptance Scenarios**:

1. **Given** a policy YAML with resources, roles, permissions, attributes, and relations, **When** the developer runs codegen, **Then** the output includes all maps required by `TorideSchema`.
2. **Given** the generated output, **When** the developer uses it as `Toride<GeneratedSchema>`, **Then** all engine methods provide full autocomplete and type narrowing.

---

### Edge Cases

- What happens when a resource has no declared attributes? Field-related methods use `never` as the field type, making them uncallable for that resource (compile error if attempted).
- What happens when a resource has no declared roles? `resolvedRoles()` return type is `never[]`, making it a compile error to call for that resource.
- What happens when DefaultSchema is used? All new type parameters should degrade gracefully to `string` / `Record<string, unknown>` — preserving backward compatibility.
- What happens when the adapter type map doesn't include a resource? The adapter should fall back to its base query type for unmapped resources.
- What happens when codegen encounters a resource with no permissions? The permission map entry should be `never`.

## Clarifications

### Session 2026-03-12

- Q: When a resource has no declared attributes, what should field-related methods (canField, permittedFields) accept as the field parameter type? → A: `never` — field methods become uncallable for that resource (compile error if attempted).
- Q: Does changing the ConstraintAdapter interface from `ConstraintAdapter<TQuery>` to `ConstraintAdapter<TQueryMap>` constitute a breaking change? How should it be handled? → A: Breaking change is acceptable; minor version bump is sufficient (no major bump required).
- Q: Are `explain()` and `canBatch()` in scope for per-resource type narrowing despite having no user stories? → A: Yes, in scope — they follow the same type signature pattern as the other engine methods.
- Q: Are both Prisma and Drizzle adapters in scope for this feature? → A: Yes, both in scope. They share the same ConstraintAdapter pattern so the effort is incremental.
- Q: How should PermissionSnapshot carry type information? → A: Schema generic only (`PermissionSnapshot<S extends TorideSchema>`). The snapshot stays runtime-serializable; the type parameter S flows through to TorideClient<S> on deserialization.
- Q: When a resource has no declared roles, what should `resolvedRoles()` return type be? → A: `never[]` — consistent with no-attributes decision. Calling resolvedRoles on a role-less resource is a compile error.
- Q: Should field name unions be derived from `keyof resourceAttributeMap[R]` or from a new separate `fieldMap`? → A: Derive from `keyof resourceAttributeMap[R]`. No new type map needed — single source of truth.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `buildConstraints<R>()` MUST return a `ConstraintResult` that carries the resource type `R` at the type level.
- **FR-002**: `translateConstraints()` MUST accept a resource type parameter and return the adapter's mapped output type for that resource.
- **FR-003**: `ConstraintAdapter<TQuery>` MUST be updated to support a resource-to-query-type mapping, so adapters can return different types per resource.
- **FR-004**: `createPrismaAdapter()` MUST accept a generic type map parameter mapping resource names to Prisma WHERE input types.
- **FR-005**: `createDrizzleAdapter()` MUST accept a generic type map parameter mapping resource names to Drizzle query types.
- **FR-006**: `TorideClient.can()` MUST narrow the action parameter to only actions valid for the given resource type (per-resource narrowing, not global union).
- **FR-007**: `TorideClient.permittedActions()` MUST return an array typed to the per-resource permission union, not the global actions union.
- **FR-008**: `canField()` MUST constrain the `field` parameter to `keyof S['resourceAttributeMap'][R]` (derived from the existing attribute map, no separate field map needed).
- **FR-009**: `permittedFields()` MUST return an array typed to the attribute name union for the given resource type.
- **FR-010**: `resolvedRoles()` MUST return an array typed to the per-resource role union (`roleMap[R]`).
- **FR-011**: `PermissionSnapshot` MUST carry schema type information so that typed clients can validate resource/action combinations.
- **FR-012**: `@toride/codegen` MUST generate all type maps required by the updated `TorideSchema` interface.
- **FR-013**: All new type parameters MUST have defaults that degrade to the current behavior when `DefaultSchema` is used (backward compatibility for untyped usage).
- **FR-014**: `TorideSchema` interface MUST remain the single source of truth for all type information, with no parallel type systems.

### Key Entities

- **TorideSchema**: The central type interface that codegen populates. No new maps needed for field names (derived from `keyof resourceAttributeMap[R]`) or role names (already in `roleMap`). May be extended only if adapter query type mapping requires it.
- **ConstraintResult<R>**: Resource-tagged constraint result that flows through the pipeline from `buildConstraints` to `translateConstraints`.
- **ConstraintAdapter<TQueryMap>**: Updated adapter interface where `TQueryMap` maps resource names to query types, enabling per-resource output typing.
- **PermissionSnapshot<S>**: Schema-aware snapshot type where S is the TorideSchema generic. The snapshot remains a runtime-serializable structure; the type parameter flows through to `TorideClient<S>` on deserialization.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of engine methods (`can`, `buildConstraints`, `translateConstraints`, `canField`, `permittedFields`, `resolvedRoles`, `explain`, `canBatch`, `snapshot`) provide per-resource type narrowing when a schema is provided.
- **SC-002**: Adapter output types (Prisma, Drizzle) carry resource-specific type information — `translateConstraints()` returns the mapped type, not `Record<string, unknown>`.
- **SC-003**: All type-safety improvements are verified by tsd compile-time type tests (both positive and negative cases).
- **SC-004**: Untyped usage (no schema parameter) continues to compile and work identically to the current behavior — zero regressions.
- **SC-005**: Developers get IDE autocomplete for action names, resource types, field names, and role names at every call site.
- **SC-006**: Typos in action names, resource types, field names, or role names produce compile-time errors, not silent runtime failures.
