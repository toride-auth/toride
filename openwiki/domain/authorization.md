# Authorization domain

## Policy model

A policy declares actors, resources, relations, permissions, grants, derived roles, conditional rules, and optional field access (`packages/toride/src/types.ts`). Resource resolvers return attributes and `ResourceRef` relations; inline resource attributes can supply values when no resolver is available, and take precedence field-by-field when both sources exist.

The domain intentionally combines coarse resource decisions with query-time filtering:

- `can(actor, action, resource)` is the normal decision for one resource.
- `explain()` exposes resolved roles, permissions, matched rules, and the final result.
- `buildConstraints()` describes which rows may be visible without loading every row.
- `permittedFields()`/field checks support UI and payload shaping.
- `snapshot()` transfers permitted actions to a client; `client.ts` performs synchronous default-deny checks.

## Role and permission resolution

Roles can be derived declaratively through global roles, roles on related resources, relation identity, actor type plus conditions, and condition-only derivation. A grant of `all` expands to every permission on its resource. Resolver calls are cached within an evaluation (and shared for batch/convenience operations), while cycle and traversal-depth safeguards prevent pathological relation graphs.

The effective decision flow is:

1. Resolve direct and derived roles.
2. Expand grants, including `all`.
3. Check static permission grants.
4. Evaluate rules applying to the requested action.
5. Apply forbid-wins precedence.

A matching forbid overrides a grant or permit. A matching permit can elevate an actor without a static grant. Role-scoped rules are skipped when no listed role is present. Missing attributes/environment values, resolver failures, unknown resources, missing grants, and evaluation errors fail closed (deny).

See [`docs/concepts/roles-and-relations.md`](../../docs/concepts/roles-and-relations.md) and [`docs/concepts/conditions-and-rules.md`](../../docs/concepts/conditions-and-rules.md) for the complete policy language.

## Conditions and safety boundaries

Conditions can reference `$actor`, `$resource`, `$env`, comparisons, membership/existence, string operations, custom evaluators, and cross-references. Conditions are evaluated with the current actor/resource context; unresolved values do not become implicit permission.

Audit callbacks (`onDecision`, `onQuery`) are scheduled asynchronously and callback failures are swallowed so observability cannot change an authorization outcome. `setPolicy()` replaces policy for subsequent work while an in-flight check retains its evaluation block.

## Partial evaluation semantics

`buildConstraints()` has three meaningful outcomes:

- `{ ok: false }`: no resources are accessible.
- `{ ok: true, constraint: null }`: access is unrestricted; query without an authorization predicate.
- `{ ok: true, constraint: ... }`: translate/filter using the AST.

The AST models comparisons, membership/existence, relation traversal, role checks, unknown/custom nodes, boolean combinations, and always/never. Known actor/environment predicates are evaluated immediately; resource predicates remain for the adapter. Multiple derivation paths are ORed and forbids become NOT constraints. Callers must not pass the result directly to an ORM without handling all three cases.

The current internal AST includes `field_nin`; the public partial-evaluation table does not list it. Treat that mismatch as a documentation/API consistency watch-out when changing partial evaluation.

## Field and client semantics

Field access is separate from resource access. With no `field_access`, or for an undeclared operation, field checks fall back to the resource-level permission. A declared field operation requires a matching resolved role. `permittedFields()` returns explicitly listed fields only; it does not imply that omitted fields are restricted.

Snapshots use keys such as `Project:123` and values such as `["read", "update"]`. Duplicate resource keys are overwritten during construction, so callers should supply unique resource identities. Client checks default deny when a snapshot has no matching entry.

## Source anchors

- Core types: `packages/toride/src/types.ts`
- Decision orchestration: `packages/toride/src/engine.ts`
- Rule semantics: `packages/toride/src/evaluation/rule-engine.ts`
- Resolver/role evaluation: `packages/toride/src/evaluation/`
- Fields: `packages/toride/src/field-access.ts`
- Snapshot/client: `packages/toride/src/snapshot.ts`, `client.ts`
- Constraint model: `packages/toride/src/partial/constraint-types.ts`, `constraint-builder.ts`
