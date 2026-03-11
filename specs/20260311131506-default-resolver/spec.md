# Feature Specification: Default Resolver Formalization

**Feature Branch**: `default-resolver`
**Created**: 2026-03-11
**Status**: Draft
**Input**: User description: "Add default resolver for the field resolver. If no resolver was defined for a field, it should try to return the field that was passed into the resolver function. This is how GraphQL resolvers work as well. If the field resolver was not defined, it returns the value of `parent.<fieldName>`. Also, the resolver function should pass in the `parent` parameter like GraphQL does as well."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Inline Attributes Without Resolver (Priority: P1)

A developer using toride passes resource attributes inline (via `ResourceRef.attributes`) without registering any `ResourceResolver` for that resource type. The engine evaluates policy conditions against those inline attributes successfully, without requiring a resolver.

**Why this priority**: This is the core "default resolver" behavior. Developers should be able to use toride without writing any resolver code when they already have the data available at the call site.

**Independent Test**: Can be fully tested by calling `can()` with a `ResourceRef` that has inline attributes and no registered resolver, then verifying that policy conditions referencing `$resource.<field>` resolve correctly.

**Acceptance Scenarios**:

1. **Given** no resolver is registered for resource type "Document", **When** `can()` is called with `{ type: "Document", id: "1", attributes: { status: "draft" } }` and the policy has a condition `$resource.status: "draft"`, **Then** the condition evaluates against the inline attribute and returns the correct authorization decision.
2. **Given** no resolver is registered for resource type "Document", **When** `can()` is called with a `ResourceRef` that has no inline attributes, **Then** all `$resource.<field>` references resolve to undefined and conditions using them fail (strict null semantics preserved).
3. **Given** no resolver is registered for resource type "Document", **When** `can()` is called with inline attributes `{ priority: 5 }` and the policy checks `$resource.priority: { gt: 3 }`, **Then** the operator condition evaluates correctly against the inline value.

---

### User Story 2 - Explicit Tests for Default Resolver Behavior (Priority: P1)

A contributor or maintainer can verify the default resolver behavior through dedicated, clearly named test cases. These tests serve as both regression protection and living documentation of the "resolvers are optional" contract.

**Why this priority**: Without explicit tests, the default resolver behavior is an implicit side-effect of the implementation. Explicit tests formalize the contract and prevent accidental regressions.

**Independent Test**: Can be verified by running the test suite and confirming all default-resolver-specific test cases pass.

**Acceptance Scenarios**:

1. **Given** the test suite includes default resolver test cases, **When** all tests pass, **Then** the following behaviors are verified: inline attributes resolve without a resolver, multiple fields resolve independently, undefined fields return undefined, and operator conditions work with inline-only data.
2. **Given** a resolver IS registered alongside inline attributes, **When** `can()` is called, **Then** inline attributes take precedence over resolver results (existing merge behavior preserved).

---

### User Story 3 - JSDoc Documentation on Resolver Types (Priority: P2)

A developer reading the TypeScript types (`ResourceResolver`, `Resolvers`, `TorideOptions.resolvers`) understands from the JSDoc comments that resolvers are optional and that inline attributes serve as the default data source when no resolver is registered.

**Why this priority**: Type-level documentation is the first thing developers encounter when using the library. Clear JSDoc reduces confusion and support burden.

**Independent Test**: Can be verified by reading the JSDoc comments on `ResourceResolver`, `Resolvers`, `TorideOptions`, and `AttributeCache` and confirming they explain the default resolver concept.

**Acceptance Scenarios**:

1. **Given** a developer inspects the `Resolvers` type, **When** they read the JSDoc, **Then** they learn that resolvers are optional per resource type and that inline attributes are used as the fallback.
2. **Given** a developer inspects `TorideOptions.resolvers`, **When** they read the JSDoc, **Then** they see an example showing toride used without any resolvers (inline-only mode).
3. **Given** a developer inspects `ResourceResolver`, **When** they read the JSDoc, **Then** they understand the resolver is only called when additional attributes beyond inline data are needed.

---

### User Story 4 - VitePress Documentation Page (Priority: P2)

A developer reading the official docs site finds a page explaining the resolver model, including the default resolver concept, with code examples showing inline-only usage, resolver usage, and the merge precedence rules.

**Why this priority**: The docs site is the canonical learning resource. A dedicated page on resolvers makes the mental model clear for new users.

**Independent Test**: Can be verified by navigating to the resolver documentation page on the VitePress site and confirming it covers all key concepts with examples.

**Acceptance Scenarios**:

1. **Given** the docs site has a resolver documentation page, **When** a developer reads it, **Then** they find: (a) explanation that resolvers are optional, (b) how inline attributes serve as default values, (c) code examples for inline-only usage, (d) code examples for resolver + inline merge, (e) precedence rules (inline wins over resolver).
2. **Given** the docs site resolver page exists, **When** a developer searches for "resolver" or "default resolver", **Then** they can discover the page through site navigation or search.

---

### Edge Cases

- What happens when a resource type has no resolver AND no inline attributes? All `$resource.<field>` conditions resolve to undefined; strict null semantics cause comparisons to fail, resulting in default-deny behavior.
- What happens when inline attributes partially overlap with resolver results? Inline attributes take precedence field-by-field over resolver results (existing merge behavior).
- What happens with nested relation paths (e.g., `$resource.org.name`) when no resolver is registered for the relation target type? The relation target's inline attributes (if provided via cascading) are used. If no inline data exists for the target, the nested field resolves to undefined.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The engine MUST resolve `$resource.<field>` conditions using inline attributes when no `ResourceResolver` is registered for the resource type.
- **FR-002**: The engine MUST preserve existing merge precedence: inline attributes override resolver results when both are present for the same field.
- **FR-003**: The engine MUST return undefined for `$resource.<field>` when no resolver is registered AND the field is not present in inline attributes.
- **FR-004**: The test suite MUST include dedicated test cases that explicitly exercise and name the "default resolver" behavior (inline-only attribute resolution).
- **FR-005**: JSDoc comments on `ResourceResolver`, `Resolvers`, `TorideOptions.resolvers`, and `AttributeCache` MUST document that resolvers are optional and explain the inline-attribute fallback.
- **FR-006**: The VitePress docs site MUST include a page explaining the resolver model, default resolver concept, merge precedence, and provide code examples.
- **FR-007**: Existing behavior MUST NOT change. This feature formalizes and documents existing runtime behavior; no breaking changes are introduced.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Dedicated "default resolver" test cases exist and pass, covering at least: inline-only resolution, missing field resolution, operator conditions with inline data, and merge precedence when a resolver coexists with inline attributes.
- **SC-002**: All `ResourceResolver`, `Resolvers`, `TorideOptions.resolvers`, and `AttributeCache` types have JSDoc comments that explicitly mention resolvers being optional and explain the fallback behavior.
- **SC-003**: A resolver documentation page exists in the VitePress docs site, reachable from the site navigation, covering the default resolver concept with at least 2 code examples.
- **SC-004**: All existing tests continue to pass without modification, confirming no behavioral regression.

## Assumptions

- The current runtime behavior (inline attribute fallback when no resolver is registered) is correct and intentional. This spec formalizes it, not changes it.
- The GraphQL "default resolver" analogy is used as a mental model for documentation purposes, not as a directive to replicate GraphQL's recursive resolver chain.
- The `ResourceRef.attributes` field serves the same role as GraphQL's "parent" in the context of this library: it provides the data that the default resolver returns.
