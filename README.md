# Toride

[![npm version](https://img.shields.io/npm/v/toride.svg)](https://www.npmjs.com/package/toride)
[![license](https://img.shields.io/npm/l/toride.svg)](https://github.com/toride-auth/toride/blob/main/LICENSE)
[![CI](https://github.com/toride-auth/toride/actions/workflows/ci.yml/badge.svg)](https://github.com/toride-auth/toride/actions/workflows/ci.yml)

Relation-aware authorization engine for TypeScript — define policies in YAML, resolve roles through relations, and check permissions with a single `can()` call.

## Key Features

- **YAML-based policies** — declarative resource definitions with roles, permissions, and rules
- **Relation-aware role derivation** — inherit roles through resource relations (ReBAC), global roles, and direct assignments
- **ABAC conditions** — attribute-based permit/forbid rules evaluated at runtime
- **Partial evaluation** — generate database-level constraints for data filtering with Prisma or Drizzle
- **Client-side permission hints** — build permission snapshots for instant, synchronous checks in the browser
- **Type-safe codegen** — generate TypeScript types from your policy file for fully typed resolvers

## Installation

```bash
pnpm add toride
```

## Quick Start

### 1. Define a policy

```yaml
# policy.yaml
version: "1"

actors:
  User:
    attributes:
      id: string
      role: string

resources:
  Document:
    roles: [viewer, editor]
    permissions: [read, update, delete]

    grants:
      viewer: [read]
      editor: [read, update, delete]

    relations:
      owner: { resource: User, cardinality: one }

    derived_roles:
      - role: editor
        from_relation: owner
```

### 2. Implement a resolver

```typescript
import type { RelationResolver } from "toride";

const resolver: RelationResolver = {
  async getRoles(actor, resource) {
    // Look up directly assigned roles from your database
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
    if (resource.type === "Document" && relation === "owner") {
      const doc = await db.document.findUniqueOrThrow({
        where: { id: resource.id },
      });
      return { type: "User", id: doc.ownerId };
    }
    throw new Error(`Unknown relation: ${resource.type}.${relation}`);
  },
};
```

### 3. Create the engine and check permissions

```typescript
import { Toride, loadYaml } from "toride";

const engine = new Toride({
  policy: await loadYaml("./policy.yaml"),
  resolver,
});

const actor = { type: "User", id: "alice", attributes: { role: "member" } };

// Check a single permission
const allowed = await engine.can(actor, "update", {
  type: "Document",
  id: "doc-1",
});

// List all permitted actions on a resource
const actions = await engine.permittedActions(actor, {
  type: "Document",
  id: "doc-1",
});
```

## Packages

| Package | Description |
|---------|-------------|
| [`toride`](https://www.npmjs.com/package/toride) | Core authorization engine — policies, role resolution, and permission checks |
| [`@toride/codegen`](https://www.npmjs.com/package/@toride/codegen) | Code generation tools — TypeScript types from policy files |
| [`@toride/drizzle`](https://www.npmjs.com/package/@toride/drizzle) | Drizzle ORM integration — translate constraints into Drizzle WHERE clauses |
| [`@toride/prisma`](https://www.npmjs.com/package/@toride/prisma) | Prisma integration — translate constraints into Prisma WHERE clauses |

## Documentation

Full documentation is available at [toride-auth.github.io/toride](https://toride-auth.github.io/toride/).

## License

[MIT](./LICENSE)
