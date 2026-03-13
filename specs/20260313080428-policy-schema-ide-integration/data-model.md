# Data Model: Policy JSON Schema & IDE Integration

This feature does not introduce new persistent entities or database models. The primary artifact is a **generated JSON Schema file** derived from existing valibot schemas.

## Entities

### Generated Artifact: `policy.schema.json`

**Source of truth**: `packages/toride/src/policy/schema.ts` (valibot `PolicySchema`)
**Output location**: `packages/toride/schema/policy.schema.json`
**Format**: JSON Schema Draft 2020-12

**Top-level structure**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | `const: "1"` | Yes | Policy format version |
| `actors` | `object (additionalProperties: ActorDeclaration)` | Yes | Actor type declarations |
| `resources` | `object (additionalProperties: ResourceBlock)` | Yes | Resource type definitions |
| `global_roles` | `object (additionalProperties: GlobalRole)` | No | Global role mappings |
| `tests` | `array of TestCase` | No | Inline declarative test cases |

### Sub-schemas (mapped to `$defs`)

| Definition | Source Valibot Schema | Key Properties |
|---|---|---|
| `ActorDeclaration` | `ActorDeclarationSchema` | `attributes: Record<string, "string"\|"number"\|"boolean">` |
| `ResourceBlock` | `ResourceBlockSchema` | `roles`, `permissions` (required); `attributes`, `relations`, `grants`, `derived_roles`, `rules`, `field_access` (optional) |
| `ConditionExpression` | `ConditionExpressionSchema` | Recursive: simple conditions \| `{any: [...]}` \| `{all: [...]}` |
| `ConditionOperator` | `ConditionOperatorSchema` | Union of `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `includes`, `exists`, `startsWith`, `endsWith`, `contains`, `custom` |
| `DerivedRoleEntry` | `DerivedRoleEntrySchema` | `role` (required); `from_global_role`, `from_role`, `on_relation`, `from_relation`, `actor_type`, `when` (optional) |
| `Rule` | `RuleSchema` | `effect: "permit"\|"forbid"`, `permissions` (required); `roles`, `when` |
| `FieldAccessDef` | `FieldAccessDefSchema` | `read`, `update` (optional arrays of strings) |
| `GlobalRole` | `GlobalRoleSchema` | `actor_type`, `when` (both required) |
| `TestCase` | `TestCaseSchema` | `name`, `actor`, `action`, `resource`, `expected` (required); `resolvers` (optional) |
| `ActorRef` | `ActorRefSchema` | `type`, `id`, `attributes` (all required) |
| `ResourceRef` | `ResourceRefSchema` | `type`, `id` (required); `attributes` (optional) |

### Relationships

```
PolicySchema (top-level)
├── actors → Record<string, ActorDeclaration>
├── resources → Record<string, ResourceBlock>
│   ├── derived_roles → DerivedRoleEntry[]
│   │   └── when → ConditionExpression (recursive)
│   ├── rules → Rule[]
│   │   └── when → ConditionExpression (recursive)
│   └── field_access → Record<string, FieldAccessDef>
├── global_roles → Record<string, GlobalRole>
│   └── when → ConditionExpression (recursive)
└── tests → TestCase[]
    ├── actor → ActorRef
    └── resource → ResourceRef
```

## Validation Rules

All validation rules are inherited from the existing valibot schemas — the JSON Schema is a 1:1 structural mapping:

- `version` must be exactly `"1"` (literal)
- `effect` must be `"permit"` or `"forbid"` (enum)
- Attribute types must be `"string"`, `"number"`, or `"boolean"` (enum)
- `expected` in tests must be `"allow"` or `"deny"` (enum)
- `ConditionExpression` is recursive via `$ref`

## State Transitions

N/A — no stateful entities.
