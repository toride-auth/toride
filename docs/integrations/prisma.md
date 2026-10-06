---
description: Explicit Prisma field, relation, and virtual mappings, truthful partial resolvers, and exact-query limits.
---

# Prisma integration

`@toride/prisma` translates Toride constraints into Prisma `where` objects. Configure the physical fields and relations used by your policy before translating.

## Install

```bash
pnpm add @toride/prisma toride
```

The adapter does not import `@prisma/client`. Your application supplies its client and can supply model payload types for mapping checks.

## Bind fields and relations

This example assumes a policy with `Project.status`, `Project.archived`, and `Task.project: Project`.

```typescript
import { createPrismaAdapter } from "@toride/prisma";
import type { GeneratedSchema } from "./generated/policy.js";

const adapter = createPrismaAdapter<GeneratedSchema>({
	fields: {
		Project: {
			id: { field: "id", type: "string", nullable: false, stringComparison: "binary" },
			status: { field: "status", type: "string", nullable: false, stringComparison: "binary" },
			archived: { field: "archived", type: "boolean", nullable: false },
		},
		Task: {
			id: { field: "id", type: "string", nullable: false, stringComparison: "binary" },
		},
	},
	relations: {
		Task: {
			project: { field: "project", resourceType: "Project", cardinality: "one" },
		},
	},
});
```
Each field binding declares its physical name, scalar type, and nullability. String equality and membership require `stringComparison: "binary"`. This asserts case-sensitive JavaScript-compatible equality without collation normalization and well-formed Unicode data without NUL.

Relation bindings are scoped by source resource. The target must match the policy, and `cardinality` declares the physical relation as `"one"` or `"many"`. One uses Prisma `is`; many uses `some`. Both require a related row satisfying the complete child predicate.

The optional second generic parameter supplies model payloads, such as `{ Project: Prisma.$ProjectPayload; Task: Prisma.$TaskPayload }`. These types check physical scalar names, nullability, relation fields, and cardinality. Include actor model payloads when an actor-only relation target needs fields such as `User.id`.

## Query, count, and page

```typescript
const result = await engine.buildConstraints(actor, "read", "Project");
if (!result.ok) return { total: 0, rows: [] };
const where = result.constraint === null
	? undefined
	: engine.translateConstraints(result.constraint, adapter);
const [total, rows] = await prisma.$transaction([
	prisma.project.count({ where }),
	prisma.project.findMany({ where, orderBy: { id: "asc" }, take: 20 }),
]);
return { total, rows };
```
Translate before querying. Use the same complete predicate for counts and pages. `UnsupportedConstraintError` means this list query cannot be translated exactly. Do not substitute an empty filter or filter a fetched page afterward.

## Virtual membership

A virtual array can correspond to rows in an explicit physical relation. For a policy that declares `Project.viewer_ids` as a string array, add this option to `createPrismaAdapter()`.

```typescript
virtualFields: {
	Project: {
		viewer_ids: {
			relation: "roleAssignments",
			matchField: "userId",
			filter: { role: "viewer" },
			cardinality: "many",
			valueType: "string",
			stringComparison: "binary",
		},
	},
}
```
This mapping compiles membership to `roleAssignments.some` with the supplied filter. The mapping asserts that the resolver's array contains exactly those related values. It does not create an implicit role-assignment API. The same virtual name on another resource can have a different mapping.

## Scalar and string limits

Ordinary comparisons exclude null. A negated comparison includes the complement of that complete predicate, including null rows when appropriate. `field_exists` tests physical null presence. Ordered comparisons support numeric fields. Native scalar-array membership and unverified JSON or field-to-field operations are unsupported.

`contains`, `startsWith`, and `endsWith` remain separate Prisma filters. They require `stringFilters: "javascript"` on the field binding in addition to binary equality. Set that assertion only when your provider, connection settings, and stored strings have the same matching behavior as JavaScript. Patterns containing `%`, `_`, a backslash, or NUL are rejected. There is no universal provider guarantee. Without that assertion, string filters throw.

## Resolver helper

```typescript
import { createPrismaResolver } from "@toride/prisma";

const projectResolver = createPrismaResolver<GeneratedSchema, "Project", "project">(
	prisma,
	"project",
	{ select: { status: true, archived: true } },
);
```
The helper calls `findUnique({ where: { id: ref.id }, select })`. It returns `ResolverData<GeneratedSchema, "Project"> | null` asynchronously. A missing row returns `null`. Selected-out attributes are unavailable. The helper does not claim complete policy attributes or create relation refs from foreign keys. Use a custom typed resolver for virtual arrays and declared relation refs.

## Verify local changes

Run the repository's real local SQLite query and public API checks from its root.

```bash
scripts/verification/verify.sh check queries /tmp/toride-query-evidence
scripts/verification/verify.sh check types-and-policy /tmp/toride-type-evidence
```

The commands build and import public packages, then compare literal expected IDs, counts, and pages with actual results. The type check compiles generated files with TypeScript. The full workflow is in `.claude/skills/verify-toride/SKILL.md` in the repository.

## Migration

Replace the old flat `relationMapping` option with source-scoped `relations` and explicit target and cardinality. Add `fields` for every scalar used by a relevant constraint, including IDs used by relation identity. Remove implicit `roleAssignmentTable` and `roleAssignmentFields` options. Represent stored assignments through policy attributes and explicit virtual mappings instead.

Add scalar and cardinality semantics to virtual mappings. Return `null` for missing rows and regenerate resolver bindings. Keep `buildConstraints()`, `translateConstraints()`, and the `ok` result branches.

See [partial evaluation](/concepts/partial-evaluation) and [resolvers](/concepts/resolvers).
