# Data Model: Sync Documentation with Implementation

## Overview

This is a documentation-only change. No data model changes are required. The following describes the existing API types that documentation must accurately reference.

## Key Types (existing, no changes)

### ResourceResolver

```typescript
type ResourceResolver = (ref: ResourceRef) => Promise<Record<string, unknown>>;
```

A per-type function that fetches attributes for a resource. Returns a flat object where:
- Plain fields (e.g., `status: "active"`) are attribute values used in conditions
- Relation fields (e.g., `project: { type: "Project", id: "123" }`) are `ResourceRef` objects used for relation traversal
- Many-cardinality relations return arrays of `ResourceRef` objects

### Resolvers

```typescript
type Resolvers = Record<string, ResourceResolver>;
```

A map of resource type names to their resolver functions. Passed to the `Toride` constructor via `TorideOptions.resolvers`.

### TorideOptions (resolver-relevant fields)

```typescript
interface TorideOptions {
  readonly policy: Policy;
  readonly resolvers?: Resolvers;  // Optional — works without resolvers if data is inline
  // ... other options
}
```

## Removed Types (documentation must NOT reference)

- `RelationResolver` — never existed as an export; was a spec-era concept with `getRoles`, `getRelated`, `getAttributes`
- `getRoles(actor, resource)` — removed per FR-008; direct roles are always empty
- `getRelated(resource, relation)` — never implemented as a standalone method; relations are resolved via resource attributes
- `getAttributes(ref)` — replaced by the `ResourceResolver` function itself
