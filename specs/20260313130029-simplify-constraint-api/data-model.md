# Data Model: Simplify Constraint API & Deep Attribute Type Safety

## Entity Changes

### AttributeSchema (new — replaces flat `AttributeType`)

A recursive discriminated union representing the type of an attribute declaration in a policy.

| Variant | Fields | Description |
|---------|--------|-------------|
| `primitive` | `kind: "primitive"`, `type: "string" \| "number" \| "boolean"` | Flat scalar attribute (backward compatible with existing `AttributeType`) |
| `object` | `kind: "object"`, `fields: Record<string, AttributeSchema>` | Nested object with named fields |
| `array` | `kind: "array"`, `items: AttributeSchema` | Array of a given item type (primitive, object, or nested array) |

**Constraints**:
- Maximum nesting depth: 3 levels (e.g., `object > object > object > primitive` is allowed; 4th level rejected)
- Field names follow the same safe-identifier rules as existing attribute names

**Relationships**:
- Used in `ResourceBlock.attributes` (replaces `Record<string, AttributeType>`)
- Used in `ActorDeclaration.attributes` (replaces `Record<string, AttributeType>`)
- Consumed by `@toride/codegen` to generate TypeScript types
- Consumed by policy validator for dot-path validation

### ConstraintResult (modified)

Changes from a three-way discriminated union to a two-way `ok`-based result.

| Variant | Fields | Description |
|---------|--------|-------------|
| Success | `ok: true`, `constraint: Constraint \| null` | Access granted. `null` = unrestricted, `Constraint` = conditional. |
| Forbidden | `ok: false` | Access denied. No constraint possible. |

**Removed fields**: `unrestricted`, `forbidden`, `constraints` (old property names), `__resource` phantom type field.

**Note**: The resource type `R` phantom is now carried via the generic parameter on the `ok: true` variant's `constraint` field (the `Constraint` type itself doesn't need a phantom — the `ConstraintResult<R>` wrapper carries it).

### ForbiddenError (new)

A custom error class for callers who want to throw on `ok: false`.

| Field | Type | Description |
|-------|------|-------------|
| `name` | `"ForbiddenError"` | Error name |
| `message` | `string` | Human-readable message |
| `actor` | `ActorRef` | The actor that was denied |
| `action` | `string` | The action that was denied |
| `resourceType` | `string` | The resource type that was denied |

### ResourceResolver (modified)

Return type changes from `Promise<Record<string, unknown>>` to `Promise<Partial<S['resourceAttributeMap'][R]>>`.

No new fields. Only the TypeScript generic signature changes.

## Validation Rules

### Attribute Nesting Depth
- Depth 1: `status: string` (primitive at root level)
- Depth 2: `address: { city: string }` (object > primitive)
- Depth 3: `org: { address: { city: string } }` (object > object > primitive)
- Depth 4+: **Rejected** with validation error

### Dot-Path Validation
- `$resource.status` → valid if `status` exists as any `AttributeSchema` kind
- `$resource.address.city` → valid if `address` is `kind: 'object'` and `city` exists in `fields`
- `$resource.tags.0` → **rejected** (array item traversal not supported)
- `$resource.members.role` → **rejected** (`members` is `kind: 'array'`, path stops)
- `$env.anything` → **exempt** (no schema validation)

### YAML Shorthand Rules
- `string[]` → `{ kind: 'array', items: { kind: 'primitive', type: 'string' } }`
- `number[]` → `{ kind: 'array', items: { kind: 'primitive', type: 'number' } }`
- `boolean[]` → `{ kind: 'array', items: { kind: 'primitive', type: 'boolean' } }`
- Object with `type: "array"` + `items` → array declaration
- Object without `type: "array"` + `items` → nested object (even if it has a `type` key)
