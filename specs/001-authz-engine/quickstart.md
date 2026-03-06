# Quickstart: Toride Authorization Engine

**Phase 1 Output** | **Date**: 2026-03-06

## Installation

```bash
pnpm add toride
```

For Prisma or Drizzle data filtering:

```bash
pnpm add @toride/prisma   # Prisma adapter
pnpm add @toride/drizzle  # Drizzle adapter
```

For typed resolver generation from policy files:

```bash
pnpm add -D @toride/codegen
```

## 1. Define a Policy (YAML)

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
      admin:  [all]

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

## 2. Implement a Resolver

```typescript
import type { RelationResolver } from "toride";
import { prisma } from "./db";

const resolver: RelationResolver = {
  async getRoles(actor, resource) {
    const assignments = await prisma.roleAssignment.findMany({
      where: {
        userId: actor.id,
        resourceType: resource.type,
        resourceId: resource.id,
      },
      select: { role: true },
    });
    return assignments.map((a) => a.role);
  },

  async getRelated(resource, relation) {
    switch (`${resource.type}.${relation}`) {
      case "Task.project": {
        const task = await prisma.task.findUniqueOrThrow({
          where: { id: resource.id },
          select: { projectId: true },
        });
        return { type: "Project", id: task.projectId };
      }
      case "Task.assignee": {
        const task = await prisma.task.findUniqueOrThrow({
          where: { id: resource.id },
          select: { assigneeId: true },
        });
        return { type: "User", id: task.assigneeId };
      }
      default:
        throw new Error(`Unknown relation: ${resource.type}.${relation}`);
    }
  },

  async getAttributes(ref) {
    const model = ref.type.charAt(0).toLowerCase() + ref.type.slice(1);
    return await (prisma as any)[model].findUniqueOrThrow({
      where: { id: ref.id },
    });
  },
};
```

## 3. Create the Engine

```typescript
import { Toride, loadYaml } from "toride";

const engine = new Toride({
  policy: await loadYaml("./policy.yaml"),
  resolver,
});
```

## 4. Check Permissions

```typescript
const actor = {
  type: "User",
  id: "alice",
  attributes: { department: "engineering", isSuperAdmin: false },
};

// Basic check
const canUpdate = await engine.can(actor, "update", { type: "Task", id: "42" });

// Batch check (shared cache — efficient)
const results = await engine.canBatch(actor, [
  { action: "read", resource: { type: "Task", id: "1" } },
  { action: "update", resource: { type: "Task", id: "2" } },
]);

// List permitted actions
const actions = await engine.permittedActions(actor, { type: "Task", id: "42" });
// → ["read", "update", "delete"]
```

## 5. Debug with Explain

```typescript
const decision = await engine.explain(actor, "delete", { type: "Task", id: "42" });
console.log(decision);
// {
//   allowed: true,
//   resolvedRoles: {
//     direct: [],
//     derived: [{ role: "editor", via: "from_role editor on_relation project (Project:7)" }]
//   },
//   grantedPermissions: ["read", "update", "delete"],
//   matchedRules: [],
//   finalDecision: "ALLOWED: editor grants delete"
// }
```

## 6. Data Filtering (Partial Evaluation)

```typescript
import { createPrismaAdapter } from "@toride/prisma";

const adapter = createPrismaAdapter();
const result = await engine.buildConstraints(actor, "read", "Task");

if (result.unrestricted) {
  return prisma.task.findMany(); // superadmin: no filter needed
}
if (result.forbidden) {
  return []; // no access
}

const where = engine.translateConstraints(result.constraints, adapter);
const tasks = await prisma.task.findMany({ where });
```

## 7. Client-Side Permission Hints

```typescript
// Server: build snapshot
const snapshot = await engine.snapshot(actor, [
  { type: "Task", id: "42" },
  { type: "Task", id: "43" },
]);
// Send snapshot to client via API response

// Client:
import { TorideClient } from "toride/client";

const client = new TorideClient(snapshot);
client.can("update", { type: "Task", id: "42" }); // true (sync, 0ms)
client.can("read", { type: "Task", id: "99" });   // false (unknown → safe default)
```

## 8. Validate and Test Policies

```bash
# Validate policy
npx toride validate ./policy.yaml

# Validate with static analysis warnings
npx toride validate --strict ./policy.yaml

# Run declarative tests
npx toride test ./policy.yaml
```
