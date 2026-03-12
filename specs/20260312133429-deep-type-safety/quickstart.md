# Quickstart: Deep Type Safety

## Prerequisites

- toride >= 0.3.0 (this feature)
- @toride/codegen >= 0.3.0
- TypeScript 5.0+ in strict mode

## 1. Generate your schema

Run codegen against your policy YAML (no changes needed — codegen already emits all required maps):

```bash
npx @toride/codegen generate --input policy.yaml --output generated-schema.ts
```

The generated `GeneratedSchema` includes `permissionMap`, `roleMap`, and `resourceAttributeMap` that power all type narrowing.

## 2. Create a typed engine

```typescript
import { createToride } from "toride";
import type { GeneratedSchema } from "./generated-schema.js";

const engine = createToride<GeneratedSchema>({
  policy,
  resolvers: {
    // Resolvers are typed per-resource
    Document: async (ref) => {
      // ref.type is "Document", attributes typed
      return db.getDocument(ref.id);
    },
  },
});
```

## 3. Use typed permission checks

```typescript
// ✅ "read" is valid for Document
await engine.can(actor, "read", { type: "Document", id: "d1" });

// ❌ Compile error: "manage" is not a Document permission
await engine.can(actor, "manage", { type: "Document", id: "d1" });
```

## 4. Typed field access

```typescript
// ✅ "status" is a known Document field
await engine.canField(actor, "read", docRef, "status");

// ❌ Compile error: "nonexistent" is not a Document field
await engine.canField(actor, "read", docRef, "nonexistent");

// Returns typed field union array
const fields = await engine.permittedFields(actor, "read", docRef);
// type: ("status" | "ownerId")[]
```

## 5. Typed roles

```typescript
const roles = await engine.resolvedRoles(actor, docRef);
// type: ("owner" | "editor" | "viewer")[]

roles.includes("editor"); // ✅
roles.includes("editr");  // ❌ Compile error
```

## 6. Typed constraint pipeline

```typescript
import { createPrismaAdapter } from "@toride/prisma";
import type { Prisma } from "@prisma/client";

// Create a typed adapter with per-resource query types
const adapter = createPrismaAdapter<{
  Document: Prisma.DocumentWhereInput;
  Organization: Prisma.OrganizationWhereInput;
}>();

// Build constraints — result carries resource type
const result = await engine.buildConstraints(actor, "read", "Document");
// result: ConstraintResult<"Document">

if ("constraints" in result) {
  const where = engine.translateConstraints(result, adapter);
  // where: Prisma.DocumentWhereInput ← typed!
}
```

## 7. Typed client-side checks

```typescript
import { TorideClient } from "toride";

// Snapshot carries schema type
const snapshot = await engine.snapshot(actor, [docRef, orgRef]);
const client = new TorideClient<GeneratedSchema>(snapshot);

// Per-resource action narrowing on the client
client.can("read", { type: "Document", id: "d1" });   // ✅
client.can("manage", { type: "Document", id: "d1" });  // ❌ Compile error

const actions = client.permittedActions({ type: "Document", id: "d1" });
// type: ("read" | "write" | "delete")[]
```

## Backward Compatibility

All changes are backward compatible when using `DefaultSchema` (no type parameter):

```typescript
// Untyped engine — everything accepts string
const engine = createToride({ policy });
await engine.can(actor, "any-action", { type: "any-resource", id: "1" });

// Untyped client — everything accepts string
const client = new TorideClient(snapshot);
client.can("anything", { type: "whatever", id: "x" });
```

**Exception**: `ConstraintAdapter<TQuery>` is renamed to `ConstraintAdapter<TQueryMap>`. Existing custom adapters need to update their type parameter from a single type to a record type (e.g., `ConstraintAdapter<MyQuery>` → `ConstraintAdapter<Record<string, MyQuery>>`).
