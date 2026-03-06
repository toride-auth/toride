# Data Model: Toride Authorization Engine

**Phase 1 Output** | **Date**: 2026-03-06

## Core Types (Runtime)

### ActorRef

Represents an entity performing actions.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| type | string | Yes | Actor type name (e.g., "User", "ServiceAccount") |
| id | string | Yes | Actor identifier (all IDs are strings) |
| attributes | Record<string, unknown> | Yes | Actor attributes for condition evaluation |

### ResourceRef

Represents a protected entity being accessed.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| type | string | Yes | Resource type name (e.g., "Task", "Project") |
| id | string | Yes | Resource identifier |

### CheckOptions

Optional per-check configuration.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| env | Record<string, unknown> | No | Environment context bag (`$env` references) |

### BatchCheckItem

A single item in a `canBatch()` call.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| action | string | Yes | Permission to check |
| resource | ResourceRef | Yes | Target resource |

---

## Policy Model (Parsed from YAML/JSON)

### Policy (top-level)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| version | "1" | Yes | Policy format version |
| actors | Record<string, ActorDeclaration> | Yes | Actor type declarations |
| global_roles | Record<string, GlobalRole> | No | Global role definitions |
| resources | Record<string, ResourceBlock> | Yes | Resource block definitions |
| tests | TestCase[] | No | Inline declarative tests |

### ActorDeclaration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| attributes | Record<string, AttributeType> | Yes | Attribute name → type mapping |

**AttributeType**: `"string" | "number" | "boolean"` (for validation of `$actor.x` references)

### GlobalRole

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| actor_type | string | Yes | Which actor type this global role applies to |
| when | ConditionExpression | Yes | Conditions on `$actor` attributes |

### ResourceBlock

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| roles | string[] | Yes | Declared role names for this resource |
| permissions | string[] | Yes | Declared permission names for this resource |
| relations | Record<string, RelationDef> | No | Named relations to other resources |
| grants | Record<string, string[]> | No | Role → permissions mapping (`"all"` allowed) |
| derived_roles | DerivedRoleEntry[] | No | Role derivation rules |
| rules | Rule[] | No | Conditional permit/forbid rules |
| field_access | Record<string, FieldAccessDef> | No | Field-level access control |

### RelationDef

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| resource | string | Yes | Target resource type name |
| cardinality | "one" \| "many" | Yes | Relation cardinality |

### DerivedRoleEntry

Five derivation patterns — all share `role` as the target local role:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| role | string | Yes | Local role to derive |
| from_global_role | string | Pattern 1 | Global role name |
| from_role | string | Pattern 2 | Remote role name (paired with `on_relation`) |
| on_relation | string | Pattern 2 | Relation to traverse |
| from_relation | string | Pattern 3 | Relation for identity check |
| actor_type | string | Pattern 4/5 | Restrict to specific actor type |
| when | ConditionExpression | Pattern 4/5 | Conditions on `$actor`/`$resource` |

**Validation rules**:
- Exactly one derivation pattern per entry (mutual exclusivity of from_global_role, from_role+on_relation, from_relation, when-only)
- `from_role` requires `on_relation` (and vice versa)
- `role` must be declared in the resource's `roles`
- `on_relation` must reference a declared relation
- `from_global_role` must reference a declared global role
- `actor_type` must reference a declared actor type

### Rule

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| effect | "permit" \| "forbid" | Yes | Rule effect |
| roles | string[] | No | Restrict to specific roles (omit = all roles) |
| permissions | string[] | Yes | Permissions this rule affects |
| when | ConditionExpression | Yes | Conditions for rule activation |

**Validation rules**:
- `permissions` entries must be declared in resource's `permissions`
- `roles` entries (if present) must be declared in resource's `roles`
- Rules only evaluated for actors with at least one role on the resource

### FieldAccessDef

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| read | string[] | No | Roles that can read this field |
| update | string[] | No | Roles that can update this field |

**Validation rules**:
- Role names must be declared in the resource's `roles`
- Fields not listed are unrestricted (any role with resource-level permission can access)

---

## Condition Expressions

### ConditionExpression

A recursive type representing condition logic:

```
ConditionExpression =
  | SimpleConditions          -- Record<string, ConditionValue> (all ANDed)
  | { any: ConditionExpression[] }   -- OR combinator
  | { all: ConditionExpression[] }   -- AND combinator
```

### ConditionValue

The right-hand side of a condition:

```
ConditionValue =
  | primitive                 -- equality shorthand (string, number, boolean)
  | "$actor.field"            -- cross-reference to actor attribute
  | "$resource.field"         -- cross-reference to resource attribute
  | "$env.field"              -- cross-reference to environment value
  | { eq: value }             -- explicit equality
  | { neq: value }            -- negation
  | { gt: value }             -- greater than
  | { gte: value }            -- greater than or equal
  | { lt: value }             -- less than
  | { lte: value }            -- less than or equal
  | { in: value[] | "$actor.field" }  -- set membership
  | { includes: value }       -- array contains
  | { exists: boolean }       -- existence check
  | { startsWith: string }    -- string prefix
  | { endsWith: string }      -- string suffix
  | { contains: string }      -- string contains
  | { custom: string }        -- custom evaluator name
```

**Left-hand property paths**:
- `resource.field` → resource attribute access
- `resource.relation.field` → nested access via relation resolution
- `$actor.field` → actor attribute access
- `$env.field` → environment value access

**Depth limit**: Nested property access limited by `maxConditionDepth` (default: 3)

---

## Constraint AST (Public Stable API)

### Constraint (discriminated union)

| Type | Fields | Description |
|------|--------|-------------|
| field_eq | field, value | Field equals value |
| field_neq | field, value | Field not equals value |
| field_gt | field, value | Field greater than |
| field_gte | field, value | Field greater than or equal |
| field_lt | field, value | Field less than |
| field_lte | field, value | Field less than or equal |
| field_in | field, values | Field in set |
| field_nin | field, values | Field not in set |
| field_exists | field, exists | Field exists/not exists |
| field_includes | field, value | Array field includes value |
| field_contains | field, value | String field contains substring |
| relation | field, resourceType, constraint | FK relation with nested constraint |
| has_role | actorId, actorType, role | Actor has role on resource (for JOINs) |
| unknown | name | Custom evaluator (adapter decides) |
| and | children | Logical AND |
| or | children | Logical OR |
| not | child | Logical NOT |
| always | — | Unconditionally true (internal) |
| never | — | Unconditionally false (internal) |

### ConstraintResult

| Variant | Fields | Description |
|---------|--------|-------------|
| unrestricted | unrestricted: true | Actor can access ALL resources of this type |
| forbidden | forbidden: true | Actor cannot access ANY resources of this type |
| constrained | constraints: Constraint | Resources matching this constraint are accessible |

### LeafConstraint

Subset of `Constraint` for `ConstraintAdapter.translate()`:
`field_eq | field_neq | field_gt | field_gte | field_lt | field_lte | field_in | field_nin | field_exists | field_includes | field_contains`

---

## Evaluation Result Types

### ExplainResult

| Field | Type | Description |
|-------|------|-------------|
| allowed | boolean | Final authorization decision |
| resolvedRoles | ResolvedRolesDetail | Direct and derived roles with paths |
| grantedPermissions | string[] | Permissions granted by resolved roles |
| matchedRules | MatchedRule[] | Rules that were evaluated |
| finalDecision | string | Human-readable decision summary |

### ResolvedRolesDetail

| Field | Type | Description |
|-------|------|-------------|
| direct | string[] | Directly assigned roles |
| derived | DerivedRoleTrace[] | Derived roles with derivation path |

### DerivedRoleTrace

| Field | Type | Description |
|-------|------|-------------|
| role | string | The derived role name |
| via | string | Human-readable derivation path |

### MatchedRule

| Field | Type | Description |
|-------|------|-------------|
| effect | "permit" \| "forbid" | Rule effect |
| matched | boolean | Whether conditions were satisfied |
| rule | Rule | The original rule definition |
| resolvedValues | Record<string, unknown> | Condition values that were resolved |

---

## Declarative Test Model

### TestCase

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Test description |
| actor | ActorRef | Yes | Actor for the check |
| roles | Record<string, string[]> | No | Mock: `"Type:id"` → role list |
| relations | Record<string, Record<string, ResourceRef \| ResourceRef[]>> | No | Mock: `"Type:id"` → relation map |
| attributes | Record<string, Record<string, unknown>> | No | Mock: `"Type:id"` → attributes |
| action | string | Yes | Permission to check |
| resource | ResourceRef | Yes | Target resource |
| expected | "allow" \| "deny" | Yes | Expected outcome |

### TestFile (separate .test.yaml)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| policy | string | Yes | Path to policy file |
| tests | TestCase[] | Yes | Test cases |

---

## State Transitions

### Policy Lifecycle

```
[YAML/JSON file] → parse() → [raw object] → validate() → [Policy]
                                                              ↓
                                            new Toride({ policy }) → [Engine (active)]
                                                              ↓
                                            setPolicy(newPolicy) → [Engine (new policy, atomic swap)]
                                                              ↓
                                            mergePolicies(a, b) → [Merged Policy]
```

### Authorization Check Flow

```
can(actor, action, resource) → [create cache] → [resolve roles (exhaustive)]
                                                      ↓
                              [check grants] → [evaluate rules (permit/forbid)]
                                                      ↓
                              [apply forbid-wins precedence] → [return boolean]
                                                      ↓
                              [fire onDecision callback (async, non-blocking)]
```

### Partial Evaluation Flow

```
buildConstraints(actor, action, resourceType) → [evaluate all derivation paths]
                                                      ↓
                              [for each path: emit constraints (field_eq, has_role, relation)]
                                                      ↓
                              [combine with OR] → [apply forbid rules as NOT]
                                                      ↓
                              [simplify (always/never elimination)]
                                                      ↓
                              [wrap in ConstraintResult] → [return]
```

---

## Interfaces

### RelationResolver (user-provided)

| Method | Signature | Description |
|--------|-----------|-------------|
| getRoles | (actor: ActorRef, resource: ResourceRef) → Promise<string[]> | Direct role assignments |
| getRelated | (resource: ResourceRef, relationName: string) → Promise<ResourceRef \| ResourceRef[]> | Resolve named relation |
| getAttributes | (ref: ResourceRef) → Promise<Record<string, unknown>> | Fetch resource attributes |

### ConstraintAdapter<TQuery> (user-provided for partial eval)

| Method | Signature | Description |
|--------|-----------|-------------|
| translate | (constraint: LeafConstraint) → TQuery | Translate leaf constraint |
| relation | (field: string, resourceType: string, childQuery: TQuery) → TQuery | Handle relation JOIN |
| hasRole | (actorId: string, actorType: string, role: string) → TQuery | Handle role check |
| unknown | (name: string) → TQuery | Handle custom evaluator |
| and | (queries: TQuery[]) → TQuery | Logical AND |
| or | (queries: TQuery[]) → TQuery | Logical OR |
| not | (query: TQuery) → TQuery | Logical NOT |

### TorideOptions (engine construction)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| policy | Policy | Yes | Validated policy object |
| resolver | RelationResolver | Yes | User-provided data bridge |
| maxConditionDepth | number | No | Default: 3 |
| maxDerivedRoleDepth | number | No | Default: 5 |
| customEvaluators | Record<string, EvaluatorFn> | No | Custom evaluator functions |
| onDecision | (event: DecisionEvent) → void | No | Audit callback for checks |
| onQuery | (event: QueryEvent) → void | No | Audit callback for constraints |
