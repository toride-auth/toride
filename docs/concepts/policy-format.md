---
description: Complete YAML policy reference — actors, global_roles, resources, roles, permissions, grants, relations, derived_roles, rules, and policy composition with mergePolicies().
---

# Policy Format

Toride policies are written in YAML (or JSON) and serve as the **single source of truth** for your entire authorization model. A single policy file declares who your actors are, what resources they can access, how roles map to permissions, and under what conditions access should be granted or denied -- no imperative code required. Every authorization decision the engine makes traces back to what is declared in this file.

## Top-Level Structure

Every policy has four top-level sections:

```yaml
version: "1"

actors:
  # Who can perform actions

global_roles:
  # Roles derived from actor attributes (optional)

resources:
  # What can be acted upon
```

| Section | Required | Description |
|---------|----------|-------------|
| `version` | Yes | Policy format version. Currently `"1"`. |
| `actors` | Yes | Actor type declarations with attribute schemas. |
| `global_roles` | No | Roles derived purely from actor attributes, not tied to any resource. |
| `resources` | Yes | Resource blocks defining roles, permissions, grants, relations, and rules. |

## Actors

The `actors` section declares the types of entities that perform actions in your system. Each actor type specifies the attributes it carries, along with their types.

```yaml
actors:
  User:
    attributes:
      email: string
      department: string
      isSuperAdmin: boolean

  ServiceAccount:
    attributes:
      service: string
      scope: string
```

Attribute types can be `string`, `number`, or `boolean`. These declarations are used for validation: if a [condition or rule](/concepts/conditions-and-rules) references `$actor.department`, Toride validates at load time that the actor type actually declares a `department` attribute.

When making authorization checks, you provide the actor as a typed reference:

```typescript
const actor = {
  type: "User",
  id: "alice",
  attributes: {
    email: "alice@example.com",
    department: "engineering",
    isSuperAdmin: false,
  },
};
```

## Global Roles

Global roles are derived from actor attributes rather than being assigned on a specific resource. They are evaluated by matching the actor type and testing `when` conditions against the actor's attributes.

```yaml
global_roles:
  superadmin:
    actor_type: User
    when:
      $actor.isSuperAdmin: true

  service_reader:
    actor_type: ServiceAccount
    when:
      $actor.scope: read
```

Global roles are not directly usable in grants. Instead, resources reference them via [derived roles](/concepts/roles-and-relations#global-role-derivation) to map them to local roles:

```yaml
resources:
  Project:
    roles: [viewer, editor, admin]
    # ...
    derived_roles:
      - role: admin
        from_global_role: superadmin
```

## Resources

Resources are the core of a policy. Each resource block declares its roles, permissions, how roles map to permissions (grants), relations to other resources, derived roles, and conditional rules.

### Roles and Permissions

Every resource declares the roles that can be assigned to it and the permissions (actions) that can be checked against it:

```yaml
resources:
  Project:
    roles: [viewer, editor, admin]
    permissions: [read, update, delete, create_task]
```

Roles are labels assigned to actors on specific resource instances. Permissions are the actions that can be checked with `can()`.

### Grants

Grants map roles to permissions. Use `all` to grant every declared permission:

```yaml
    grants:
      viewer: [read]
      editor: [read, update, create_task]
      admin: [all]
```

The `all` keyword resolves dynamically at check time to all declared permissions on the resource. If you later add a new permission, `all` automatically includes it.

### Relations

Relations define typed connections between resources, enabling cross-resource role derivation:

```yaml
  Task:
    roles: [viewer, editor]
    permissions: [read, update, delete]

    relations:
      project: { resource: Project, cardinality: one }
      assignee: { resource: User, cardinality: one }
      watchers: { resource: User, cardinality: many }
```

Each relation specifies the target resource type and cardinality (`one` or `many`). Relations are used in two ways:

1. **Derived roles** -- propagate roles from a parent resource (see [Roles & Relations](/concepts/roles-and-relations))
2. **Conditions** -- reference related resource attributes in rules (see [Conditions & Rules](/concepts/conditions-and-rules))

### Derived Roles

Derived roles let actors gain roles on a resource automatically, without explicit assignment. There are five derivation patterns:

```yaml
    derived_roles:
      # 1. From a global role
      - role: admin
        from_global_role: superadmin

      # 2. From a role on a related resource
      - role: editor
        from_role: editor
        on_relation: project

      # 3. From a relation identity (actor IS the related entity)
      - role: editor
        from_relation: assignee

      # 4. From actor attributes with type restriction
      - role: viewer
        actor_type: User
        when:
          $actor.department: engineering

      # 5. From conditions only
      - role: viewer
        when:
          $actor.department: engineering
```

See [Roles & Relations](/concepts/roles-and-relations) for a detailed explanation of each pattern.

### Rules

Rules add conditional logic on top of grants. They can `permit` or `forbid` actions based on resource, actor, or environment attributes:

```yaml
    rules:
      - effect: forbid
        permissions: [update, delete]
        when:
          resource.archived: true

      - effect: permit
        roles: [viewer]
        permissions: [update]
        when:
          resource.isPublic: true
```

Rules are only evaluated for actors who have at least one role on the resource. A `forbid` rule always overrides a `permit` rule or grant. See [Conditions & Rules](/concepts/conditions-and-rules) for the full condition expression syntax.

## Complete Example

Here is a complete policy showing all the major features working together:

```yaml
version: "1"

actors:
  User:
    attributes:
      email: string
      department: string
      isSuperAdmin: boolean

global_roles:
  superadmin:
    actor_type: User
    when:
      $actor.isSuperAdmin: true

resources:
  Organization:
    roles: [member, admin]
    permissions: [read, update, manage_members]

    grants:
      member: [read]
      admin: [all]

    derived_roles:
      - role: admin
        from_global_role: superadmin

  Project:
    roles: [viewer, editor, admin]
    permissions: [read, update, delete, create_task]

    relations:
      org: { resource: Organization, cardinality: one }

    grants:
      viewer: [read]
      editor: [read, update, create_task]
      admin: [all]

    derived_roles:
      - role: admin
        from_role: admin
        on_relation: org

  Task:
    roles: [viewer, editor]
    permissions: [read, update, delete]

    relations:
      project: { resource: Project, cardinality: one }
      assignee: { resource: User, cardinality: one }

    grants:
      viewer: [read]
      editor: [read, update, delete]

    derived_roles:
      - role: editor
        from_role: editor
        on_relation: project
      - role: viewer
        from_role: viewer
        on_relation: project
      - role: editor
        from_relation: assignee

    rules:
      - effect: forbid
        permissions: [update, delete]
        when:
          resource.project.status: completed
```

## Loading a Policy

Use `loadYaml()` or `loadJson()` to parse and validate a policy file:

```typescript
import { Toride, loadYaml } from "toride";

const policy = await loadYaml("./policy.yaml");
const engine = new Toride({ policy });
```

Policy validation happens automatically at load time. If the policy contains errors -- such as referencing an undeclared role in grants or using an invalid operator in a condition -- a `ValidationError` is thrown with a message indicating the path to the offending node:

```
ValidationError: resources.Task.grants references undeclared role "edtor"
```

## Policy Composition

You can split policies across multiple files and merge them at load time with `mergePolicies()`:

```typescript
import { loadYaml, mergePolicies } from "toride";

const base = await loadYaml("./base-policy.yaml");
const extension = await loadYaml("./team-policy.yaml");

const combined = mergePolicies(base, extension);
```

Merging is additive: resources from both policies are combined. If both policies define the same resource, grants are merged and rules are appended. Conflicting grants (same role, different permissions) are detected and reported.

## What's Next

- [Roles & Relations](/concepts/roles-and-relations) -- understand the five role derivation patterns
- [Conditions & Rules](/concepts/conditions-and-rules) -- learn the full condition expression syntax
- [Partial Evaluation](/concepts/partial-evaluation) -- push authorization into data-layer queries
