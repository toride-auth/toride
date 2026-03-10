# Partial Evaluation

Partial evaluation lets you translate authorization rules into query constraints, so you can push authorization **into the data layer** instead of loading all records and checking permissions one by one. When your data source is a database, this means generating WHERE clauses that filter at the query level. This is how Toride supports "show me all projects I can read" queries efficiently.

## The Problem

A naive approach to list-level authorization loads all records and filters in application code:

```typescript
// Slow: loads every project, then checks each one
const allProjects = await db.project.findMany();
const visible = [];
for (const project of allProjects) {
  if (await engine.can(actor, "read", { type: "Project", id: project.id })) {
    visible.push(project);
  }
}
```

This does not scale. If you have 10,000 projects, you make 10,000 authorization checks.

## The Solution: `buildConstraints()`

`buildConstraints()` evaluates the actor's roles and rules **partially** -- without a specific resource instance -- and produces a **constraint AST** that describes which resources the actor can access. You then translate this AST into a database WHERE clause.

```typescript
const result = await engine.buildConstraints(actor, "read", "Project");
```

The result is one of three outcomes:

| Result | Meaning | Action |
|--------|---------|--------|
| `{ unrestricted: true }` | Actor can access **all** resources of this type | No WHERE clause needed |
| `{ forbidden: true }` | Actor cannot access **any** resources of this type | Return empty result |
| `{ constraints: Constraint }` | Actor can access resources matching the constraint | Translate to WHERE clause |

### Handling the Result

```typescript
const result = await engine.buildConstraints(actor, "read", "Project");

if ("forbidden" in result) {
  // Actor has no access at all
  return [];
}

if ("unrestricted" in result) {
  // Actor can see everything
  return await db.project.findMany();
}

// Translate constraints to a database query
const where = engine.translateConstraints(result.constraints, adapter);
return await db.project.findMany({ where });
```

## The Constraint AST

When the result contains `constraints`, it is a tree of constraint nodes. Each node describes a condition that resources must satisfy:

### Leaf Nodes

| Type | Description | Example |
|------|-------------|---------|
| `field_eq` | Field equals value | `{ type: "field_eq", field: "status", value: "active" }` |
| `field_neq` | Field not equal | `{ type: "field_neq", field: "status", value: "archived" }` |
| `field_gt` | Greater than | `{ type: "field_gt", field: "priority", value: 3 }` |
| `field_gte` | Greater than or equal | `{ type: "field_gte", field: "priority", value: 3 }` |
| `field_lt` | Less than | `{ type: "field_lt", field: "count", value: 100 }` |
| `field_lte` | Less than or equal | `{ type: "field_lte", field: "count", value: 100 }` |
| `field_in` | Value in array | `{ type: "field_in", field: "status", values: ["active", "review"] }` |
| `field_exists` | Field exists | `{ type: "field_exists", field: "assigneeId", exists: true }` |
| `field_includes` | Array includes value | `{ type: "field_includes", field: "tags", value: "featured" }` |
| `field_contains` | String contains | `{ type: "field_contains", field: "name", value: "draft" }` |

### Composite Nodes

| Type | Description |
|------|-------------|
| `and` | All children must be true |
| `or` | At least one child must be true |
| `not` | Child must be false |
| `relation` | Constraint on a related resource |
| `has_role` | Actor has a role on the resource (requires join to role assignments) |
| `always` | Always true (unrestricted access via this path) |
| `never` | Always false (no access via this path) |

### How Constraints Are Built

The engine walks through all derivation paths for the given actor, action, and resource type:

1. Evaluate which roles the actor could hold (inlining known actor/env values)
2. Check which of those roles grant the requested action
3. For each granting path, emit constraints that describe the conditions
4. Combine all paths with OR (access via any path is sufficient)
5. Apply forbid rules as NOT constraints
6. Simplify the tree (remove redundant nodes, collapse single-child AND/OR)

Actor attributes and environment values are **inlined** during partial evaluation. For example, if a derived role requires `$actor.department: "engineering"` and the actor's department is `"engineering"`, the condition is resolved to `true` and does not appear in the constraint output. Only `$resource` conditions remain in the AST.

## Constraint Adapters

A **constraint adapter** translates the constraint AST into your data store's query format. Toride provides adapters for Prisma and Drizzle, or you can write your own.

### The Adapter Interface

```typescript
interface ConstraintAdapter<TQuery> {
  translate(constraint: LeafConstraint): TQuery;
  relation(field: string, resourceType: string, childQuery: TQuery): TQuery;
  hasRole(actorId: string, actorType: string, role: string): TQuery;
  unknown(name: string): TQuery;
  and(queries: TQuery[]): TQuery;
  or(queries: TQuery[]): TQuery;
  not(query: TQuery): TQuery;
}
```

| Method | Called for | Purpose |
|--------|-----------|---------|
| `translate` | Leaf constraint nodes | Convert field comparisons to query syntax |
| `relation` | Relation constraints | Build a join or nested query for related resources |
| `hasRole` | has_role constraints | Build a subquery against the role assignments table |
| `unknown` | Unknown constraint nodes | Handle custom evaluators that cannot be translated |
| `and` | AND nodes | Combine queries with AND |
| `or` | OR nodes | Combine queries with OR |
| `not` | NOT nodes | Negate a query |

### Using `translateConstraints()`

Once you have an adapter, pass it to `translateConstraints()`:

```typescript
import { createPrismaAdapter } from "@toride/prisma";

const adapter = createPrismaAdapter();

const result = await engine.buildConstraints(actor, "read", "Project");

if ("constraints" in result) {
  const where = engine.translateConstraints(result.constraints, adapter);
  const projects = await prisma.project.findMany({ where });
}
```

### Using with Prisma

The `@toride/prisma` package provides a ready-to-use adapter:

```typescript
import { Toride, loadYaml } from "toride";
import { createPrismaAdapter } from "@toride/prisma";

const engine = new Toride({
  policy: await loadYaml("./policy.yaml"),
  resolvers: { /* ... */ },
});

const adapter = createPrismaAdapter({
  relationMapping: {
    project: "project",        // Maps constraint field to Prisma relation
    org: "organization",       // Rename if Prisma relation differs
  },
});

const actor = {
  type: "User",
  id: "alice",
  attributes: { department: "engineering" },
};

const result = await engine.buildConstraints(actor, "read", "Project");

if ("forbidden" in result) {
  return [];
}

if ("unrestricted" in result) {
  return await prisma.project.findMany();
}

const where = engine.translateConstraints(result.constraints, adapter);
const projects = await prisma.project.findMany({ where });
// Prisma generates SQL with the authorization constraints baked in
```

See the [Prisma integration guide](/integrations/prisma) for full details.

### Using with Drizzle

The `@toride/drizzle` package provides an equivalent adapter for Drizzle ORM:

```typescript
import { createDrizzleAdapter } from "@toride/drizzle";
import { projects } from "./schema";

const adapter = createDrizzleAdapter(projects, {
  relations: {
    org: { table: organizations, foreignKey: "orgId" },
  },
});

const result = await engine.buildConstraints(actor, "read", "Project");

if ("constraints" in result) {
  const where = engine.translateConstraints(result.constraints, adapter);
  // Use the where clause with Drizzle's query builder
}
```

See the [Drizzle integration guide](/integrations/drizzle) for full details.

### Writing a Custom Adapter

For other databases or ORMs, implement the `ConstraintAdapter` interface:

```typescript
import type { ConstraintAdapter, LeafConstraint } from "toride";

type MongoQuery = Record<string, unknown>;

const mongoAdapter: ConstraintAdapter<MongoQuery> = {
  translate(constraint: LeafConstraint): MongoQuery {
    switch (constraint.type) {
      case "field_eq":
        return { [constraint.field]: constraint.value };
      case "field_neq":
        return { [constraint.field]: { $ne: constraint.value } };
      case "field_gt":
        return { [constraint.field]: { $gt: constraint.value } };
      case "field_in":
        return { [constraint.field]: { $in: constraint.values } };
      // ... handle other constraint types
      default:
        return {};
    }
  },

  relation(field, _resourceType, childQuery) {
    // MongoDB uses dot notation for nested documents
    return Object.fromEntries(
      Object.entries(childQuery).map(([k, v]) => [`${field}.${k}`, v]),
    );
  },

  hasRole(actorId, _actorType, role) {
    return {
      roleAssignments: {
        $elemMatch: { userId: actorId, role },
      },
    };
  },

  unknown(_name) {
    return {}; // Ignore unknown constraints
  },

  and(queries) {
    return { $and: queries };
  },

  or(queries) {
    return { $or: queries };
  },

  not(query) {
    return { $not: query };
  },
};
```

## Environment Context

You can pass environment values to `buildConstraints()` just like `can()`:

```typescript
const result = await engine.buildConstraints(actor, "read", "Project", {
  env: { currentTime: Date.now() },
});
```

Environment values are inlined during partial evaluation, so `$env.currentTime` is replaced with the actual value in the constraint output.

## Complete Example

Here is an end-to-end example combining policy, engine setup, and data filtering:

```yaml
# policy.yaml
version: "1"

actors:
  User:
    attributes:
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
    permissions: [read, update, delete]

    relations:
      org: { resource: Organization, cardinality: one }

    grants:
      viewer: [read]
      editor: [read, update]
      admin: [all]

    derived_roles:
      - role: admin
        from_global_role: superadmin
      - role: viewer
        when:
          $resource.isPublic: true
      - role: viewer
        actor_type: User
        when:
          $actor.department: $resource.department

    rules:
      - effect: forbid
        permissions: [read, update, delete]
        when:
          $resource.archived: true
```

```typescript
import { Toride, loadYaml } from "toride";
import { createPrismaAdapter } from "@toride/prisma";

const engine = new Toride({
  policy: await loadYaml("./policy.yaml"),
  resolvers: {
    Project: async (ref) => {
      const project = await prisma.project.findUnique({
        where: { id: ref.id },
      });
      return project ?? {};
    },
  },
});

const adapter = createPrismaAdapter();

async function listProjects(actor) {
  const result = await engine.buildConstraints(actor, "read", "Project");

  if ("forbidden" in result) {
    return [];
  }

  if ("unrestricted" in result) {
    return await prisma.project.findMany();
  }

  const where = engine.translateConstraints(result.constraints, adapter);
  return await prisma.project.findMany({ where });
}

// A regular user sees projects in their department + public projects (minus archived)
const alice = {
  type: "User",
  id: "alice",
  attributes: { department: "engineering", isSuperAdmin: false },
};
const aliceProjects = await listProjects(alice);

// A superadmin sees all non-archived projects
const admin = {
  type: "User",
  id: "admin",
  attributes: { department: "ops", isSuperAdmin: true },
};
const adminProjects = await listProjects(admin);
```

## What's Next

- [Conditions & Rules](/concepts/conditions-and-rules) -- understand the condition syntax that drives constraints
- [Roles & Relations](/concepts/roles-and-relations) -- see how derivation patterns generate constraint paths
- [Client-Side Hints](/concepts/client-side-hints) -- send permission snapshots to the frontend
- [Prisma Integration](/integrations/prisma) -- full Prisma adapter documentation
- [Drizzle Integration](/integrations/drizzle) -- full Drizzle adapter documentation
