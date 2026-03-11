# Data Model: Default Resolver Formalization

## Overview

No new data entities are introduced. This feature formalizes existing runtime behavior through documentation and tests.

## Existing Entities (reference)

### ResourceRef

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| type | `string` | Yes | Resource type name (matches policy resource block key) |
| id | `string` | Yes | Unique identifier for the resource instance |
| attributes | `Record<string, unknown>` | No | Pre-fetched inline attributes. Takes precedence over resolver results. |

**Key behavior**: When `attributes` is provided and no resolver is registered, `attributes` serves as the complete attribute source (default resolver).

### AttributeCache Resolution Strategy

```
resolve(ref) →
  1. ref has attributes AND resolver exists  → merge(resolver_result, inline)  [inline wins]
  2. ref has attributes, no resolver         → inline only                     [default resolver]
  3. no attributes, resolver exists          → resolver result only
  4. no attributes, no resolver              → empty object {}                 [trivial resolver]
```

### ResourceResolver

```typescript
type ResourceResolver = (ref: ResourceRef) => Promise<Record<string, unknown>>
```

**No changes** to the resolver signature. The `ref` parameter already contains `attributes`, which serves the role of GraphQL's `parent` parameter.

## State Transitions

N/A — no state machines in this feature.

## Validation Rules

- Existing: Resolver results for relation fields must be valid `ResourceRef` objects (FR-016, `ValidationError`)
- No new validation rules introduced
