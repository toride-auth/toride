# Quickstart: GraphQL Resolver Pattern

## Before (current API)

```typescript
import { createToride, loadYaml } from "toride";

const policy = await loadYaml("policy.yaml");

const engine = createToride({
  policy,
  resolver: {
    async getRoles(actor, resource) {
      // Must handle all resource types in one function
      if (resource.type === "Document") {
        const doc = await db.documents.findUnique({ where: { id: resource.id } });
        if (doc.ownerId === actor.id) return ["owner"];
        return [];
      }
      return [];
    },
    async getRelated(resource, relationName) {
      if (resource.type === "Document" && relationName === "org") {
        const doc = await db.documents.findUnique({ where: { id: resource.id } });
        return { type: "Organization", id: doc.orgId };
      }
      return [];
    },
    async getAttributes(ref) {
      if (ref.type === "Document") {
        return await db.documents.findUnique({ where: { id: ref.id } });
      }
      if (ref.type === "Organization") {
        return await db.organizations.findUnique({ where: { id: ref.id } });
      }
      return {};
    },
  },
});

const allowed = await engine.can(
  { type: "User", id: "u1", attributes: { role: "admin" } },
  "read",
  { type: "Document", id: "doc1" },
);
```

## After (new API)

```typescript
import { createToride, loadYaml } from "toride";

const policy = await loadYaml("policy.yaml");

const engine = createToride({
  policy,
  resolvers: {
    Document: async (ref) => {
      const doc = await db.documents.findUnique({ where: { id: ref.id } });
      return {
        owner_id: doc.ownerId,
        status: doc.status,
        org: { type: "Organization", id: doc.orgId }, // Relation as attribute
      };
    },
    Organization: async (ref) => {
      const org = await db.organizations.findUnique({ where: { id: ref.id } });
      return { plan: org.plan, name: org.name };
    },
  },
});

// Basic check (resolver fetches data)
const allowed = await engine.can(
  { type: "User", id: "u1", attributes: { role: "admin" } },
  "read",
  { type: "Document", id: "doc1" },
);

// With inline attributes (zero resolver calls)
const allowed2 = await engine.can(
  { type: "User", id: "u1", attributes: { role: "admin" } },
  "read",
  {
    type: "Document",
    id: "doc1",
    attributes: {
      status: "published",
      owner_id: "u1",
      org: { type: "Organization", id: "org1", plan: "enterprise" },
    },
  },
);
```

## Policy YAML (before vs after)

### Before
```yaml
resources:
  Document:
    relations:
      org:
        resource: Organization
        cardinality: one
    derived_roles:
      - role: owner
        from_relation: author
```

### After
```yaml
resources:
  Document:
    relations:
      org: Organization
    derived_roles:
      - role: owner
        when:
          $resource.owner_id:
            eq: $actor.id
```

## With Drizzle adapter

```typescript
import { createToride, loadYaml } from "toride";
import { createDrizzleResolver, createDrizzleAdapter } from "@toride/drizzle";
import { db } from "./db";
import { documents, organizations } from "./schema";

const policy = await loadYaml("policy.yaml");

const engine = createToride({
  policy,
  resolvers: {
    Document: createDrizzleResolver(db, documents),
    Organization: createDrizzleResolver(db, organizations),
  },
});
```

## Key patterns

### Partial inline (resolver fills gaps)
```typescript
// You have the status but not org — resolver fetches org only
await engine.can(actor, "read", {
  type: "Document",
  id: "doc1",
  attributes: { status: "draft" },
});
```

### No resolvers needed
```typescript
// All data inline — engine works without any resolvers
const engine = createToride({ policy });

await engine.can(actor, "read", {
  type: "Document",
  id: "doc1",
  attributes: { status: "draft", owner_id: "u1" },
});
```

### Nested relation traversal
```yaml
# Policy: $resource.org.plan
# Engine resolves: Document.org -> Organization -> Organization.plan
rules:
  - effect: permit
    permissions: [use_premium_feature]
    when:
      $resource.org.plan:
        eq: enterprise
```
