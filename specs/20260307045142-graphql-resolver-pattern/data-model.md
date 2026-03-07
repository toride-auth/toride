# Data Model: GraphQL Resolver Pattern

## Entity Changes

### ResourceRef (modified)

**Current**:
```typescript
interface ResourceRef {
  readonly type: string;
  readonly id: string;
}
```

**New**:
```typescript
interface ResourceRef {
  readonly type: string;
  readonly id: string;
  readonly attributes?: Record<string, unknown>;
}
```

- `attributes` is optional. When present, provides pre-fetched resource data.
- Attribute values that are `ResourceRef`-shaped (have `type` and `id`) are treated as relation targets when the field is declared as a relation in the policy.
- Extra fields beyond `type`/`id` on a nested ResourceRef are cascading inline attributes.

### ResourceResolver (new)

```typescript
type ResourceResolver = (ref: ResourceRef) => Promise<Record<string, unknown>>;
```

- Per-type async function returning all attributes for a resource.
- Minimal signature: no field hints, no actor context.
- Called at most once per `${type}:${id}` per evaluation (cached).

### Resolvers Map (new)

```typescript
type Resolvers = Record<string, ResourceResolver>;
```

- Maps resource type names to resolver functions.
- Optional on `TorideOptions`. An engine with no resolvers works when all data is inline.

### TorideOptions (modified)

```typescript
interface TorideOptions {
  readonly policy: Policy;
  readonly resolvers?: Resolvers;         // NEW: replaces resolver
  // readonly resolver: RelationResolver; // REMOVED
  readonly maxConditionDepth?: number;
  readonly maxDerivedRoleDepth?: number;
  readonly customEvaluators?: Record<string, EvaluatorFn>;
  readonly onDecision?: (event: DecisionEvent) => void;
  readonly onQuery?: (event: QueryEvent) => void;
}
```

### RelationResolver (removed)

The entire interface is removed:
- `getRoles()` — replaced by `derived_roles` with attribute-based conditions
- `getRelated()` — replaced by ResourceRef values in attributes
- `getAttributes()` — replaced by per-type `ResourceResolver` functions

### RelationDef (modified)

**Current**:
```typescript
interface RelationDef {
  readonly resource: string;
  readonly cardinality: "one" | "many";
}
```

**New**: Simplified to a string (the target resource type name).

```typescript
// In ResourceBlock:
relations?: Record<string, string>;  // e.g., { org: "Organization" }
```

### ResolverCache (rewritten)

**Current**: Wraps `RelationResolver` with 3 cached methods (`getRoles`, `getRelated`, `getAttributes`).

**New**: Wraps `Resolvers` map with inline attribute merge logic.

```typescript
class AttributeCache {
  // Resolves attributes for a resource, merging inline + resolver results.
  // Inline attributes take precedence.
  // Cache key: `${type}:${id}`
  async resolve(ref: ResourceRef, policy: Policy): Promise<Record<string, unknown>>;

  // Resolve a specific attribute path, handling relation traversal.
  async resolvePath(
    ref: ResourceRef,
    path: string,
    resourceBlock: ResourceBlock,
    policy: Policy,
  ): Promise<unknown>;
}
```

## State Transitions

### Attribute Resolution Flow

```
ResourceRef { type, id, attributes? }
  │
  ├── Has inline attribute for field? → Use inline value
  │
  ├── Resolver registered for type?
  │   ├── Yes → Call resolver (cached), merge with inline (inline wins)
  │   └── No → Field is undefined (trivial resolver)
  │
  └── Field is a declared relation AND value is ResourceRef-shaped?
      ├── Yes → Recurse: resolve nested resource's attributes
      └── No → Treat as plain attribute value
```

### Relation Traversal Flow

```
$resource.org.plan
  │
  ├── Step 1: Resolve "org" on the resource
  │   ├── Check inline attributes for "org"
  │   ├── If missing, call resolver for resource type
  │   └── Get merged attribute value for "org"
  │
  ├── Step 2: Is "org" a declared relation?
  │   ├── Check policy: relations.org exists?
  │   └── Is attribute value ResourceRef-shaped? ({ type, id, ... })
  │
  ├── Step 3: Resolve "plan" on the related resource
  │   ├── Check inline attributes on the ResourceRef (cascading)
  │   ├── If missing, call resolver for Organization type
  │   └── Return "plan" value
  │
  └── Step 4: Validate relation values from resolvers (FR-016)
      └── If resolver returns non-ResourceRef for declared relation → throw ValidationError
```

### Validation Rules

| Context | Relation field value | Behavior |
|---------|---------------------|----------|
| Inline attributes | Valid ResourceRef (`type` + `id`) | Treated as relation target |
| Inline attributes | Non-ResourceRef (missing `type`/`id`) | Treated as plain attribute (lenient) |
| Resolver result | Valid ResourceRef (`type` + `id`) | Treated as relation target |
| Resolver result | Non-ResourceRef (missing `type`/`id`) | **Throws ValidationError** (strict, FR-016) |

## Policy Schema Changes

### Relation Declaration (schema.ts)

**Current**:
```yaml
relations:
  org:
    resource: Organization
    cardinality: one
```

**New**:
```yaml
relations:
  org: Organization
```

### Test Case (schema.ts)

The `TestCase` type needs updates:
- Remove `roles` field (no more `getRoles` mock)
- Remove `relations` field (no more `getRelated` mock)
- `attributes` field now uses the `ResourceRef`-with-attributes pattern for relation targets

**Current test mock data**:
```yaml
roles:
  "Document:doc1": [editor]
relations:
  "Document:doc1":
    org: { type: Organization, id: org1 }
attributes:
  "Organization:org1":
    plan: enterprise
```

**New test mock data**:
```yaml
resolvers:
  "Document:doc1":
    org: { type: Organization, id: org1 }
  "Organization:org1":
    plan: enterprise
```
