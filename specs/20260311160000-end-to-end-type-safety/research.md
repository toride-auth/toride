# Research: End-to-End Type Safety

## R1: Schema Interface Design — Flat Maps vs Nested

**Decision**: Use flat maps (separate top-level properties for permissionMap, roleMap, resourceAttributeMap, etc.) in the TorideSchema interface.

**Rationale**: Flat maps match the existing codegen output structure (separate `RoleMap`, `PermissionMap`, `RelationMap` interfaces). They're independently accessible via `S["permissionMap"][R]` without nested indexing. Each map has a clear single responsibility.

**Alternatives considered**:
- Nested per-resource map (bundle permissions+roles+attributes per resource): Rejected — requires deeper indexing (`S["resourceMap"][R]["permissions"]`), harder to extend with new maps in future, and doesn't match existing codegen output.

## R2: Actor Ref Typing — Discriminated Union vs Dual Generics

**Decision**: Use a discriminated union for typed actor refs. The `can()` method is generic only over the resource type R, and accepts the actor union as-is.

**Rationale**: Most policies have 1-3 actor types. A discriminated union (`{ type: "User"; attributes: {...} } | { type: "ServiceAccount"; attributes: {...} }`) provides full type safety with simpler method signatures. Adding a second generic parameter to every engine method for actor type would make the API verbose and harder to read.

**Alternatives considered**:
- Dual generics `can<A, R>()`: Rejected — doubles the generic parameters on every method. Actor type inference adds no practical value since most apps only have one actor type.

## R3: canBatch Typing — Global Actions Union

**Decision**: `canBatch()` uses the global `Actions` union for the action field in `BatchCheckItem`, not per-resource narrowing.

**Rationale**: `canBatch()` accepts a heterogeneous array of items where each item may reference a different resource type. TypeScript cannot narrow the action type per-item in an array without complex tuple types or a builder pattern. The global union still catches completely invalid action names and is pragmatic for real-world usage.

**Alternatives considered**:
- Typed batch builder (`engine.batch(actor).check("read", doc).check("manage", org).run()`): Rejected for now — adds API surface, requires new builder class, and the ergonomic gain is marginal since batch callers typically already know their actions are valid.
- Tuple overloads: Rejected — only works for small batches (3-4 items), unwieldy for real usage.

## R4: Return Type Narrowing

**Decision**: Narrow return types when the resource type is statically known. `permittedActions<R>()` returns `PermissionMap[R][]`, `explain<R>()` returns typed `grantedPermissions`, etc.

**Rationale**: Narrowed return types complete the type safety story. If input parameters are narrowed but outputs are `string[]`, consumers lose type information at the boundary. With narrowed returns, the permissions flowing through the application are tracked by the type system from policy definition to UI rendering.

**Alternatives considered**:
- Keep `string[]` returns: Rejected — half-measures create confusion where inputs are typed but outputs aren't. If we're committing to type safety, we should go end-to-end.

## R5: Policy Schema Extension — Resource Attributes

**Decision**: Extend the policy YAML format to support an optional `attributes` declaration on resource blocks, using the same `{ field_name: type }` format as actor declarations.

**Rationale**: Without declared resource attributes, codegen can only type resolvers and inline attributes as `Record<string, unknown>`. The attribute declaration is the source of truth that unlocks typed resolvers, typed inline attributes, and typed constraint fields. Since actors already use this format, the extension is natural and consistent.

**Impact on existing policies**: None — the `attributes` field is optional. Policies without it continue to work; codegen falls back to `Record<string, unknown>` for those resources.

**Example**:
```yaml
resources:
  Document:
    attributes:
      status: string
      ownerId: string
    roles: [owner, editor, viewer]
    permissions: [read, write, delete]
    # ... existing fields unchanged
```

## R6: Backward Compatibility Strategy

**Decision**: Breaking changes are acceptable (major version bump). However, migration is minimal: add `<GeneratedSchema>` as a type parameter. The `DefaultSchema` default means unparameterized usage works identically.

**Migration path**:
1. Run codegen to produce `GeneratedSchema` (includes new `ResourceAttributeMap`, `ActorAttributeMap`)
2. Change `new Toride(opts)` to `new Toride<GeneratedSchema>(opts)`
3. TypeScript now catches type errors at all call sites
4. Fix any newly-revealed type errors (these are real bugs that existed before)

**Why breaking**: The `Resolvers` type changes from `Record<string, ResourceResolver>` to the typed `TypedResolvers<S>`. The `ActorRef` and `ResourceRef` interfaces gain generic parameters. These are technically breaking even though the runtime behavior is identical.

## R7: TypeScript Complexity Considerations

**Decision**: Keep type-level machinery simple. No deep conditional types, no recursive type inference from Policy literals. The complexity lives in codegen (string concatenation), not in TypeScript's type system.

**Rationale**: Deep conditional/mapped types cause:
- Slow IDE autocomplete (LSP timeouts on large schemas)
- Incomprehensible error messages ("Type X is not assignable to Omit<Pick<Partial<...>>>")
- Fragile types that break across TypeScript versions

By using a simple interface constraint (`TorideSchema`) filled in by codegen, we get:
- Fast IDE response (no type computation needed, it's all literal types)
- Clear error messages ("'reed' is not assignable to 'read' | 'write'")
- TypeScript version stability (no reliance on edge-case inference behavior)

## R8: `env` Typing Decision

**Decision**: Keep `CheckOptions.env` as `Record<string, unknown>` (untyped).

**Rationale**: Environment values are inherently dynamic and contextual (IP addresses, timestamps, feature flags, request metadata). They change per-request and are not part of the policy schema. Typing them would require either:
- A new `env` section in the policy YAML (schema bloat for marginal safety)
- Users manually declaring env types (friction without clear benefit)

The risk of env typos is lower than resource/action typos because env conditions are less common and more carefully reviewed.

## R9: Type Naming Strategy

**Decision**: Keep existing type names (`ActorRef`, `ResourceRef`, `Resolvers`, `TorideOptions`, etc.) and make them generic with default type parameters. No `Typed` prefix.

**Rationale**: Adding generic type parameters with defaults is backward-compatible at the usage level. `ActorRef` (no param) resolves to `ActorRef<DefaultSchema>` which matches the current shape. This avoids doubling the type surface with deprecated aliases and means existing imports don't break.

**Alternatives considered**:
- `TypedActorRef<S>` with deprecated `ActorRef` alias: Rejected — doubles the type surface, confusing to have two names for the same thing.

## R10: Type Testing Strategy

**Decision**: Use `tsd` (and `@ts-expect-error` comments in vitest test files) for testing compile-time type correctness.

**Rationale**: Many requirements are about compile-time errors (typo detection, attribute shape enforcement). `tsd` provides `expectType<T>()`, `expectError()`, `expectNotAssignable()` for structured type testing. `@ts-expect-error` in vitest files catches regressions where invalid code should fail to compile.

**Alternatives considered**:
- vitest typecheck mode only: Viable but less structured — no `expectType<T>()` for positive assertions.
- `@ts-expect-error` only: Too minimal for a library where type correctness is the primary feature.

## R11: Implementation Order

**Decision**: Bottom-up — schema extension → core types → engine generics → codegen → client → integrations.

**Rationale**: Each layer builds on the previous. Core types must exist before engine can be parameterized. Engine must be parameterized before codegen output can be validated against it. TDD works naturally in this order: write type tests for each layer, then implement.

**Alternatives considered**:
- Codegen-first: Requires stubbing core types before they exist. Backward.
- Vertical slice: Proves concept fast but creates throwaway scaffolding.
