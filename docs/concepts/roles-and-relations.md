---
description: The five role derivation patterns — global role, role on related resource, relation identity, actor type with condition, and condition only — plus cycle detection and depth limits.
---

# Roles & Relations

Toride uses a declarative role model where all roles are **derived** from policy rules rather than directly assigned via a runtime lookup. All five derivation patterns -- global roles, related-resource roles, relation identity, actor-type conditions, and condition-only rules -- are declared entirely in YAML, making the policy file the single source of truth for how actors gain roles. This page explains how roles work, how relations connect resources, and how each pattern lets actors gain roles automatically.

## How Roles Work

Every resource in a [policy](/concepts/policy-format) declares a list of roles that can be held on it:

```yaml
resources:
  Project:
    roles: [viewer, editor, admin]
    permissions: [read, update, delete, create_task]
```

Roles are labels that map to permissions through **grants**. An actor who holds the `editor` role on a specific Project instance gets the permissions listed in the grant:

```yaml
    grants:
      viewer: [read]
      editor: [read, update, create_task]
      admin: [all]
```

The `all` keyword dynamically expands to every declared permission on the resource.

## Relations

Relations define typed connections between resources. They are how Toride models hierarchies and ownership:

```yaml
resources:
  Task:
    roles: [viewer, editor]
    permissions: [read, update, delete]

    relations:
      project: { resource: Project, cardinality: one }
      assignee: { resource: User, cardinality: one }
      watchers: { resource: User, cardinality: many }
```

Each relation specifies:

| Field | Description |
|-------|-------------|
| `resource` | The target resource type |
| `cardinality` | `one` (single reference) or `many` (array of references) |

Relations serve two purposes:

1. **Derived roles** -- propagate roles from a parent resource to a child
2. **Conditions** -- reference related resource attributes in [rules](/concepts/conditions-and-rules)

### Resolving Relations

At runtime, the engine resolves relations through your **resolver** -- a plain function that returns attributes from any data source. When Toride needs to follow a relation, it calls your resolver to fetch the related resource reference:

```typescript
// In-memory data — no database required
const tasks = {
  "task-42": {
    projectId: "proj-1",
    assigneeId: "alice",
    watcherIds: ["bob", "carol"],
    status: "active",
  },
};

const projects = {
  "proj-1": { orgId: "org-1", status: "active" },
};

const engine = new Toride({
  policy: await loadYaml("./policy.yaml"),
  resolvers: {
    Task: async (ref) => {
      const task = tasks[ref.id];
      return {
        project: { type: "Project", id: task.projectId },
        assignee: { type: "User", id: task.assigneeId },
        watchers: task.watcherIds.map((id) => ({ type: "User", id })),
        status: task.status,
      };
    },
    Project: async (ref) => {
      const project = projects[ref.id];
      return {
        org: { type: "Organization", id: project.orgId },
        status: project.status,
      };
    },
  },
});
```

Resolvers return a flat object where relation fields contain `ResourceRef` objects (with `type` and `id`). For `many` relations, return an array of `ResourceRef` objects. Non-relation fields (like `status`) are plain attribute values used in [conditions](/concepts/conditions-and-rules). Because resolvers are just functions, they work with any data source -- in-memory objects, REST APIs, databases, or anything else that can return the expected shape.

## The Five Derivation Patterns

Toride supports five ways for an actor to gain a role on a resource. Each is declared in the `derived_roles` array of a resource block.

### 1. Global Role Derivation

Maps a [global role](/concepts/policy-format#global-roles) to a local resource role. Global roles are derived purely from actor attributes.

```yaml
global_roles:
  superadmin:
    actor_type: User
    when:
      $actor.isSuperAdmin: true

resources:
  Project:
    roles: [viewer, editor, admin]
    # ...
    derived_roles:
      - role: admin
        from_global_role: superadmin
```

**How it works**: If the actor is a `User` and `isSuperAdmin` is `true`, the global role `superadmin` matches. The derived role entry then grants the `admin` role on the `Project`.

```typescript
const actor = {
  type: "User",
  id: "alice",
  attributes: { isSuperAdmin: true },
};

// Alice gets admin role on every Project via the superadmin global role
const allowed = await engine.can(actor, "delete", {
  type: "Project",
  id: "proj-1",
});
// true (admin grants "all" permissions)
```

### 2. Role on a Related Resource

Propagates a role from a related resource. If the actor has a role on the parent, they automatically get a role on the child.

```yaml
resources:
  Task:
    roles: [viewer, editor]
    # ...
    relations:
      project: { resource: Project, cardinality: one }

    derived_roles:
      - role: editor
        from_role: editor
        on_relation: project
```

**How it works**: Toride follows the `project` relation from the Task to the Project, resolves the actor's roles on that Project, and if the actor has `editor` there, grants `editor` on the Task.

```typescript
// Alice is an editor on Project "proj-1"
// Task "task-42" belongs to Project "proj-1"
const allowed = await engine.can(actor, "update", {
  type: "Task",
  id: "task-42",
});
// true (editor on project -> editor on task -> update permission)
```

This pattern supports **multi-level chains**. If the Project itself derives roles from an Organization, and the Task derives from the Project, roles cascade through the chain:

```yaml
resources:
  Organization:
    roles: [member, admin]
    # ...

  Project:
    roles: [viewer, editor, admin]
    relations:
      org: { resource: Organization, cardinality: one }
    derived_roles:
      - role: admin
        from_role: admin
        on_relation: org

  Task:
    roles: [viewer, editor]
    relations:
      project: { resource: Project, cardinality: one }
    derived_roles:
      - role: editor
        from_role: admin
        on_relation: project
```

An Organization `admin` becomes a Project `admin` (via org relation), and a Project `admin` becomes a Task `editor` (via project relation).

### 3. Relation Identity

Grants a role when the actor **is** the related entity. This is how you model ownership and assignment.

```yaml
resources:
  Task:
    roles: [viewer, editor]
    relations:
      assignee: { resource: User, cardinality: one }
    derived_roles:
      - role: editor
        from_relation: assignee
```

**How it works**: Toride resolves the `assignee` relation on the Task. If the assignee's `type` and `id` match the actor's `type` and `id`, the actor gets the `editor` role.

```typescript
// Task "task-42" has assignee { type: "User", id: "alice" }
const actor = { type: "User", id: "alice", attributes: {} };

const allowed = await engine.can(actor, "update", {
  type: "Task",
  id: "task-42",
});
// true (alice IS the assignee -> editor role -> update permission)
```

This also works with `many` relations. If any item in the array matches the actor, the role is granted:

```yaml
    relations:
      watchers: { resource: User, cardinality: many }
    derived_roles:
      - role: viewer
        from_relation: watchers
```

### 4. Actor Type with Condition

Grants a role based on the actor's type and attribute values. This is useful for broad access rules tied to actor properties.

```yaml
resources:
  Document:
    roles: [viewer, editor]
    derived_roles:
      - role: viewer
        actor_type: User
        when:
          $actor.department: engineering
```

**How it works**: If the actor's type is `User` **and** `department` equals `engineering`, the actor gets the `viewer` role on every `Document`. The `actor_type` check is evaluated eagerly -- if the type does not match, the condition is never evaluated.

```typescript
const actor = {
  type: "User",
  id: "bob",
  attributes: { department: "engineering" },
};

const allowed = await engine.can(actor, "read", {
  type: "Document",
  id: "doc-1",
});
// true (User in engineering -> viewer -> read permission)
```

The `when` block supports the full [condition expression syntax](/concepts/conditions-and-rules), including references to `$resource` attributes:

```yaml
    derived_roles:
      - role: editor
        actor_type: User
        when:
          $actor.department: $resource.ownerDepartment
```

### 5. Condition Only

Grants a role based solely on conditions, without restricting by actor type. Any actor that satisfies the condition gets the role.

```yaml
resources:
  Report:
    roles: [viewer]
    derived_roles:
      - role: viewer
        when:
          $resource.isPublic: true
```

**How it works**: If the resource's `isPublic` attribute is `true`, every actor gets the `viewer` role. This is useful for public access patterns.

```typescript
// Report "report-1" has isPublic: true
const allowed = await engine.can(actor, "read", {
  type: "Report",
  id: "report-1",
});
// true (isPublic -> viewer -> read permission)
```

You can combine multiple conditions:

```yaml
    derived_roles:
      - role: viewer
        when:
          $resource.visibility: public
          $env.featureFlag: true
```

All conditions in a `when` block are ANDed together. For OR logic, use the `any` combinator described in [Conditions & Rules](/concepts/conditions-and-rules#logical-combinators).

## Role Resolution Order

When Toride evaluates a permission check, it resolves roles in this order:

1. Evaluate all `derived_roles` entries for the resource
2. Combine all matched roles into a deduplicated set
3. Expand grants for the combined role set
4. Check if the requested action is in the granted permissions
5. Evaluate [rules](/concepts/conditions-and-rules) (permit/forbid) on top of grants

You can inspect the resolved roles programmatically:

```typescript
const roles = await engine.resolvedRoles(actor, {
  type: "Task",
  id: "task-42",
});
// ["editor", "viewer"]
```

## Cycle Detection and Depth Limits

Relation-based derivation (pattern 2) can create chains: a Task derives from a Project, which derives from an Organization. Toride protects against infinite loops and excessive depth:

- **Cycle detection**: If the same resource (identified by `Type:id`) is visited twice in a derivation chain, a `CycleError` is thrown.
- **Depth limit**: Configurable via `maxDerivedRoleDepth` (default: 5). If exceeded, a `DepthLimitError` is thrown.

```typescript
const engine = new Toride({
  policy,
  resolvers,
  maxDerivedRoleDepth: 10, // Allow deeper chains
});
```

Both errors are fail-closed: if the engine cannot resolve a derivation path, the role is not granted.

## What's Next

- [Policy Format](/concepts/policy-format) -- see how roles fit into the full policy structure
- [Conditions & Rules](/concepts/conditions-and-rules) -- add conditional logic on top of role-based grants
- [Partial Evaluation](/concepts/partial-evaluation) -- push authorization into data-layer queries
