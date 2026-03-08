# Drizzle Integration

`@toride/drizzle` provides a constraint adapter and resolver helper for [Drizzle ORM](https://orm.drizzle.team/). It translates Toride's constraint AST into intermediate query description objects that you can use with Drizzle's query builder.

## Installation

::: code-group

```bash [pnpm]
pnpm add @toride/drizzle toride
```

```bash [npm]
npm install @toride/drizzle toride
```

```bash [yarn]
yarn add @toride/drizzle toride
```

:::

`drizzle-orm` is an optional peer dependency (>= 0.29.0). The adapter produces intermediate query objects that describe operations -- it does not import `drizzle-orm` directly, so it works whether or not you have Drizzle installed at build time.

## Quick Start

### 1. Create the Adapter

The adapter is created for a specific Drizzle table reference:

```typescript
import { createDrizzleAdapter } from "@toride/drizzle";
import { projects } from "./schema";

const adapter = createDrizzleAdapter(projects);
```

### 2. Build Constraints and Query

```typescript
import { Toride, loadYaml } from "toride";
import { createDrizzleAdapter } from "@toride/drizzle";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, and, or, not } from "drizzle-orm";
import { projects } from "./schema";

const db = drizzle(pool);

const engine = new Toride({
  policy: await loadYaml("./policy.yaml"),
  resolvers: {
    Project: async (ref) => {
      const rows = await db
        .select()
        .from(projects)
        .where(eq(projects.id, ref.id));
      return rows[0] ?? {};
    },
  },
});

const adapter = createDrizzleAdapter(projects);

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
  return await db.select().from(projects);
}

// Translate constraints into a Drizzle query description
const where = engine.translateConstraints(result.constraints, adapter);
// Use the where description with your Drizzle query builder
```

## Adapter Output Format

Unlike the Prisma adapter (which produces objects that Prisma consumes directly), the Drizzle adapter produces **intermediate query description objects** with an `_op` field that describes the operation. This gives you full control over how to apply them to your Drizzle queries.

Each translated constraint has the shape:

```typescript
{
  _op: "eq" | "ne" | "gt" | "gte" | "lt" | "lte" | "inArray" | "notInArray"
       | "isNull" | "isNotNull" | "arrayContains" | "like"
       | "and" | "or" | "not" | "relation" | "hasRole" | "literal",
  field?: string,
  value?: unknown,
  table?: AnyTable,
  // ... additional properties depending on the operation
}
```

### Constraint Translation Reference

| Constraint Type | `_op` Value | Drizzle Equivalent |
|----------------|-------------|-------------------|
| `field_eq` | `"eq"` | `eq(table.field, value)` |
| `field_neq` | `"ne"` | `ne(table.field, value)` |
| `field_gt` | `"gt"` | `gt(table.field, value)` |
| `field_gte` | `"gte"` | `gte(table.field, value)` |
| `field_lt` | `"lt"` | `lt(table.field, value)` |
| `field_lte` | `"lte"` | `lte(table.field, value)` |
| `field_in` | `"inArray"` | `inArray(table.field, values)` |
| `field_nin` | `"notInArray"` | `notInArray(table.field, values)` |
| `field_exists` (true) | `"isNotNull"` | `isNotNull(table.field)` |
| `field_exists` (false) | `"isNull"` | `isNull(table.field)` |
| `field_includes` | `"arrayContains"` | `arrayContains(table.field, value)` |
| `field_contains` | `"like"` | `like(table.field, pattern)` |

Composite nodes use `"and"`, `"or"`, and `"not"` with `children` or `child` properties.

## Adapter Options

### Relation Configuration

Map constraint relation fields to Drizzle table references and foreign keys:

```typescript
import { projects, organizations } from "./schema";

const adapter = createDrizzleAdapter(projects, {
  relations: {
    org: {
      table: organizations,
      foreignKey: "orgId",
    },
  },
});
```

When the constraint AST contains a `relation` node for the field `org`, the adapter includes the related table reference and foreign key in the output:

```typescript
{
  _op: "relation",
  field: "org",
  resourceType: "Organization",
  child: { /* nested constraint */ },
  relatedTable: organizations,
  foreignKey: "orgId",
}
```

### Role Assignment Configuration

Configure how `hasRole` constraints are generated:

```typescript
import { memberships } from "./schema";

const adapter = createDrizzleAdapter(projects, {
  roleAssignments: {
    table: memberships,
    userIdColumn: "memberId",
    roleColumn: "memberRole",
  },
});
```

This produces:

```typescript
{
  _op: "hasRole",
  actorId: "user-123",
  actorType: "User",
  role: "editor",
  roleTable: memberships,
  userIdColumn: "memberId",
  roleColumn: "memberRole",
}
```

## Creating Resolvers with Drizzle

`@toride/drizzle` provides `createDrizzleResolver()`, a helper that wraps a Drizzle `select` query into the resolver signature that Toride expects:

```typescript
import { createDrizzleResolver } from "@toride/drizzle";
import { drizzle } from "drizzle-orm/node-postgres";
import { projects, tasks } from "./schema";

const db = drizzle(pool);

const engine = new Toride({
  policy: await loadYaml("./policy.yaml"),
  resolvers: {
    Project: createDrizzleResolver(db, projects),
    Task: createDrizzleResolver(db, tasks),
  },
});
```

The resolver calls `db.select().from(table).where({ id: ref.id })` and returns the first row. If no row is found, it returns an empty object `{}`.

### Custom ID Column

If your table uses a column other than `id` as the primary key:

```typescript
const resolver = createDrizzleResolver(db, projects, {
  idColumn: "uuid",
});
```

## Complete Example

Here is an end-to-end example with a policy, Drizzle schema, engine setup, and authorized data fetching:

```yaml
# policy.yaml
version: "1"

actors:
  User:
    attributes:
      department: string

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
import { createDrizzleAdapter, createDrizzleResolver } from "@toride/drizzle";
import { drizzle } from "drizzle-orm/node-postgres";
import { projects, organizations } from "./schema";

const db = drizzle(pool);

const engine = new Toride({
  policy: await loadYaml("./policy.yaml"),
  resolvers: {
    Project: createDrizzleResolver(db, projects),
  },
});

const adapter = createDrizzleAdapter(projects, {
  relations: {
    org: { table: organizations, foreignKey: "orgId" },
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
    return await db.select().from(projects);
  }

  const where = engine.translateConstraints(result.constraints, adapter);
  // Process the `where` description object with your Drizzle query builder
  return where;
}

const alice = {
  type: "User",
  id: "alice",
  attributes: { department: "engineering" },
};
const aliceProjects = await listProjects(alice);
```

## What's Next

- [Partial Evaluation](/concepts/partial-evaluation) -- understand how `buildConstraints()` works and what the constraint AST looks like
- [Conditions & Rules](/concepts/conditions-and-rules) -- learn the condition syntax that drives constraint generation
- [Roles & Relations](/concepts/roles-and-relations) -- see how role derivation patterns affect constraint output
- [Prisma Integration](/integrations/prisma) -- equivalent adapter for Prisma ORM
- [Codegen](/integrations/codegen) -- generate TypeScript types from your policy file
