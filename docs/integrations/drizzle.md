---
description: Resource-scoped Drizzle bindings, intermediate operation descriptions, exact native consumer requirements, and resolver helpers.
---

# Drizzle integration

`@toride/drizzle` translates constraints into intermediate operation descriptions. Your application converts those descriptions into native Drizzle expressions. A description is not a SQL expression accepted by `.where()`.

## Install

```bash
pnpm add @toride/drizzle toride drizzle-orm
```

`drizzle-orm` is an optional peer for the package. The resolver helper uses it to create native column equality.

## Bind resource tables and relations

```typescript
import { createDrizzleAdapter } from "@toride/drizzle";
import { tasks, projects } from "./schema.js";

const adapter = createDrizzleAdapter(tasks, {
	resourceType: "Task",
	resources: { Project: projects },
	fields: { Task: { owner: "ownerId" } },
	relations: {
		Task: {
			project: {
				resourceType: "Project",
				cardinality: "one",
				sourceColumn: "projectId",
				targetColumn: "id",
			},
		},
	},
});
```
`resourceType` is required and identifies the root table. `resources` supplies tables used in related scopes. Native Drizzle column metadata determines scalar types and nullability. `fields` optionally maps a policy field to a physical column key.

Relations are scoped by their source resource. Each binding declares its target, physical join columns, and cardinality. Both one and many descriptions mean that a matching related row exists. The join columns must have compatible scalar types. The target must match the policy's declared target.

The generic positions remain `createDrizzleAdapter<S, TModelMap, TQueryMap>`. Pass the generated schema in the first position, the optional model map second, and your description query map third.

## Translate and lower before querying

```typescript
const result = await engine.buildConstraints(actor, "read", "Task");
if (!result.ok) return [];
if (result.constraint === null) {
	return db.select().from(tasks).orderBy(tasks.id).limit(20);
}
const description = engine.translateConstraints(result.constraint, adapter);
const predicate = toNativePredicate(description);
return db.select().from(tasks).where(predicate).orderBy(tasks.id).limit(20);
```
`toNativePredicate` is application code. It must implement every emitted operation or throw. Use its complete predicate for membership, counts, and pages before applying pagination. Do not replace unsupported operations with true or filter a fetched page afterward.

## Operation descriptions

Scalar descriptions carry their table, resource, and null behavior.

```typescript
{
	_op: "eq",
	field: "status",
	value: "active",
	table: projects,
	resourceType: "Project",
	nullable: true,
	nullBehavior: "false",
	stringComparison: "binary",
}
```
| Constraint | Operation |
| --- | --- |
| `field_eq`, `field_neq` | `eq`, `ne` |
| `field_gt`, `field_gte`, `field_lt`, `field_lte` | `gt`, `gte`, `lt`, `lte` |
| `field_in`, `field_nin` | `inArray`, `notInArray` |
| `field_exists` | `isNull`, `isNotNull` |
| `field_contains` | `contains` with a literal value |
| `field_starts_with` | `startsWith` with a literal value |
| `field_ends_with` | `endsWith` with a literal value |
| `and`, `or`, `not` | `children` or `child` descriptions |
| `always`, `never` | `literal` with a Boolean value |
| `relation` | Scoped existence with a complete `child` description |

Ordinary scalar comparisons are false at null. The native consumer must make them total before applying `not`. For example, lower nullable equality as `column IS NOT NULL AND column = value`. Presence uses total null tests. A relation still requires existence when its child is literal true. Alias repeated physical tables for each relation scope.

String operations describe JavaScript matching with `stringComparison: "binary"`. `contains`, `startsWith`, and `endsWith` keep literal values and remain distinct. A native consumer must prove the backend lowering or reject it. `LIKE` alone does not establish the required case, Unicode, and literal wildcard behavior. The locally verified SQLite lowering uses `instr` and `substr` for NUL-free valid Unicode strings. This bounded check does not guarantee every SQL backend or stored string domain.

Unbound fields, resources, or relations throw `UnsupportedConstraintError`. Nonnumeric ordering, unverified JSON operations, and native scalar-array membership are unsupported. Relevant custom conditions and legacy manual `has_role` nodes also throw.

## Virtual membership

Bind a virtual array to an explicit many relation.

```typescript
const adapter = createDrizzleAdapter(projects, {
	resourceType: "Project",
	resources: { Assignment: assignments },
	relations: {
		Project: {
			assignments: {
				resourceType: "Assignment",
				cardinality: "many",
				sourceColumn: "id",
				targetColumn: "projectId",
			},
		},
	},
	virtualFields: {
		Project: {
			viewer_ids: {
				relation: "assignments",
				matchField: "userId",
				filter: { role: "viewer" },
			},
		},
	},
});
```
The resolver array must correspond to exactly the related values selected by the filter. Virtual names remain scoped by resource. Stored assignment data is an application mapping, not an implicit role-assignment operation.

## Resolver helper

```typescript
import { createDrizzleResolver } from "@toride/drizzle";

const projectResolver = createDrizzleResolver(db, projects);
const resolverWithUuid = createDrizzleResolver(db, documents, { idColumn: "uuid" });
```
The helper validates the ID column and calls a native `eq(table[idColumn], ref.id)` query. It returns partial `ResolverData<S, R>` or `null` asynchronously. A missing row returns `null`. It does not pass a plain object to `.where()`, promise complete policy attributes, or construct relation refs from foreign keys.

## Verify local changes

Run the repository's real local SQLite query and public API checks from its root.

```bash
scripts/verification/verify.sh check queries /tmp/toride-query-evidence
scripts/verification/verify.sh check types-and-policy /tmp/toride-type-evidence
```

The commands build and import public packages, then compare literal expected IDs, counts, and pages with actual results. The type check compiles generated files with TypeScript. The full workflow is in `.claude/skills/verify-toride/SKILL.md` in the repository.

## Migration

Add the required `resourceType`, related resource tables, and source-scoped relation bindings. Replace `foreignKey` guesses with explicit `sourceColumn`, `targetColumn`, target, and cardinality. Remove implicit role-assignment configuration.

Update your native consumer for resource scope, constants, total null predicates, and distinct literal string operations. Return `null` for missing rows. Keep the intermediate description contract and the existing `buildConstraints()`, `translateConstraints()`, and `ok` flow.

See [partial evaluation](/concepts/partial-evaluation) and [Prisma integration](/integrations/prisma).
