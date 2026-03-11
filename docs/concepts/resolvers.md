---
description: Resolvers and the default resolver — how Toride resolves resource attributes from inline data, registered resolvers, or both, with merge precedence rules.
---

# Resolvers

Resolvers are functions that fetch resource attributes at evaluation time. They supply the data that Toride needs to evaluate [conditions](/concepts/conditions-and-rules) referencing `$resource.<field>`. However, resolvers are **entirely optional** — if you pass attributes inline on a `ResourceRef`, the engine uses them directly without calling any resolver. This is the **default resolver** behavior.

## The Default Resolver

When no `ResourceResolver` is registered for a resource type, Toride falls back to inline attributes — the `attributes` property on the `ResourceRef` you pass to `can()`. This works the same way default resolvers work in GraphQL: if no resolver is defined for a field, the framework returns the value from the parent object.

In Toride, the "parent object" is the `ResourceRef` you provide at the call site. Any attributes you include are immediately available for condition evaluation, no resolver registration needed.

### Inline-Only Example

```typescript
import { createToride } from "toride";

const policy = {
  version: "1" as const,
  actors: { User: {} },
  resources: {
    Document: {
      roles: ["viewer"],
      permissions: ["read"],
      grants: { viewer: ["read"] },
      rules: [
        {
          effect: "permit" as const,
          permissions: ["read"],
          when: { "$resource.status": "published" },
        },
      ],
    },
  },
};

// No resolvers registered — inline attributes are the data source
const engine = createToride({ policy });

const allowed = await engine.can(
  { type: "User", id: "alice", attributes: {} },
  "read",
  { type: "Document", id: "doc-1", attributes: { status: "published" } },
);
// true — the condition $resource.status matches the inline attribute
```

This is the simplest way to use Toride. You already have the data at the call site, so there is no need to write a resolver function.

### When No Data Is Available

If no resolver is registered **and** no inline attributes are provided, all `$resource.<field>` references resolve to `undefined`. Toride applies **strict null semantics** — comparisons against `undefined` fail, which means conditions do not match and the engine defaults to deny:

```typescript
const denied = await engine.can(
  { type: "User", id: "alice", attributes: {} },
  "read",
  { type: "Document", id: "doc-1" }, // no attributes
);
// false — $resource.status is undefined, condition fails, default deny
```

This fail-closed behavior ensures that missing data never accidentally grants access.

## Registered Resolvers

For scenarios where you need to fetch data dynamically — from a database, API, or any other source — you register a `ResourceResolver` when creating the engine:

```typescript
const engine = createToride({
  policy,
  resolvers: {
    Document: async (ref) => {
      const doc = await db.documents.findById(ref.id);
      return {
        status: doc.status,
        ownerId: doc.ownerId,
        org: { type: "Organization", id: doc.orgId },
      };
    },
  },
});
```

The resolver receives a `ResourceRef` (with `type` and `id`) and returns a flat object containing attribute values and relation references. Toride calls the resolver only when it needs to evaluate conditions or follow relations for that resource type.

## Merge Precedence

When both inline attributes **and** a registered resolver provide data for the same resource, Toride merges them with a clear precedence rule: **inline attributes win**.

### Resolver + Inline Merge Example

```typescript
const engine = createToride({
  policy,
  resolvers: {
    Document: async (ref) => {
      // Resolver returns status: "draft"
      return { status: "draft", category: "internal" };
    },
  },
});

const allowed = await engine.can(
  { type: "User", id: "alice", attributes: {} },
  "read",
  {
    type: "Document",
    id: "doc-1",
    // Inline attribute overrides the resolver's status
    attributes: { status: "published" },
  },
);
// true — inline "published" wins over resolver's "draft"
```

The merge happens field by field:

| Field | Resolver Value | Inline Value | Result |
|-------|---------------|--------------|--------|
| `status` | `"draft"` | `"published"` | `"published"` (inline wins) |
| `category` | `"internal"` | *(not provided)* | `"internal"` (resolver fills the gap) |

This design lets you use resolvers as a baseline data source while overriding specific fields at the call site when you have fresher or more specific data.

## Choosing an Approach

| Approach | When to Use |
|----------|-------------|
| **Inline only** (default resolver) | You already have the attributes at the call site — no extra data fetching needed |
| **Resolver only** | Attributes must be fetched dynamically and the caller does not have them |
| **Resolver + inline** | Resolver provides baseline data, but the caller overrides specific fields |

For simple applications or cases where the caller already loads the resource (e.g., in a REST handler that fetches the entity before checking permissions), the default resolver approach avoids boilerplate. For complex scenarios with relations and nested role derivation, registered resolvers keep the authorization logic decoupled from your request handlers.

## What's Next

- [Roles & Relations](/concepts/roles-and-relations) — see how resolvers supply data for relation-based role derivation
- [Conditions & Rules](/concepts/conditions-and-rules) — the condition syntax that resolvers provide data for
- [Partial Evaluation](/concepts/partial-evaluation) — push authorization into data-layer queries
