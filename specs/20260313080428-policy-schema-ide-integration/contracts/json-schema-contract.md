# Contract: Generated JSON Schema

## Artifact

**File**: `packages/toride/schema/policy.schema.json`
**Published at**: `node_modules/toride/schema/policy.schema.json`
**Format**: JSON Schema Draft 2020-12
**Consumer**: YAML language servers (Red Hat YAML extension, etc.)

## Schema Envelope

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://toride-auth.github.io/toride/schema/policy.schema.json",
  "title": "Toride Policy",
  "description": "Schema for toride authorization policy files (YAML or JSON)",
  "type": "object",
  "required": ["version", "actors", "resources"],
  "properties": {
    "version": { "const": "1", "description": "Policy format version" },
    "actors": { ... },
    "resources": { ... },
    "global_roles": { ... },
    "tests": { ... }
  },
  "additionalProperties": false,
  "$defs": {
    "ConditionExpression": { ... },
    ...
  }
}
```

## Stability Guarantee

- The schema file path (`schema/policy.schema.json`) is a **public API surface** per Constitution Principle IV.
- The schema `$id` URL is stable and should not change without a major version bump.
- Schema content evolves automatically with the valibot source — this is by design, not drift.

## Integration Points

### Per-file comment (recommended for users)
```yaml
# yaml-language-server: $schema=node_modules/toride/schema/policy.schema.json
version: "1"
...
```

### VS Code workspace settings
```json
{
  "yaml.schemas": {
    "./node_modules/toride/schema/policy.schema.json": ["*.policy.yaml", "*.policy.yml"]
  }
}
```

## Validation Coverage

The JSON Schema validates **structural** correctness only:
- Required/optional fields
- Value types (string, number, boolean, enum, const)
- Allowed keys (`additionalProperties: false` on typed objects)
- Recursive condition expressions

It does **not** validate:
- Cross-references (e.g., role name used in grants must be declared in roles)
- Semantic rules (e.g., mutual exclusivity of derived role fields)
- Custom evaluator existence

Cross-reference validation requires the CLI: `toride validate --strict`.
