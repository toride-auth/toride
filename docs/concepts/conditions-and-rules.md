# Conditions & Rules

Conditions and rules add attribute-based access control (ABAC) on top of Toride's role-based model. While [grants](/concepts/policy-format#grants) provide static role-to-permission mappings, rules let you conditionally permit or forbid actions based on resource attributes, actor attributes, and environment context.

## Rules Overview

Rules are declared in the `rules` array of a resource block. Each rule has an **effect** (`permit` or `forbid`), a list of **permissions** it applies to, and a **when** condition:

```yaml
resources:
  Document:
    roles: [viewer, editor, admin]
    permissions: [read, update, delete, publish]

    grants:
      viewer: [read]
      editor: [read, update]
      admin: [all]

    rules:
      - effect: forbid
        permissions: [update, delete]
        when:
          $resource.archived: true

      - effect: permit
        roles: [viewer]
        permissions: [update]
        when:
          $resource.isPublic: true
```

### Rule Fields

| Field | Required | Description |
|-------|----------|-------------|
| `effect` | Yes | `permit` or `forbid` |
| `permissions` | Yes | Array of permission names this rule applies to |
| `roles` | No | If specified, the rule only applies when the actor has one of these roles |
| `when` | Yes | Condition expression that must be satisfied for the rule to take effect |

### Evaluation Order

Rules are evaluated in this order during a permission check:

1. Resolve all [roles](/concepts/roles-and-relations) (direct + derived)
2. Expand grants to determine statically granted permissions
3. Check if the requested action is granted
4. Evaluate all rules whose `permissions` list includes the requested action
5. Apply the **forbid-wins** principle

### The Forbid-Wins Principle

When multiple rules match for the same action:

- A **forbid** rule always takes precedence over a **permit** rule or static grant
- If any forbid rule's condition matches, the action is denied regardless of permits
- A **permit** rule can grant access that is not in the static grants (conditional elevation)

```yaml
    rules:
      # Even admins cannot delete archived documents
      - effect: forbid
        permissions: [delete]
        when:
          $resource.archived: true

      # Viewers can update public documents (not in their static grants)
      - effect: permit
        roles: [viewer]
        permissions: [update]
        when:
          $resource.isPublic: true
```

### Role-Scoped Rules

The optional `roles` field restricts which actors the rule applies to:

```yaml
    rules:
      # Only editors are affected by this restriction
      - effect: forbid
        roles: [editor]
        permissions: [delete]
        when:
          $resource.status: draft
```

If `roles` is omitted, the rule applies to all actors who have **any** role on the resource. If the actor does not have any of the listed roles, the rule is skipped entirely.

## Condition Expressions

The `when` block contains a condition expression. In its simplest form, it is a set of key-value pairs that are all ANDed together:

```yaml
    when:
      $resource.status: active
      $actor.department: engineering
```

This means: "the resource's `status` must be `active` **AND** the actor's `department` must be `engineering`."

### Reference Paths

Condition keys are reference paths that resolve to values at evaluation time:

| Prefix | Resolves to | Example |
|--------|-------------|---------|
| `$actor.` | Actor attribute | `$actor.department` |
| `$resource.` | Resource attribute | `$resource.status` |
| `$env.` | Environment context | `$env.currentTime` |

#### Actor References

Access the actor's attributes as declared in the [actors section](/concepts/policy-format#actors):

```yaml
    when:
      $actor.department: engineering
      $actor.isSuperAdmin: true
```

#### Resource References

Access the current resource's attributes, resolved through your resolver:

```yaml
    when:
      $resource.status: active
      $resource.priority: { gte: 3 }
```

#### Nested Resource References

Reference attributes on related resources by traversing relations:

```yaml
    when:
      $resource.project.status: active
```

This resolves the `project` relation on the current resource, then accesses the `status` attribute on the related Project. Nested traversal depth is configurable via `maxConditionDepth` (default: 3).

#### Environment References

Access runtime context passed via `CheckOptions`:

```yaml
    when:
      $env.currentTime: { gte: $resource.publishDate }
```

```typescript
const allowed = await engine.can(actor, "read", resource, {
  env: { currentTime: Date.now() },
});
```

Environment values follow **strict null semantics**: if a referenced `$env` value is not provided, the condition evaluates to `false` (fail-closed).

### Cross-References

The right-hand side of a condition can reference another path instead of a literal value:

```yaml
    when:
      $actor.department: $resource.ownerDepartment
```

This compares the actor's `department` attribute with the resource's `ownerDepartment` attribute at runtime. Any combination of `$actor`, `$resource`, and `$env` references is valid on either side.

## Operators

For comparisons beyond simple equality, use operator objects:

```yaml
    when:
      $resource.priority: { gte: 3 }
      $resource.name: { startsWith: "draft-" }
```

### Available Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `eq` | Equal (explicit form) | `{ eq: "active" }` |
| `neq` | Not equal | `{ neq: "archived" }` |
| `gt` | Greater than | `{ gt: 5 }` |
| `gte` | Greater than or equal | `{ gte: 3 }` |
| `lt` | Less than | `{ lt: 10 }` |
| `lte` | Less than or equal | `{ lte: 100 }` |
| `in` | Value is in array | `{ in: ["active", "review"] }` |
| `includes` | Array contains value | `{ includes: "admin" }` |
| `exists` | Field exists (not null/undefined) | `{ exists: true }` |
| `startsWith` | String starts with | `{ startsWith: "proj-" }` |
| `endsWith` | String ends with | `{ endsWith: ".md" }` |
| `contains` | String contains substring | `{ contains: "draft" }` |
| `custom` | Custom evaluator function | `{ custom: "isBusinessHours" }` |

### Equality Shorthand

A bare value is shorthand for the `eq` operator. These are equivalent:

```yaml
# Shorthand
$resource.status: active

# Explicit
$resource.status: { eq: active }
```

### The `in` Operator

Checks if a value is contained in an array:

```yaml
    when:
      $resource.status: { in: ["active", "review", "approved"] }
```

The `in` operator also supports cross-references as the array source:

```yaml
    when:
      $actor.department: { in: $resource.allowedDepartments }
```

### The `includes` Operator

The inverse of `in` -- checks if an array field contains a value:

```yaml
    when:
      $resource.tags: { includes: "featured" }
```

### The `exists` Operator

Checks whether a field is present and non-null:

```yaml
    when:
      $resource.deletedAt: { exists: false }  # Only non-deleted resources
      $resource.assigneeId: { exists: true }   # Must have an assignee
```

### Custom Evaluators

For logic that cannot be expressed declaratively, use the `custom` operator to delegate to a TypeScript function:

```yaml
    rules:
      - effect: permit
        permissions: [publish]
        when:
          $resource.status: { custom: "isBusinessHours" }
```

Register the evaluator when creating the engine:

```typescript
const engine = new Toride({
  policy,
  resolvers,
  customEvaluators: {
    isBusinessHours: async (actor, resource, env) => {
      const hour = new Date().getHours();
      return hour >= 9 && hour < 17;
    },
  },
});
```

Custom evaluators follow fail-closed semantics:

- In a `permit` rule: errors cause the rule to **not match** (access not granted)
- In a `forbid` rule: errors cause the rule to **match** (access denied)

## Logical Combinators

For complex conditions that go beyond simple AND, use `any` (OR) and `all` (AND) combinators:

### The `any` Combinator (OR)

At least one sub-condition must be true:

```yaml
    rules:
      - effect: permit
        permissions: [read]
        when:
          any:
            - $resource.isPublic: true
            - $actor.department: $resource.ownerDepartment
```

### The `all` Combinator (AND)

All sub-conditions must be true (equivalent to a flat condition, but useful inside `any`):

```yaml
    rules:
      - effect: forbid
        permissions: [update, delete]
        when:
          any:
            - $resource.archived: true
            - all:
                - $resource.status: review
                - $actor.role: { neq: "lead" }
```

### Nesting

Combinators can be nested to express complex logic:

```yaml
    when:
      any:
        - $actor.isSuperAdmin: true
        - all:
            - $actor.department: $resource.department
            - $resource.status: { in: ["draft", "active"] }
        - all:
            - $resource.isPublic: true
            - $resource.publishDate: { exists: true }
```

Nesting depth is limited (default: 10 levels) to prevent denial-of-service through deeply nested expressions. Beyond the limit, the condition evaluates to `false` (fail-closed).

## Strict Null Semantics

Toride follows strict null semantics for all condition evaluation:

- If the **left-hand side** (reference path) resolves to `undefined` or `null`, the condition is `false`
- If the **right-hand side** resolves to `undefined` or `null`, the condition is `false`
- Missing attributes never match anything, including each other

This ensures a fail-closed security model: missing data never accidentally grants access.

```yaml
    # If $resource.deletedAt is undefined, this condition is false (forbid does NOT match)
    # Use the exists operator to explicitly check for missing fields
    rules:
      - effect: forbid
        permissions: [read]
        when:
          $resource.deletedAt: { exists: true }
```

## Cardinality: Many and ANY Semantics

When a condition references a `many` relation, Toride applies **ANY semantics**: the condition is true if **any** item in the array satisfies it.

```yaml
resources:
  Project:
    relations:
      members: { resource: User, cardinality: many }
    rules:
      - effect: permit
        permissions: [read]
        when:
          $resource.members.department: engineering
```

If the Project has three members and at least one has `department: "engineering"`, the condition matches.

## Complete Example

Here is a resource with several rules demonstrating different condition patterns:

```yaml
resources:
  Document:
    roles: [viewer, editor, admin]
    permissions: [read, update, delete, publish, archive]

    relations:
      project: { resource: Project, cardinality: one }
      author: { resource: User, cardinality: one }

    grants:
      viewer: [read]
      editor: [read, update]
      admin: [all]

    derived_roles:
      - role: editor
        from_relation: author
      - role: viewer
        from_role: viewer
        on_relation: project

    rules:
      # Nobody can modify archived documents
      - effect: forbid
        permissions: [update, delete, publish]
        when:
          $resource.archived: true

      # Viewers can update public documents
      - effect: permit
        roles: [viewer]
        permissions: [update]
        when:
          $resource.isPublic: true

      # Only allow publishing during business hours
      - effect: forbid
        permissions: [publish]
        when:
          $resource.status: { custom: "isOutsideBusinessHours" }

      # Editors can archive if the document belongs to their department
      - effect: permit
        roles: [editor]
        permissions: [archive]
        when:
          $actor.department: $resource.project.department
```

```typescript
import { Toride, loadYaml } from "toride";

const engine = new Toride({
  policy: await loadYaml("./policy.yaml"),
  resolvers: {
    Document: async (ref) => {
      const doc = await db.document.findById(ref.id);
      return {
        archived: doc.archived,
        isPublic: doc.isPublic,
        status: doc.status,
        project: { type: "Project", id: doc.projectId },
        author: { type: "User", id: doc.authorId },
      };
    },
    Project: async (ref) => {
      const project = await db.project.findById(ref.id);
      return { department: project.department };
    },
  },
  customEvaluators: {
    isOutsideBusinessHours: async () => {
      const hour = new Date().getHours();
      return hour < 9 || hour >= 17;
    },
  },
});

const actor = {
  type: "User",
  id: "alice",
  attributes: { department: "engineering" },
};

// Check with environment context
const allowed = await engine.can(
  actor,
  "publish",
  { type: "Document", id: "doc-1" },
);
```

## What's Next

- [Policy Format](/concepts/policy-format) -- see the full YAML structure reference
- [Roles & Relations](/concepts/roles-and-relations) -- understand role derivation patterns
- [Partial Evaluation](/concepts/partial-evaluation) -- translate conditions into data-layer queries
- [Client-Side Hints](/concepts/client-side-hints) -- send permission snapshots to the frontend
