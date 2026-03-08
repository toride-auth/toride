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

Key things to notice:

- **Actors** define who can perform actions, along with their attributes
- **Global roles** are derived from actor attributes (e.g., `superadmin` when `isSuperAdmin` is true)
- **Resources** define what can be acted upon, with roles, permissions, and grants
- **Derived roles** propagate roles through relations (e.g., a project `editor` is also a task `editor`)
- **Rules** add conditions that can override grants (e.g., forbid edits on completed projects)

## 3. Implement a Resolver

The resolver tells Toride how to look up roles, relations, and attributes from your data source. Create a file at `src/auth/resolver.ts`:

```typescript
import type { RelationResolver } from "toride";

// Replace these with your actual database queries
const resolver: RelationResolver = {
  async getRoles(actor, resource) {
    // Look up direct role assignments for this actor on this resource
    // Return an array of role names, e.g., ["editor"]
    const assignments = await db.roleAssignment.findMany({
      where: {
        userId: actor.id,
        resourceType: resource.type,
        resourceId: resource.id,
      },
    });
    return assignments.map((a) => a.role);
  },

  async getRelated(resource, relation) {
    // Given a resource and relation name, return the related resource
    switch (`${resource.type}.${relation}`) {
      case "Task.project": {
        const task = await db.task.findById(resource.id);
        return { type: "Project", id: task.projectId };
      }
      case "Task.assignee": {
        const task = await db.task.findById(resource.id);
        return { type: "User", id: task.assigneeId };
      }
      default:
        throw new Error(`Unknown relation: ${resource.type}.${relation}`);
    }
  },

  async getAttributes(ref) {
    // Return the attributes for an actor or resource
    // The engine uses these to evaluate conditions in rules
    const record = await db.findById(ref.type, ref.id);
    return record;
  },
};

export { resolver };
```

The three resolver methods correspond to the three types of lookups the engine needs:

| Method | Purpose | When it's called |
|--------|---------|-----------------|
| `getRoles` | Look up direct role assignments | Every permission check |
| `getRelated` | Follow a relation to another resource | When evaluating derived roles via relations |
| `getAttributes` | Fetch attributes for condition evaluation | When rules have `when` conditions |

## 4. Create the Engine

Bring the policy and resolver together to create the engine. Create `src/auth/engine.ts`:

```typescript
import { Toride, loadYaml } from "toride";
import { resolver } from "./resolver";

const engine = new Toride({
  policy: await loadYaml("./policy.yaml"),
  resolver,
});

export { engine };
```

## 5. Run Your First Permission Check

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

1. Look up Alice's direct roles on Task 42 via `getRoles`
2. Follow the `project` and `assignee` relations via `getRelated`
3. Derive additional roles from those relations
4. Check which permissions those roles grant
5. Evaluate any rules (e.g., the `forbid` rule for completed projects)
6. Return the final decision

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
- Integrate with [Prisma](/integrations/prisma) or [Drizzle](/integrations/drizzle) for database-level filtering
