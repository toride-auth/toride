---
description: Step-by-step walkthrough — define a YAML policy, create resolvers, run permission checks with can(), batch checks, permittedActions(), and explain().
---

# Quickstart

This guide walks you through your first authorization check with Toride — from defining a policy to running a permission check — in under 5 minutes.

## 1. Install Toride

```bash
pnpm add toride
```

## 2. Define a Policy

Create a `policy.yaml` file in your project root. This policy defines a `Project` resource with three roles and their permissions, plus a `Task` resource that inherits roles from its parent project:

```yaml
# policy.yaml
version: "1"

actors:
  User:
    attributes:
      id: string
      email: string
      department: string
      isSuperAdmin: boolean

global_roles:
  superadmin:
    actor_type: User
    when:
      $actor.isSuperAdmin: true

resources:
  Project:
    roles: [viewer, editor, admin]
    permissions: [read, update, delete, create_task]

    grants:
      viewer: [read]
      editor: [read, update, create_task]
      admin: [all]

    derived_roles:
      - role: admin
        from_global_role: superadmin

      - role: editor
        actor_type: User
        when:
          $actor.department: $resource.department

  Task:
    roles: [viewer, editor]
    permissions: [read, update, delete]

    relations:
      project: Project
      assignee: User

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

Key things to notice:

- **Actors** define who can perform actions, along with their attributes
- **Global roles** are derived from actor attributes (e.g., `superadmin` when `isSuperAdmin` is true)
- **Resources** define what can be acted upon, with roles, permissions, and grants
- **Derived roles** propagate roles through relations (e.g., a project `editor` is also a task `editor`)
- **Rules** add conditions that can override grants (e.g., forbid edits on completed projects)

## 3. Create the Engine with Resolvers

Bring the policy and resolvers together to create the engine. Each resolver is a function that returns attributes for a resource instance — including relation references as `{ type, id }` objects. Create `src/auth/engine.ts`:

```typescript
import { Toride, loadYaml } from "toride";

// In-memory data — no database needed
const projects: Record<string, any> = {
  "proj-1": { status: "active", department: "engineering" },
};

const tasks: Record<string, any> = {
  "task-42": {
    projectId: "proj-1",
    assigneeId: "alice",
    status: "open",
  },
};

const engine = new Toride({
  policy: await loadYaml("./policy.yaml"),
  resolvers: {
    Task: async (ref) => {
      const task = tasks[ref.id];
      return {
        project: { type: "Project", id: task.projectId },
        assignee: { type: "User", id: task.assigneeId },
        status: task.status,
      };
    },
    Project: async (ref) => {
      const project = projects[ref.id];
      return {
        status: project.status,
        department: project.department,
      };
    },
  },
});

export { engine };
```

Each resolver is a function that returns attributes for a resource instance. Relation fields contain `ResourceRef` objects (`{ type, id }`) that the engine follows when traversing relations. Your resolvers can fetch data from any source — here we use plain objects, but you could use a REST API, GraphQL endpoint, file system, or database.

## 4. Run Your First Permission Check

Now you can check permissions anywhere in your application:

```typescript
import { engine } from "./auth/engine";

// Define the actor (the user making the request)
const actor = {
  type: "User",
  id: "alice",
  attributes: {
    email: "alice@example.com",
    department: "engineering",
    isSuperAdmin: false,
  },
};

// Check if alice can update task 42
const allowed = await engine.can(actor, "update", {
  type: "Task",
  id: "42",
});

console.log(allowed); // true or false
```

The engine will:

1. Evaluate all `derived_roles` entries on Task 42 (e.g., `from_role` on project, `from_relation` assignee)
2. For relation-based derivation, resolve Task attributes via the `Task` resolver
3. Follow relations to related resources (Project, User) and check roles there recursively
4. Combine all derived roles into a deduplicated set
5. Expand grants for the combined role set
6. Evaluate any rules (e.g., the `forbid` rule for completed projects)
7. Return the final decision

## 5. Real-World: Database Resolvers

In production, your resolvers will typically query a database. The resolver interface is the same — only the data source changes:

```typescript
// When your data source is a database, resolvers look like this:
const engine = new Toride({
  policy: await loadYaml("./policy.yaml"),
  resolvers: {
    Task: async (ref) => {
      const task = await db.task.findById(ref.id);
      return {
        project: { type: "Project", id: task.projectId },
        assignee: { type: "User", id: task.assigneeId },
        status: task.status,
      };
    },
    Project: async (ref) => {
      const project = await db.project.findById(ref.id);
      return {
        status: project.status,
        department: project.department,
      };
    },
  },
});
```

For type-safe resolvers generated from your policy, see [Codegen](/integrations/codegen). For query-level filtering with an ORM, see [Prisma](/integrations/prisma) or [Drizzle](/integrations/drizzle) integration.

## 6. Explore More Features

Once your basic authorization check is working, explore these features:

### Batch Checks

Check multiple permissions in a single call with shared caching:

```typescript
const results = await engine.canBatch(actor, [
  { action: "read", resource: { type: "Task", id: "1" } },
  { action: "update", resource: { type: "Task", id: "2" } },
  { action: "delete", resource: { type: "Task", id: "3" } },
]);
// results: [true, true, false]
```

### List Permitted Actions

Find out which actions an actor can perform on a resource:

```typescript
const actions = await engine.permittedActions(actor, {
  type: "Task",
  id: "42",
});
// ["read", "update", "delete"]
```

### Debug with Explain

Understand why a permission check returned a particular result:

```typescript
const decision = await engine.explain(actor, "delete", {
  type: "Task",
  id: "42",
});
console.log(decision);
// {
//   allowed: true,
//   resolvedRoles: {
//     direct: [],
//     derived: [{ role: "editor", via: "from_role editor on_relation project" }]
//   },
//   grantedPermissions: ["read", "update", "delete"],
//   matchedRules: [],
//   finalDecision: "ALLOWED: editor grants delete"
// }
```

## What's Next?

- Learn about [Policy Format](/concepts/policy-format) to write more advanced policies
- Understand [Roles & Relations](/concepts/roles-and-relations) for complex role derivation
- Set up [Partial Evaluation](/concepts/partial-evaluation) for data filtering
- Integrate with [Prisma](/integrations/prisma) or [Drizzle](/integrations/drizzle) for query-level filtering
