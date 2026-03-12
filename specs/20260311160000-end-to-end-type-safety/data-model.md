# Data Model: End-to-End Type Safety

## Entity Changes

### TorideSchema (new)

```typescript
interface TorideSchema {
  resources: string;
  actions: string;
  actorTypes: string;
  permissionMap: { [R in string]: string };
  roleMap: { [R in string]: string };
  resourceAttributeMap: { [R in string]: Record<string, unknown> };
  actorAttributeMap: { [A in string]: Record<string, unknown> };
  relationMap: { [R in string]: Record<string, string> };
}
```

- Shape constraint for Toride's generic parameter.
- Each property is filled with literal types by codegen.
- `DefaultSchema` extends this with all-`string` defaults.

### ActorRef (modified)

**Current**:
```typescript
interface ActorRef {
  readonly type: string;
  readonly id: string;
  readonly attributes: Record<string, unknown>;
}
```

**New**: Becomes a generic type derived from the schema.
```typescript
type TypedActorRef<S extends TorideSchema> = {
  [A in S["actorTypes"]]: {
    readonly type: A;
    readonly id: string;
    readonly attributes: S["actorAttributeMap"][A];
  };
}[S["actorTypes"]];
```

- When `S = DefaultSchema`, collapses to the current shape (type: string, attributes: Record<string, unknown>).
- When `S = GeneratedSchema`, becomes a discriminated union over actor types.

### ResourceRef (modified)

**Current**:
```typescript
interface ResourceRef {
  readonly type: string;
  readonly id: string;
  readonly attributes?: Record<string, unknown>;
}
```

**New**: Becomes a generic type derived from the schema.
```typescript
type TypedResourceRef<S extends TorideSchema, R extends S["resources"] = S["resources"]> = {
  readonly type: R;
  readonly id: string;
  readonly attributes?: S["resourceAttributeMap"][R];
};
```

- Generic over both schema S and resource type R.
- When R is a specific literal (e.g., "Document"), attributes are typed.
- When R is the full union, attributes are a union of all resource attribute types.

### ResourceBlock (modified)

**Current**:
```typescript
interface ResourceBlock {
  readonly roles: string[];
  readonly permissions: string[];
  readonly relations?: Record<string, string>;
  readonly grants?: Record<string, string[]>;
  readonly derived_roles?: DerivedRoleEntry[];
  readonly rules?: Rule[];
  readonly field_access?: Record<string, FieldAccessDef>;
}
```

**New**: Gains an optional `attributes` field.
```typescript
interface ResourceBlock {
  readonly attributes?: Record<string, AttributeType>;  // NEW
  readonly roles: string[];
  readonly permissions: string[];
  readonly relations?: Record<string, string>;
  readonly grants?: Record<string, string[]>;
  readonly derived_roles?: DerivedRoleEntry[];
  readonly rules?: Rule[];
  readonly field_access?: Record<string, FieldAccessDef>;
}
```

- `attributes` uses the same `AttributeType` as actor declarations: `"string" | "number" | "boolean"`.
- Optional — resources without attributes fall back to `Record<string, unknown>` in codegen.

### Resolvers (modified)

**Current**:
```typescript
type ResourceResolver = (ref: ResourceRef) => Promise<Record<string, unknown>>;
type Resolvers = Record<string, ResourceResolver>;
```

**New**: Becomes a generic mapped type.
```typescript
type TypedResourceResolver<S extends TorideSchema, R extends S["resources"]> = (
  ref: TypedResourceRef<S, R>,
) => Promise<S["resourceAttributeMap"][R]>;

type TypedResolvers<S extends TorideSchema> = {
  [R in S["resources"]]?: TypedResourceResolver<S, R>;
};
```

- Resolver keys are narrowed to valid resource type names.
- Resolver return types match the declared resource attributes.
- When `S = DefaultSchema`, collapses to current behavior.

### BatchCheckItem (modified)

**Current**:
```typescript
interface BatchCheckItem {
  readonly action: string;
  readonly resource: ResourceRef;
}
```

**New**: Uses global actions union.
```typescript
interface TypedBatchCheckItem<S extends TorideSchema> {
  readonly action: S["actions"];
  readonly resource: TypedResourceRef<S>;
}
```

- Action is narrowed to the global union (not per-resource, since batch items are heterogeneous).

### TorideOptions (modified)

**Current**:
```typescript
interface TorideOptions {
  readonly policy: Policy;
  readonly resolvers?: Resolvers;
  // ...other fields
}
```

**New**: Generic over schema.
```typescript
interface TypedTorideOptions<S extends TorideSchema> {
  readonly policy: Policy;
  readonly resolvers?: TypedResolvers<S>;
  // ...other fields unchanged
}
```

### ExplainResult (modified)

**Current**:
```typescript
interface ExplainResult {
  readonly allowed: boolean;
  readonly resolvedRoles: ResolvedRolesDetail;
  readonly grantedPermissions: string[];
  readonly matchedRules: MatchedRule[];
  readonly finalDecision: string;
}
```

**New**: `grantedPermissions` becomes typed when resource type is known.
```typescript
interface TypedExplainResult<S extends TorideSchema, R extends S["resources"]> {
  readonly allowed: boolean;
  readonly resolvedRoles: ResolvedRolesDetail;
  readonly grantedPermissions: S["permissionMap"][R][];
  readonly matchedRules: MatchedRule[];
  readonly finalDecision: string;
}
```

### Unchanged Types

The following types are NOT modified:
- `CheckOptions` — env stays `Record<string, unknown>`
- `Policy` — runtime type unchanged (schema extension is additive)
- `ConditionExpression` and all condition types
- `Constraint` and all constraint AST types
- `ConstraintAdapter<TQuery>`
- All error types (`ValidationError`, `CycleError`, `DepthLimitError`)
- `DecisionEvent`, `QueryEvent` — audit events remain runtime-typed

## Policy Schema Changes

### Resource Attributes Declaration (new)

**Current** — resources have no attribute declarations:
```yaml
resources:
  Document:
    roles: [owner, editor, viewer]
    permissions: [read, write, delete]
```

**New** — optional `attributes` section:
```yaml
resources:
  Document:
    attributes:
      status: string
      ownerId: string
    roles: [owner, editor, viewer]
    permissions: [read, write, delete]
```

### Valibot Schema Changes (schema.ts)

The `ResourceBlockSchema` gains an optional `attributes` field:
```typescript
export const ResourceBlockSchema = v.object({
  attributes: v.optional(v.record(v.string(), AttributeTypeSchema)),  // NEW
  roles: v.array(v.string()),
  permissions: v.array(v.string()),
  // ...existing fields unchanged
});
```

### Codegen Output Changes

**Current codegen output** includes:
- `Actions`, `Resources`, `RoleMap`, `PermissionMap`, `RelationMap`, `ResolverMap`

**New codegen output** adds:
- `ActorTypes` — union of actor type names
- `ActorAttributeMap` — per-actor typed attribute interface
- `ResourceAttributeMap` — per-resource typed attribute interface
- `GeneratedSchema` — unified schema interface extending `TorideSchema`
- `ResolverMap` — updated with typed return values

## Type Flow Diagram

```
Policy YAML (source of truth)
  │
  ├── [codegen] ──→ GeneratedSchema (TypeScript interface)
  │                   ├── Resources: "Document" | "Organization"
  │                   ├── Actions: "read" | "write" | "manage"
  │                   ├── ActorTypes: "User"
  │                   ├── PermissionMap: { Document: "read"|"write"; ... }
  │                   ├── ResourceAttributeMap: { Document: { status: string; ... }; ... }
  │                   ├── ActorAttributeMap: { User: { email: string; ... } }
  │                   └── RelationMap: { Document: { org: "Organization" }; ... }
  │
  └── [runtime] ──→ Policy object (parsed YAML, validated)

GeneratedSchema
  │
  ├── Toride<GeneratedSchema>
  │   ├── can<R>() — action narrowed to PermissionMap[R]
  │   ├── explain<R>() — returns typed grantedPermissions
  │   ├── permittedActions<R>() — returns PermissionMap[R][]
  │   ├── canBatch() — action narrowed to global Actions
  │   └── buildConstraints<R>() — resourceType narrowed
  │
  ├── TypedResolvers<GeneratedSchema>
  │   └── resolver return types match ResourceAttributeMap
  │
  ├── TorideClient<GeneratedSchema>
  │   └── can() — action narrowed to global Actions
  │
  └── Integration packages
      ├── createDrizzleResolver<GeneratedSchema, R>()
      └── createPrismaResolver<GeneratedSchema, R>()
```
