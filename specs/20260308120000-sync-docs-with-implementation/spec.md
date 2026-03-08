# Feature Specification: Sync Documentation with Implementation

**Feature Branch**: `sync-docs`
**Created**: 2026-03-08
**Status**: Draft
**Input**: User description: "the docs aren't synced with the actual implementation. getRoles and getRelation do not exist anymore. sync the docs with the actual code implementation."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Quickstart Guide Reflects Actual API (Priority: P1)

A developer new to Toride reads the Quickstart guide, follows the code examples, and successfully creates a working authorization setup on the first try. The guide uses the per-type `resolvers` map pattern (`Record<string, ResourceResolver>`) and shows how roles are derived through policy entries rather than a `getRoles` method.

**Why this priority**: The Quickstart is the first code a new user copies. If it references a non-existent `RelationResolver` interface or `getRoles`/`getRelated`/`getAttributes` methods, the user gets immediate compile errors and loses trust in the project.

**Independent Test**: Can be tested by following the Quickstart guide from scratch in a new TypeScript project. Every code snippet must compile and the engine constructor must match the actual `TorideOptions` interface.

**Acceptance Scenarios**:

1. **Given** the Quickstart guide, **When** a developer copies the resolver example, **Then** it uses the `resolvers: Record<string, ResourceResolver>` map pattern (not a `RelationResolver` object with `getRoles`/`getRelated`/`getAttributes`)
2. **Given** the Quickstart guide, **When** the engine is constructed, **Then** the constructor uses `resolvers` (plural, a map) not `resolver` (singular, an object)
3. **Given** the Quickstart guide, **When** the developer reads the "How it works" section, **Then** it describes role derivation through `derived_roles` policy entries, not `getRoles` lookups
4. **Given** the Quickstart guide, **When** the developer reads the resolver explanation table, **Then** it describes one resolver function per resource type that returns attributes (including relation refs), not three separate methods
5. **Given** the Quickstart policy example, **When** the developer reads it, **Then** it includes multiple derivation patterns (global_role, from_role+on_relation, from_relation, and at least one condition-based pattern like actor_type+when) so role origins are self-contained

---

### User Story 2 - Getting Started Guide Uses Correct Terminology (Priority: P2)

A developer reading the Getting Started guide gets an accurate mental model of Toride's architecture before diving into the Quickstart. The description of "what a resolver does" matches the actual per-type attribute resolver pattern.

**Why this priority**: Getting Started sets the conceptual frame. Incorrect wording ("look up roles, relations, and attributes") primes the developer to expect three separate resolver methods.

**Independent Test**: Read the Getting Started guide and verify all descriptions of the resolver concept are consistent with `Resolvers = Record<string, ResourceResolver>`.

**Acceptance Scenarios**:

1. **Given** the Getting Started guide, **When** the developer reads the project setup description, **Then** the resolver is described as a per-type function that returns resource attributes (including relation references), not as an object with `getRoles`/`getRelated`/`getAttributes` methods
2. **Given** the Getting Started guide, **When** the developer reads the "typical project structure" section, **Then** the resolver file description says "Resource resolvers" not "Relation resolver"

---

### User Story 3 - Outdated Technical Spec Removed (Priority: P3)

A developer exploring the docs directory does not encounter `docs/spec.md`, which contains extensive references to the old `RelationResolver` pattern with `getRoles`/`getRelated`/`getAttributes`. This prevents confusion between the outdated spec and the actual API.

**Why this priority**: The spec.md file is a large document with deeply embedded old API references. Updating it would require rewriting ~50+ sections, and it duplicates information already covered in the concept and guide pages. Removing it eliminates a major source of confusion.

**Independent Test**: Verify that `docs/spec.md` no longer exists and that no other documentation page links to it.

**Acceptance Scenarios**:

1. **Given** the docs directory, **When** a developer lists all files, **Then** `spec.md` does not exist
2. **Given** the VitePress sidebar configuration, **When** rendered, **Then** no navigation link points to `/spec` or `spec.md`

---

### Edge Cases

- What if other docs (concepts, integrations) already reference the correct API? They should remain unchanged -- only files with incorrect content are modified.
- What if the VitePress config references spec.md in the sidebar? The sidebar config must be updated to remove the link.
- What if any doc page cross-links to spec.md? Those links must be removed or redirected.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Quickstart guide (`docs/guide/quickstart.md`) MUST replace the `RelationResolver` pattern with the per-type `resolvers` map pattern (`Record<string, ResourceResolver>`)
- **FR-002**: The Quickstart guide MUST NOT reference `getRoles`, `getRelated`, or `getAttributes` methods
- **FR-003**: The Quickstart guide MUST show the engine constructor with `resolvers` (a map of resource type to resolver function), not `resolver` (a single object)
- **FR-004**: The Quickstart guide MUST include resolver examples for both `Task` and `Project` resource types, each returning a flat object with attributes and relation refs (e.g., `project: { type: "Project", id: task.projectId }`)
- **FR-005**: The Quickstart policy example MUST include additional `derived_roles` patterns on the `Project` resource (e.g., `actor_type` + `when` for department-based access) to demonstrate how roles originate without `getRoles`
- **FR-006**: The Quickstart "How it works" explanation MUST describe the evaluation flow as: derive roles via policy -> expand grants -> evaluate rules, without referencing `getRoles`
- **FR-007**: The Quickstart resolver explanation table MUST describe one entry: a per-type function that returns attributes and relation references
- **FR-008**: The Getting Started guide (`docs/guide/getting-started.md`) MUST describe the resolver as "per-type functions that return resource attributes" not "how to look up roles, relations, and attributes"
- **FR-009**: The file `docs/spec.md` MUST be deleted
- **FR-010**: Any VitePress configuration or sidebar referencing `spec.md` MUST be updated to remove the link
- **FR-011**: Any cross-links from other documentation pages to `spec.md` MUST be removed
- **FR-012**: All documentation pages that already use the correct `resolvers` map pattern (roles-and-relations.md, conditions-and-rules.md, partial-evaluation.md, client-side-hints.md, prisma.md, drizzle.md, codegen.md) MUST remain unchanged

### Key Entities

- **ResourceResolver**: `(ref: ResourceRef) => Promise<Record<string, unknown>>` -- a per-type function that fetches attributes for a resource, including relation references as `ResourceRef` objects
- **Resolvers**: `Record<string, ResourceResolver>` -- a map of resource type names to their resolver functions, passed to the `Toride` constructor
- **Derived Roles**: Policy-level declarations that determine how actors gain roles on resources (5 patterns: global_role, from_role+on_relation, from_relation, actor_type+when, when-only)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every code snippet in the documentation compiles successfully against the actual `toride` package exports (zero type errors when copied into a TypeScript project)
- **SC-002**: No documentation file in the `docs/` directory contains the strings `getRoles`, `getRelated`, `RelationResolver`, or the old 3-method resolver pattern
- **SC-003**: The Quickstart guide shows a complete, self-contained example that a new developer can follow end-to-end without encountering undefined types or methods
- **SC-004**: The Quickstart policy demonstrates at least 3 different `derived_roles` patterns so developers understand how roles originate without `getRoles`
