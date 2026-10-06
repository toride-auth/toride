---
description: Exact authorization constraints, resource-scoped translation, unsupported operations, and correct count and pagination.
---

# Partial evaluation

`buildConstraints()` compiles an authorization decision for a resource type. `translateConstraints()` converts the resulting constraint into your adapter's query representation. The public call flow remains the same.

## Query with the result

```typescript
const result = await engine.buildConstraints(actor, "read", "Project", {
	env: { tenantId },
});

if (!result.ok) return [];

const where = result.constraint === null
	? undefined
	: engine.translateConstraints(result.constraint, adapter);

return prisma.project.findMany({ where, orderBy: { id: "asc" }, take: 20 });
```

| Result | Meaning |
| --- | --- |
| `{ ok: false }` | No resource satisfies this authorization decision |
| `{ ok: true, constraint: null }` | The decision imposes no resource filter |
| `{ ok: true, constraint }` | Apply the complete translated predicate |

A constrained result contains `ResourceConstraint<R>`. Its required `rootResourceType` preserves the resource type when you extract `result.constraint`. Translation infers the result's resource from that input. A manually constructed unscoped AST is rejected.

## Exactness and data correspondence

The compiler combines grants, permit rules, role guards, and forbids using the same condition semantics as runtime. Access requires a true grant or permit and false forbids. Missing actor or environment values are unavailable. They do not disappear from a conjunction or disable a forbid.

Related roles compile the target resource's actual derivations recursively. They do not imply a role-assignment table. A relation node means that a related row exists and satisfies its complete child predicate. Even an `always` child still requires that row to exist. Separate conditions on a many relation can match different rows. A related role's complete condition stays within one row.

An adapter mapping asserts that complete database values correspond to the declared resolver observations. Query translation does not compile arbitrary asynchronous resolver code or reproduce external-service failures. Compare query results and runtime decisions against the same complete database snapshot.

Apply authorization before `take`, `skip`, `limit`, or `offset`. Use the same predicate for membership, counts, and pages. Filtering a fetched page in application code cannot establish an authorized count or complete page.

```typescript
if (!result.ok) return { total: 0, rows: [] };
const where = result.constraint === null
	? undefined
	: engine.translateConstraints(result.constraint, adapter);
const [total, rows] = await prisma.$transaction([
	prisma.project.count({ where }),
	prisma.project.findMany({ where, orderBy: { id: "asc" }, skip: 20, take: 20 }),
]);
return { total, rows };
```

## Unsupported constraints

Standard translation returns a complete predicate or throws `UnsupportedConstraintError`. Translate before issuing the database query. A relevant custom condition, unbound expression, unverified field-to-field comparison, recursive role schema, or unsupported adapter operation cannot become an unrestricted filter.

Do not catch a translation error and substitute `{}`. Handle the error as an unsupported authorized-list operation, or change the policy or mapping to a supported exact form. Runtime `can()` remains available for individual decisions.

## Constraint nodes

| Node | Meaning |
| --- | --- |
| `field_eq`, `field_neq` | Equality and inequality |
| `field_gt`, `field_gte`, `field_lt`, `field_lte` | Ordered comparison |
| `field_in`, `field_nin` | Membership and negative membership |
| `field_exists` | Known presence or known absence |
| `field_includes` | Scalar-array or explicitly mapped virtual membership |
| `field_contains` | Literal substring |
| `field_starts_with` | Literal prefix |
| `field_ends_with` | Literal suffix |
| `and`, `or`, `not` | Logical composition |
| `relation` | `quantifier: "any"` over a declared target resource |
| `always`, `never` | Constants, including inside relations |

Legacy manual `has_role` and `unknown` nodes throw during translation. The compiler can retain an `unknown` node for a relevant custom condition, which also throws. Standard adapters never infer assignment storage or ignore unknown conditions.

## Adapter contract

Every callback receives a `ConstraintContext` as its final argument. `context.resourceType` selects the current model's field, relation, and virtual-field mappings. Relation children switch to the declared target context. The relation callback receives its source context.

```typescript
interface ConstraintAdapter<TQueryMap extends Record<string, unknown>> {
	translate(constraint: LeafConstraint, context: ConstraintContext): TQueryMap[string];
	relation(field: string, resourceType: string, childQuery: TQueryMap[string], context: ConstraintContext): TQueryMap[string];
	and(queries: TQueryMap[string][], context: ConstraintContext): TQueryMap[string];
	or(queries: TQueryMap[string][], context: ConstraintContext): TQueryMap[string];
	not(query: TQueryMap[string], context: ConstraintContext): TQueryMap[string];
	always(context: ConstraintContext): TQueryMap[string];
	never(context: ConstraintContext): TQueryMap[string];
}
```

Custom adapters must implement total Boolean predicates. Ordinary comparisons are false at null. Negation complements that total predicate, so the complement of equality to a non-null value includes null rows. Raw SQL `NOT (nullable_column = value)` does not implement this contract.

Relations require explicit source, target, physical field or join, and cardinality mappings. Policy relation declarations remain strings. Per-resource virtual fields stay scoped, so two resources can map the same virtual field name differently.

`contains`, `startsWith`, and `endsWith` remain distinct. A database's case rules, Unicode behavior, collation, and wildcard syntax can differ from JavaScript. Adapters or native query consumers must reject operations whose exact lowering is not established.

See the [Prisma adapter](/integrations/prisma) and [Drizzle operation descriptions](/integrations/drizzle) for supported mappings and limits.

## Migration

Keep the `can()`, `explain()`, `buildConstraints()`, `translateConstraints()`, and `ok` branches. Preserve `rootResourceType` when you store or pass a constraint. Add scoped adapter mappings and migrate custom adapters to context and constant callbacks, with distinct prefix and suffix leaves. Remove `hasRole` and `unknown` callbacks. Handle unsupported translation errors before querying.

Use explicit `null` for known absence. A missing required actor or environment value is indeterminate. See [conditions and rules](/concepts/conditions-and-rules#strict-null-semantics) and [resolver migration](/concepts/resolvers#migration).
