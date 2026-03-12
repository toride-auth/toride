# Data Model: Deep Type Safety

## Type Entities

### TorideSchema (unchanged interface shape)

No new properties added. The existing interface already contains all needed maps:

| Property | Type | Used For |
|----------|------|----------|
| `resources` | `string` union | Resource type names |
| `actions` | `string` union | Global action names |
| `actorTypes` | `string` union | Actor type names |
| `permissionMap` | `{ [R]: string }` | Per-resource action narrowing |
| `roleMap` | `{ [R]: string }` | Per-resource role narrowing |
| `resourceAttributeMap` | `{ [R]: Record<string, unknown> }` | Per-resource field narrowing (via `keyof`) |
| `actorAttributeMap` | `{ [A]: Record<string, unknown> }` | Per-actor attribute types |
| `relationMap` | `{ [R]: Record<string, string> }` | Per-resource relation maps |

### ConstraintResult\<R\> (modified)

**Before**: `ConstraintResult` (unparameterized discriminated union)

**After**: `ConstraintResult<R extends string = string>` with phantom resource type

```typescript
type ConstraintResult<R extends string = string> =
  | { readonly unrestricted: true; readonly __resource?: R }
  | { readonly forbidden: true; readonly __resource?: R }
  | { readonly constraints: Constraint; readonly __resource?: R };
```

**Fields**: No runtime fields change. `__resource` is an optional phantom field for type inference only.

### ConstraintAdapter\<TQueryMap\> (modified — breaking change)

**Before**: `ConstraintAdapter<TQuery>` — single query type

**After**: `ConstraintAdapter<TQueryMap extends Record<string, unknown> = Record<string, unknown>>` — resource-to-query-type map

```typescript
interface ConstraintAdapter<TQueryMap extends Record<string, unknown> = Record<string, unknown>> {
  translate(constraint: LeafConstraint): TQueryMap[string];
  relation(field: string, resourceType: string, childQuery: TQueryMap[string]): TQueryMap[string];
  hasRole(actorId: string, actorType: string, role: string): TQueryMap[string];
  unknown(name: string): TQueryMap[string];
  and(queries: TQueryMap[string][]): TQueryMap[string];
  or(queries: TQueryMap[string][]): TQueryMap[string];
  not(query: TQueryMap[string]): TQueryMap[string];
}
```

**Note**: When `TQueryMap = Record<string, PrismaWhere>`, all methods accept/return `PrismaWhere` — functionally identical to the old `ConstraintAdapter<PrismaWhere>`.

### PermissionSnapshot\<S\> (modified)

**Before**: `type PermissionSnapshot = Record<string, string[]>`

**After**: `type PermissionSnapshot<S extends TorideSchema = DefaultSchema> = Record<string, string[]>`

Runtime structure unchanged. `S` is a phantom type parameter that flows through to `TorideClient<S>` for type-safe construction.

### ClientResourceRef\<S, R\> (modified)

**Before**: Generic over `S` only, `type: S["resources"]`

**After**: Generic over both `S` and `R extends S["resources"]`, `type: R`

```typescript
interface ClientResourceRef<
  S extends TorideSchema = DefaultSchema,
  R extends S["resources"] = S["resources"],
> {
  readonly type: R;
  readonly id: string;
}
```

## Modified Engine Method Signatures

| Method | Current Return/Param | New Return/Param |
|--------|---------------------|------------------|
| `buildConstraints<R>()` | `ConstraintResult` | `ConstraintResult<R>` |
| `translateConstraints()` | `TQuery` | `TQueryMap[R]` (R inferred from ConstraintResult) |
| `canField<R>(field)` | `field: string` | `field: keyof S['resourceAttributeMap'][R] & string` |
| `permittedFields<R>()` | `string[]` | `(keyof S['resourceAttributeMap'][R] & string)[]` |
| `resolvedRoles<R>()` | `string[]` | `S['roleMap'][R][]` |
| `snapshot()` | `PermissionSnapshot` | `PermissionSnapshot<S>` |
| `TorideClient.can()` | `action: S['actions']` | `action: S['permissionMap'][R]` |
| `TorideClient.permittedActions()` | `S['actions'][]` | `S['permissionMap'][R][]` |

## Codegen Changes

The `generateTypes()` function in `@toride/codegen` requires **no structural changes** to the generated schema. The existing `GeneratedSchema` interface already emits all needed maps (`permissionMap`, `roleMap`, `resourceAttributeMap`). The downstream type improvements come from the engine/client consuming these maps differently.

## Adapter Package Changes

### @toride/prisma

`createPrismaAdapter()` gains an optional `TQueryMap` type parameter:

```typescript
function createPrismaAdapter<
  TQueryMap extends Record<string, PrismaWhere> = Record<string, PrismaWhere>
>(options?: PrismaAdapterOptions): ConstraintAdapter<TQueryMap>
```

### @toride/drizzle

`createDrizzleAdapter()` gains an optional `TQueryMap` type parameter:

```typescript
function createDrizzleAdapter<
  TQueryMap extends Record<string, DrizzleQuery> = Record<string, DrizzleQuery>
>(table: AnyTable, options?: DrizzleAdapterOptions): ConstraintAdapter<TQueryMap>
```

## Edge Cases (Type Level)

| Scenario | Behavior |
|----------|----------|
| Resource with no attributes | `keyof resourceAttributeMap[R]` = `keyof Record<string, unknown>` = `string` (permissive, not `never`) — codegen emits `Record<string, unknown>` for attributeless resources |
| Resource with no roles | `roleMap[R]` = `never` — `resolvedRoles()` returns `never[]` |
| Resource with no permissions | `permissionMap[R]` = `never` — `can()` is uncallable for that resource |
| DefaultSchema (untyped) | All types degrade to `string` / `Record<string, unknown>` — full backward compat |
| Adapter TQueryMap missing a resource | `TQueryMap[R]` falls back to `TQueryMap[string]` which is the union of all values — safe fallback |
