# Policies and authorization

## Policy building blocks

A policy is parsed from YAML or JSON by `packages/toride/src/policy/parser.ts`, structurally validated by Valibot schemas in `policy/schema.ts`, and semantically checked by `policy/validator.ts`. Resource blocks can declare attributes, roles, permissions, relations, grants, derived roles, conditional rules, and field access.

Current relations use a direct resource type name, for example `organization: Organization`; the parser rejects the older `{ resource, cardinality }` relation object syntax. Attribute shorthand (primitive, array, and nested object forms) is normalized before evaluation.

`mergePolicies` in `policy/merger.ts` supports composing policy fragments. Strict validation can additionally report static issues such as unused roles or unreachable rules.

## Decision semantics

The core evaluator (`evaluation/rule-engine.ts`) is default-deny:

- static grants provide baseline permissions;
- permit rules can grant access conditionally, even when a static grant is absent;
- forbid rules override matching grants and permits;
- missing attributes or unmatched permissions do not grant access.

Conditions can combine `any` and `all` branches and reference `$actor`, `$resource`, and `$env`. Supported operators include equality/inequality, comparisons, membership, existence, array inclusion, string prefix/suffix/containment, and custom evaluation.

Roles may be direct, global (based on actor attributes), or derived through related resources and other roles. Traversal is bounded and cycle-aware; relation data therefore needs to be resolvable for the policy path being evaluated.

## Field access

`field-access.ts` separates resource-level decisions from field-level read/update decisions. Explicit field restrictions require a matching role. Undeclared fields are treated as unrestricted once the resource-level permission is available; this is an important policy convention when reviewing changes.

## Runtime and client use

The engine supports `can`, `canBatch`, `permittedActions`, `explain`, `resolvedRoles`, `canField`, and `permittedFields`. `snapshot.ts` can serialize permissions for `TorideClient`, which checks known resource/action pairs synchronously on the client. A snapshot is a hint for UI decisions, not a replacement for server-side authorization on mutations.

## Partial evaluation

For list authorization, use `buildConstraints` rather than loading every row and calling `can` repeatedly. The result has three meaningful states:

- `ok: false`: no access; return an empty result;
- `ok: true` with `constraint: null`: unrestricted; omit the database filter;
- `ok: true` with a constraint: translate and apply the filter.

Constraints may include field comparisons, logical combinations, relation checks, role-assignment checks, and always/never nodes. The `0.4.0` `ok`-based API is a key current behavior; older examples may use superseded result shapes.

## What to verify when changing policy behavior

Start with parser/validator tests for syntax and diagnostics, role and rule-engine tests for semantics, field-access tests for explicit restrictions, and partial-evaluation tests for query equivalence. Add a declarative integration test when a change spans resolution and evaluation.
