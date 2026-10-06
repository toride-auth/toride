---
description: Partial resolver data, inline attributes, declared relation targets, and the difference between unavailable data and known absence.
---

# Resolvers

A resolver supplies attributes and relation refs when a decision needs resource data. Register a resolver for each resource type that needs a data source. If all required data is inline, you can omit the resolver.

## Inline attributes

`ResourceRef.attributes` accepts partial schema-derived data. The engine uses inline fields before resolver fields. A resolver fills fields that the inline ref does not provide.

```typescript
const allowed = await engine.can(actor, "read", {
	type: "Document",
	id: "doc-1",
	attributes: { status: "published" },
});
```

An omitted field or an `undefined` value is unavailable. An explicit `null` is known absence. These meanings apply to inline data, resolver data, actor attributes, and environment values.

## Registered resolvers

`ResourceResolver<S, R>` returns `Promise<ResolverData<S, R> | null>`. `ResolverData` contains partial declared attributes and optional declared relation refs. `Resolvers<S>` maps resource types to these functions.

```typescript
import type { Resolvers } from "toride";
import type { GeneratedSchema } from "./generated/policy.js";

const resolvers: Resolvers<GeneratedSchema> = {
	Document: async (ref) => {
		const doc = await db.documents.findById(ref.id);
		if (!doc) return null;
		return {
			status: doc.status,
			org: doc.orgId ? { type: "Organization", id: doc.orgId } : null,
		};
	},
};
```

Return `null` when the resource does not exist. Return a partial object when a projection supplies only some fields. A selected-out field remains unavailable. An empty object does not establish that the resource or its fields are absent.

A resolver is called at most once for each resource identity within a decision. Policies that use only actor data do not require an eager resource lookup. Check resource existence in your application when an operation requires an existing row.

## Relation refs

A declared relation accepts one ref, a readonly array of refs, or `null`. The ref's `type` must match the target declared in the policy. Actor types can be relation targets, such as `Task.assignee: User`, without becoming resolver-map keys.

```typescript
return {
	project: { type: "Project", id: task.projectId },
	assignee: task.assigneeId ? { type: "User", id: task.assigneeId } : null,
};
```

Generated types reject a wrong target. Runtime validation checks every ref, including refs supplied inline. A malformed ref or wrong target makes the observation indeterminate. The engine never follows a different target policy to grant access.

## Missing data and failures

Unavailable data does not satisfy either `exists: true` or `exists: false`. Use explicit `null` for known absence. Ordinary comparisons against known absence are false, including equality and inequality.

Resolver errors, invalid relation data, cycles, depth failures, and missing custom evaluators make the affected condition indeterminate. Access requires a true permit or grant and a false forbid. A relevant indeterminate forbid prevents access. `explain()` reports diagnostic codes and paths.

See [conditions and rules](/concepts/conditions-and-rules#strict-null-semantics) for logical combination rules.

## Merge and cache scope

Inline fields take precedence over resolver fields for the same ref. Within one decision, contradictory inline observations for the same identity are rejected. Treat inline data as trusted authorization input.

`permittedActions()` captures one policy and uses a separate resolver and absence cache for each action. Cache isolation can increase resolver requests while preserving individual `can()` decisions.

`canBatch()` evaluates each item with an independent cache because a resolver can inspect the entire ref, including inline data. Batch results therefore follow individual decisions without depending on item order. This can increase resolver requests. Cache data in your own data layer only when its keys capture every input that affects the result.

## Migration

Regenerate policy bindings to obtain `ResolverMap = Resolvers<GeneratedSchema>`. Return `null` for a missing row. Preserve `null` values for known absent fields and include every field needed by a rule. Replace omitted values used with `exists: false` with explicit absence. Correct refs whose targets differ from the policy declaration.

See [code generation](/integrations/codegen), [roles and relations](/concepts/roles-and-relations), and [partial evaluation](/concepts/partial-evaluation).
