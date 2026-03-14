# Feature Specification: Simplify Constraint API & Deep Attribute Type Safety

**Feature Branch**: `simplify-constraint-api`
**Created**: 2026-03-13
**Status**: Draft
**Input**: User description: "buildConstraints returns forbidden, unrestricted, or a constraint. this is extremely redundant. how about throwing a custom error when `forbidden`. `unrestricted` could just return `constraint: null`. Also, type safety can still be improved. The `attributes` is not type safety atm. it's just `Record<string, unknown>`. there should be a better way to be type safety from the YAML policy. nested attributes will seem to be hard to infer, but give me solutions to overcome this problem. Also, the Resolver's return type should be type safety as well. this should be the same problem"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Simplified buildConstraints Return Type (Priority: P1)

As a library consumer building data-filtering middleware, I want `buildConstraints` to return a simple result object so I can handle the three outcomes (unrestricted, constrained, forbidden) without navigating a confusing three-way discriminated union.

**Why this priority**: The current `ConstraintResult` union (`{ unrestricted: true } | { forbidden: true } | { constraints: Constraint }`) forces callers to check multiple property names. This is the most immediately impactful API ergonomics improvement and unblocks the type safety work.

**Independent Test**: Can be tested by calling `buildConstraints` and verifying the new return shape, with no dependency on nested attributes or codegen.

**Acceptance Scenarios**:

1. **Given** an actor with unrestricted access to a resource type, **When** `buildConstraints` is called, **Then** it returns `{ ok: true, constraint: null }`.
2. **Given** an actor with conditional access (derived role with resource conditions), **When** `buildConstraints` is called, **Then** it returns `{ ok: true, constraint: <Constraint AST> }`.
3. **Given** an actor with no access (no grants, no matching derivation paths), **When** `buildConstraints` is called, **Then** it returns `{ ok: false }`.
4. **Given** a constraint that simplifies to `{ type: "never" }` (impossible statement), **When** `buildConstraints` is called, **Then** it returns `{ ok: false }` (same as explicitly forbidden).
5. **Given** a constraint that simplifies to `{ type: "always" }`, **When** `buildConstraints` is called, **Then** it returns `{ ok: true, constraint: null }` (same as unrestricted).

---

### User Story 2 - Nested Attribute Type Declarations in YAML (Priority: P2)

As a policy author, I want to declare nested object types, primitive arrays, and arrays of objects in my YAML policy's attribute schemas so that the authorization engine and codegen can generate accurate TypeScript types for my domain model.

**Why this priority**: This is the foundation for all attribute type safety improvements. Without nested attribute declarations, the codegen cannot generate accurate types and `Record<string, unknown>` remains the fallback.

**Independent Test**: Can be tested by writing YAML policies with nested attributes, loading them, and verifying the parser produces correct internal representations.

**Acceptance Scenarios**:

1. **Given** a YAML policy with a nested object attribute (`address: { city: string, zip: string }`), **When** the policy is loaded, **Then** the parser produces a structured attribute schema with nested fields.
2. **Given** a YAML policy with a primitive array attribute (`tags: string[]`), **When** the policy is loaded, **Then** the parser produces an array-typed attribute schema.
3. **Given** a YAML policy with an array-of-objects attribute (`members: { type: array, items: { id: string, role: string } }`), **When** the policy is loaded, **Then** the parser produces an array schema with object item types.
4. **Given** a YAML policy with attributes nested deeper than 3 levels, **When** the policy is loaded, **Then** the validator rejects it with a clear error message indicating the maximum nesting depth is 3.
5. **Given** a YAML policy using the existing flat attribute syntax (`status: string`), **When** the policy is loaded, **Then** it continues to work without changes (backward compatible at the YAML level).

---

### User Story 3 - Codegen Generates Nested TypeScript Types (Priority: P3)

As a developer using `@toride/codegen`, I want the generated `ResourceAttributeMap` and `ActorAttributeMap` to include nested TypeScript interfaces and array types matching my YAML attribute declarations, so that `ResourceRef.attributes` and resolver return values are fully typed.

**Why this priority**: Without updated codegen, the nested YAML declarations have no effect on the TypeScript type system. This story bridges the YAML schema to compile-time type safety.

**Independent Test**: Can be tested by running codegen on a YAML policy with nested attributes and verifying the output TypeScript file contains correct nested interfaces and array types.

**Acceptance Scenarios**:

1. **Given** a YAML policy with `address: { city: string, zip: string }`, **When** codegen runs, **Then** the generated `ResourceAttributeMap` entry contains `{ address: { city: string; zip: string } }`.
2. **Given** a YAML policy with `tags: string[]`, **When** codegen runs, **Then** the generated type contains `{ tags: string[] }`.
3. **Given** a YAML policy with `members: { type: array, items: { id: string, role: string } }`, **When** codegen runs, **Then** the generated type contains `{ members: Array<{ id: string; role: string }> }`.
4. **Given** a mixed policy with both flat and nested attributes, **When** codegen runs, **Then** flat attributes remain as `string | number | boolean` and nested attributes are correctly typed.

---

### User Story 4 - Typed Resolver Return Values (Priority: P4)

As a developer registering resource resolvers, I want the resolver function's return type to match the resource's declared attribute shape (from the schema), so that TypeScript catches mismatches between my resolver implementation and my policy's attribute declarations.

**Why this priority**: Depends on codegen producing accurate types (P3). Once the types exist, wiring them into the `ResourceResolver` generic is a small but high-impact change.

**Independent Test**: Can be tested with type-level tests (tsd) verifying that resolvers registered for a typed engine must return the correct attribute shape.

**Acceptance Scenarios**:

1. **Given** a typed engine `Toride<MySchema>` where `Document` attributes are `{ status: string; ownerId: string }`, **When** a resolver for `Document` returns `{ status: "draft", ownerId: "u1" }`, **Then** TypeScript accepts it.
2. **Given** the same typed engine, **When** a resolver for `Document` returns `{ status: 123 }` (wrong type), **Then** TypeScript produces a compile error.
3. **Given** a typed engine with nested attributes, **When** a resolver returns an object matching the nested shape, **Then** TypeScript accepts it.
4. **Given** a default (untyped) engine `Toride`, **When** a resolver returns `Record<string, unknown>`, **Then** TypeScript accepts it (backward compatible).

---

### User Story 5 - Strict Dot-Path Validation in Policy Validator (Priority: P5)

As a policy author, I want the policy validator to check that dot-path references in conditions (e.g., `$resource.address.city`) match declared attribute paths, so that I catch typos and invalid references at policy load time rather than at runtime.

**Why this priority**: This is a quality-of-life improvement that depends on the nested attribute schema (P2) being in place. It prevents subtle runtime bugs but is not required for the type system to work.

**Independent Test**: Can be tested by loading policies with valid and invalid dot-path references and verifying the validator produces appropriate errors or passes.

**Acceptance Scenarios**:

1. **Given** a policy with `$resource.address.city` in a condition and `address: { city: string }` declared, **When** the policy is validated, **Then** validation passes.
2. **Given** a policy with `$resource.address.zipcode` in a condition but `address` only declares `city` and `zip`, **When** the policy is validated, **Then** validation fails with an error identifying the invalid path and the resource type.
3. **Given** a policy with `$resource.tags` referencing a declared `tags: string[]` attribute, **When** the policy is validated, **Then** validation passes.
4. **Given** a policy with `$actor.department` referencing a declared actor attribute, **When** the policy is validated, **Then** validation passes (actor paths are also checked).
5. **Given** a policy with `$env.timezone` (environment references), **When** the policy is validated, **Then** validation passes (env paths cannot be validated against a schema and are exempt).

---

### Edge Cases

- What happens when a YAML attribute key collides with the reserved `type` keyword used for array declarations? The parser must disambiguate `type: string` (a flat attribute named "type") from `type: array` (an array declaration). Resolution: `type: array` is only treated as an array declaration when an `items` sibling key is also present.
- What happens when `translateConstraints` is called on a result with `ok: false`? It should not be callable — the type system should prevent it (only `Constraint` values are accepted, not the result object).
- What happens when a resolver returns `Partial<Attributes>` (missing some fields)? The resolver return type should be `Partial<S['resourceAttributeMap'][R]>` to allow resolvers that only fetch a subset of attributes.
- What happens when nested attributes reference types at exactly depth 3? Validation passes. Depth 4 is rejected.
- What happens when an array-of-objects attribute is referenced with a dot-path in a condition (e.g., `$resource.members.role`)? The validator should reject this — array item paths require special handling that is out of scope for this feature.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `buildConstraints` MUST return `{ ok: true, constraint: Constraint | null }` when access is unrestricted (`null`) or conditionally granted (`Constraint`).
- **FR-002**: `buildConstraints` MUST return `{ ok: false }` when access is completely denied (no grants, or constraint simplifies to `never`).
- **FR-003**: The old `ConstraintResult` type (`{ unrestricted: true } | { forbidden: true } | { constraints: Constraint }`) MUST be replaced with the new result type.
- **FR-004**: A new `ForbiddenError` error class MUST be exported from the `toride` package for callers who want to throw on `ok: false`.
- **FR-005**: The YAML policy attribute schema MUST support nested object declarations using map syntax (e.g., `address: { city: string, zip: string }`).
- **FR-006**: The YAML policy attribute schema MUST support primitive array shorthand (e.g., `tags: string[]`, `scores: number[]`, `flags: boolean[]`).
- **FR-007**: The YAML policy attribute schema MUST support array-of-objects declarations using `type: array` + `items` syntax.
- **FR-008**: The YAML policy attribute schema MUST reject attribute nesting deeper than 3 levels with a clear validation error.
- **FR-009**: The `@toride/codegen` package MUST generate nested TypeScript interfaces and array types from the new YAML attribute schema.
- **FR-010**: The `ResourceResolver` type MUST use the schema's per-resource attribute shape as its return type instead of `Record<string, unknown>`.
- **FR-011**: The policy validator MUST check that `$resource.*` and `$actor.*` dot-path references in conditions match declared attribute paths.
- **FR-012**: The policy validator MUST NOT validate `$env.*` paths (environment values have no schema).
- **FR-013**: The policy validator MUST reject dot-path references that traverse into array items (e.g., `$resource.members.role` where `members` is an array).
- **FR-014**: Existing flat attribute syntax (`status: string`) MUST continue to work unchanged.
- **FR-014a**: Both `loadYaml` and `loadJson` MUST support the new nested attribute schema. The `string[]` shorthand is YAML-only; JSON uses the explicit `{ type: "array", items: ... }` form.
- **FR-015**: The `translateConstraints` method MUST accept only `Constraint` values (not the full result object), enforced by the type system.
- **FR-016**: This MUST be shipped as a semver major version (breaking change).
- **FR-017**: The `@toride/drizzle` and `@toride/prisma` adapter packages MUST be updated to consume the new `ConstraintResult` type and ship as part of the same major release.
- **FR-018**: The JSON Schema for policy file validation (`PolicySchema`) MUST be updated to accept nested attribute declarations, arrays, and arrays of objects.

### Key Entities

- **ConstraintResult**: The return type of `buildConstraints`. Changes from a three-way discriminated union to `{ ok: true, constraint: Constraint | null } | { ok: false }`.
- **AttributeSchema**: The internal representation of a YAML attribute declaration. Extends beyond flat `AttributeType` to support nested objects and arrays, up to 3 levels deep. Carried in the runtime `Policy` object (not just codegen) to enable load-time dot-path validation.
- **ForbiddenError**: A new error class callers can throw when `buildConstraints` returns `{ ok: false }`. Contains actor, action, and resource type context.
- **ResourceResolver**: Per-resource resolver function. Return type changes from `Record<string, unknown>` to the schema's typed attribute shape.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Library consumers can distinguish the three `buildConstraints` outcomes (unrestricted, constrained, forbidden) with at most one conditional check each (no nested property inspection).
- **SC-002**: 100% of YAML attribute declarations (flat, nested objects, primitive arrays, arrays of objects) produce correctly typed TypeScript output from codegen.
- **SC-003**: Resolver type mismatches (wrong return shape) are caught at compile time for all typed engine instances.
- **SC-004**: Policy validation catches 100% of invalid dot-path references in conditions that reference undeclared attribute paths.
- **SC-005**: All existing tests pass after migration with updated assertions (no behavioral regressions, only API shape changes).
- **SC-006**: Existing YAML policies using flat attributes load and work without modification.

## Clarifications

### Session 2026-03-13

- Q: Should updating @toride/drizzle and @toride/prisma adapters for the new ConstraintResult be in scope? → A: In scope — full adapter updates in the same major release.
- Q: Should the YAML attribute schema support nullable types (e.g., `string?`)? → A: Not now — deferred to a follow-up. All attributes are non-nullable in this version.
- Q: Does `loadJson` also need nested attribute schema support? → A: Yes, both `loadYaml` and `loadJson` must handle nested attributes identically.
- Q: What should `QueryEvent.resultType` look like with the new API? → A: Keep existing values (`"unrestricted" | "forbidden" | "constrained"`). Audit events don't need to mirror the API return type.
- Q: Should the runtime `Policy` type carry the full nested attribute schema? → A: Yes. The parsed Policy object includes nested attribute declarations, enabling runtime dot-path validation.
- Q: Should the JSON Schema for policy file IDE validation be updated for nested attributes? → A: Yes, in scope.
- Q: Should prototype-pollution guards be an explicit spec requirement for nested schema parsing? → A: No — defer to planning. Existing guards already cover this pattern.

## Assumptions

- The `type: array` keyword in YAML attribute declarations is disambiguated from a flat attribute named `type` by the presence of an `items` sibling key.
- Resolver return types use `Partial<>` to allow resolvers that fetch only a subset of attributes.
- The `QueryEvent.resultType` field retains its existing `"unrestricted" | "forbidden" | "constrained"` values unchanged (audit semantics are independent of the API return shape).
- Array-item dot-path traversal in conditions (e.g., `$resource.members.role`) is out of scope and will be explicitly rejected by the validator.
- Nullable attribute types (e.g., `string?`, `string | null`) are out of scope and deferred to a follow-up feature.
