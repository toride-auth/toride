# Quickstart: End-to-End Type Safety

## Before (current — no type safety)

```yaml
# policy.yaml
version: "1"
actors:
  User:
    attributes:
      email: string
      is_admin: boolean
resources:
  Document:
    roles: [owner, editor, viewer]
    permissions: [read, write, delete]
    relations:
      org: Organization
```

```typescript
import { Toride, createToride } from "toride";

const engine = createToride({ policy, resolvers: {
  Document: async (ref) => {
    // Returns Record<string, unknown> — no type checking
    return { stauts: "draft" }; // Typo goes unnoticed!
  },
}});

// No type errors — all strings
await engine.can(
  { type: "Usr", id: "1", attributes: { emal: "x" } },  // Typos everywhere
  "reed",                                                   // Invalid action
  { type: "Docuemnt", id: "doc-1" },                       // Invalid resource
); // Compiles fine, fails silently at runtime
```

## After (with codegen + type safety)

```yaml
# policy.yaml — NEW: resource attributes declaration
version: "1"
actors:
  User:
    attributes:
      email: string
      is_admin: boolean
resources:
  Document:
    attributes:          # NEW
      status: string     # NEW
      ownerId: string    # NEW
    roles: [owner, editor, viewer]
    permissions: [read, write, delete]
    relations:
      org: Organization
```

```bash
# Run codegen to produce typed schema
npx toride-codegen policy.yaml -o generated-types.ts
```

```typescript
// generated-types.ts (auto-generated)
import type { TorideSchema } from "toride";

export interface GeneratedSchema extends TorideSchema {
  resources: "Document" | "Organization";
  actions: "read" | "write" | "delete" | "manage";
  actorTypes: "User";
  permissionMap: {
    Document: "read" | "write" | "delete";
    Organization: "manage" | "read";
  };
  resourceAttributeMap: {
    Document: { status: string; ownerId: string };
    Organization: { plan: string };
  };
  actorAttributeMap: {
    User: { email: string; is_admin: boolean };
  };
  // ... roleMap, relationMap
}
```

```typescript
// app.ts — fully type-safe!
import { createToride } from "toride";
import type { GeneratedSchema } from "./generated-types";

const engine = createToride<GeneratedSchema>({
  policy,
  resolvers: {
    Document: async (ref) => {
      // ref.type is "Document", ref.attributes is { status: string; ownerId: string }
      return { status: "draft", ownerId: "user-1" };
      // return { stauts: "draft" }; // ← Type error! 'stauts' doesn't exist
    },
  },
});

// ✅ Compiles — valid action and resource
await engine.can(
  { type: "User", id: "1", attributes: { email: "a@b.com", is_admin: true } },
  "read",
  { type: "Document", id: "doc-1" },
);

// ❌ Type error: '"reed"' is not assignable to '"read" | "write" | "delete"'
await engine.can(actor, "reed", { type: "Document", id: "doc-1" });

// ❌ Type error: '"Docuemnt"' is not assignable to '"Document" | "Organization"'
await engine.can(actor, "read", { type: "Docuemnt", id: "doc-1" });

// ❌ Type error: Property 'emal' does not exist. Did you mean 'email'?
const badActor = { type: "User" as const, id: "1", attributes: { emal: "x" } };

// ✅ Return type is narrowed
const perms = await engine.permittedActions(actor, { type: "Document", id: "doc-1" });
// perms: ("read" | "write" | "delete")[]

// ✅ Client-side type safety
import { TorideClient } from "toride/client";
const client = new TorideClient<GeneratedSchema>(snapshot);
client.can("read", { type: "Document", id: "doc-1" }); // ✅
client.can("reed", { type: "Document", id: "doc-1" }); // ❌ Type error
```
