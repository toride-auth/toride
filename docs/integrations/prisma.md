# Prisma Integration

`@toride/prisma` provides a constraint adapter and resolver helper for [Prisma ORM](https://www.prisma.io/). It translates Toride's constraint AST into Prisma `where` clause objects, so you can push authorization logic down to the database.

## Installation

::: code-group

```bash [pnpm]
pnpm add @toride/prisma toride
```

```bash [npm]
npm install @toride/prisma toride
```

```bash [yarn]
yarn add @toride/prisma toride
```

:::

`@toride/prisma` has no direct dependency on `@prisma/client`. It produces plain JavaScript objects that match Prisma's WHERE clause structure, so it works with any Prisma version.

## Quick Start

### 1. Create the Adapter

```typescript
import { createPrismaAdapter } from "@toride/prisma";

const adapter = createPrismaAdapter();
```

### 2. Build Constraints and Query

```typescript
import { Toride, loadYaml } from "toride";
import { createPrismaAdapter } from "@toride/prisma";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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

const actor = {
  type: "User",
  id: "alice",
  attributes: { department: "engineering" },
};

const result = await engine.buildConstraints(actor, "read", "Project");

if ("forbidden" in result) {
  // Actor has no access at all
  return [];
}

if ("unrestricted" in result) {
  // Actor can see everything
  return await prisma.project.findMany();
}

// Translate constraints into a Prisma WHERE clause
const where = engine.translateConstraints(result.constraints, adapter);
const projects = await prisma.project.findMany({ where });
```

The `where` object is a plain JavaScript object that Prisma understands natively. For example, a constraint like "status equals active AND archived is false" becomes:

```typescript
{
  AND: [
    { status: "active" },
    { NOT: { archived: true } }
  ]
}
```

## Adapter Options

### Relation Mapping

If your constraint field names differ from your Prisma relation names, provide a `relationMapping`:

```typescript
const adapter = createPrismaAdapter({
  relationMapping: {
    org: "organization", // constraint field "org" → Prisma relation "organization"
    project: "project",  // same name — optional, but explicit
  },
});
```

When the constraint AST contains a `relation` node for the field `org`, the adapter produces `{ organization: childQuery }` instead of `{ org: childQuery }`.

### Custom Role Assignment Table

By default, the adapter generates `hasRole` constraints using a table named `roleAssignments` with `userId` and `role` fields. You can customize this:

```typescript
const adapter = createPrismaAdapter({
  roleAssignmentTable: "memberships",
  roleAssignmentFields: {
    userId: "memberId",
    role: "memberRole",
  },
});
```

This produces WHERE clauses like:

```typescript
{
  memberships: {
    some: {
      memberId: "user-123",
      memberRole: "editor",
    },
  },
}
```

## Constraint Translation Reference

The adapter translates each constraint type into the corresponding Prisma WHERE syntax:

| Constraint Type | Prisma Output |
|----------------|---------------|
| `field_eq` | `{ field: value }` |
| `field_neq` | `{ field: { not: value } }` |
| `field_gt` | `{ field: { gt: value } }` |
| `field_gte` | `{ field: { gte: value } }` |
| `field_lt` | `{ field: { lt: value } }` |
| `field_lte` | `{ field: { lte: value } }` |
| `field_in` | `{ field: { in: values } }` |
| `field_nin` | `{ field: { notIn: values } }` |
| `field_exists` (true) | `{ field: { not: null } }` |
| `field_exists` (false) | `{ field: null }` |
| `field_includes` | `{ field: { has: value } }` |
| `field_contains` | `{ field: { contains: value } }` |

Composite nodes (`and`, `or`, `not`) map to Prisma's `AND`, `OR`, and `NOT` operators.

## Creating Resolvers with Prisma

`@toride/prisma` also provides `createPrismaResolver()`, a helper that wraps a Prisma `findUnique` call into the resolver signature that Toride expects:

```typescript
import { createPrismaResolver } from "@toride/prisma";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const engine = new Toride({
  policy: await loadYaml("./policy.yaml"),
  resolvers: {
    Project: createPrismaResolver(prisma, "project"),
    Task: createPrismaResolver(prisma, "task"),
    Document: createPrismaResolver(prisma, "document", {
      select: { id: true, title: true, ownerId: true, status: true },
    }),
  },
});
```

The resolver calls `prisma[modelName].findUnique({ where: { id: ref.id } })` and returns the result as a plain object. If the record is not found, it returns an empty object `{}`.

### Select Option

Pass a `select` option to limit which fields are fetched. This is useful for performance when your model has many columns but only a few are needed for authorization decisions:

```typescript
const resolver = createPrismaResolver(prisma, "project", {
  select: { id: true, ownerId: true, department: true, isPublic: true },
});
```

## Complete Example

Here is an end-to-end example with a policy, Prisma schema, engine setup, and authorized data fetching:

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
import { createPrismaAdapter, createPrismaResolver } from "@toride/prisma";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const engine = new Toride({
  policy: await loadYaml("./policy.yaml"),
  resolvers: {
    Project: createPrismaResolver(prisma, "project"),
  },
});

const adapter = createPrismaAdapter({
  relationMapping: {
    org: "organization",
  },
});

async function listProjects(actor: {
  type: string;
  id: string;
  attributes: Record<string, unknown>;
}) {
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

- [Partial Evaluation](/concepts/partial-evaluation) -- understand how `buildConstraints()` works and what the constraint AST looks like
- [Conditions & Rules](/concepts/conditions-and-rules) -- learn the condition syntax that drives constraint generation
- [Roles & Relations](/concepts/roles-and-relations) -- see how role derivation patterns affect constraint output
- [Drizzle Integration](/integrations/drizzle) -- equivalent adapter for Drizzle ORM
- [Codegen](/integrations/codegen) -- generate TypeScript types from your policy file
