// T019: Valibot schemas for full policy format

import * as v from "valibot";

// ─── Attribute Type ───────────────────────────────────────────────

export const AttributeTypeSchema = v.picklist(["string", "number", "boolean"]);

// ─── Actor Declaration ────────────────────────────────────────────

export const ActorDeclarationSchema = v.object({
  attributes: v.record(v.string(), AttributeTypeSchema),
});

// ─── Condition Value ──────────────────────────────────────────────

/** Operator-based condition value (right-hand side). */
const ConditionOperatorSchema = v.union([
  v.object({ eq: v.unknown() }),
  v.object({ neq: v.unknown() }),
  v.object({ gt: v.unknown() }),
  v.object({ gte: v.unknown() }),
  v.object({ lt: v.unknown() }),
  v.object({ lte: v.unknown() }),
  v.object({ in: v.union([v.array(v.unknown()), v.string()]) }),
  v.object({ includes: v.unknown() }),
  v.object({ exists: v.boolean() }),
  v.object({ startsWith: v.string() }),
  v.object({ endsWith: v.string() }),
  v.object({ contains: v.string() }),
  v.object({ custom: v.string() }),
]);

/**
 * ConditionValue: primitive (equality shorthand), cross-ref string, or operator.
 */
export const ConditionValueSchema: v.GenericSchema<unknown> = v.union([
  v.string(),
  v.number(),
  v.boolean(),
  ConditionOperatorSchema,
]);

// ─── Condition Expression (recursive via lazy) ────────────────────

/**
 * SimpleConditions: Record<string, ConditionValue> - all pairs ANDed.
 */
const SimpleConditionsSchema = v.record(v.string(), ConditionValueSchema);

/**
 * ConditionExpression: recursive type using lazy().
 * Either simple conditions, { any: [...] }, or { all: [...] }.
 */
export const ConditionExpressionSchema: v.GenericSchema<unknown> = v.union([
  v.object({ any: v.array(v.lazy(() => ConditionExpressionSchema)) }),
  v.object({ all: v.array(v.lazy(() => ConditionExpressionSchema)) }),
  SimpleConditionsSchema,
]);

// ─── Relation Definition ──────────────────────────────────────────

/** Simplified: relation value is just the target resource type name. */
export const RelationDefSchema = v.string();

// ─── Derived Role Entry ───────────────────────────────────────────

/**
 * DerivedRoleEntry: has a required `role` plus optional derivation fields.
 * Mutual exclusivity is enforced at cross-reference validation (T021).
 */
export const DerivedRoleEntrySchema = v.object({
  role: v.string(),
  from_global_role: v.optional(v.string()),
  from_role: v.optional(v.string()),
  on_relation: v.optional(v.string()),
  from_relation: v.optional(v.string()),
  actor_type: v.optional(v.string()),
  when: v.optional(ConditionExpressionSchema),
});

// ─── Rule ─────────────────────────────────────────────────────────

export const RuleSchema = v.object({
  effect: v.picklist(["permit", "forbid"]),
  roles: v.optional(v.array(v.string())),
  permissions: v.array(v.string()),
  when: ConditionExpressionSchema,
});

// ─── Field Access Definition ──────────────────────────────────────

export const FieldAccessDefSchema = v.object({
  read: v.optional(v.array(v.string())),
  update: v.optional(v.array(v.string())),
});

// ─── Resource Block ───────────────────────────────────────────────

export const ResourceBlockSchema = v.object({
  roles: v.array(v.string()),
  permissions: v.array(v.string()),
  attributes: v.optional(v.record(v.string(), AttributeTypeSchema)),
  relations: v.optional(v.record(v.string(), v.string())),
  grants: v.optional(v.record(v.string(), v.array(v.string()))),
  derived_roles: v.optional(v.array(DerivedRoleEntrySchema)),
  rules: v.optional(v.array(RuleSchema)),
  field_access: v.optional(v.record(v.string(), FieldAccessDefSchema)),
});

// ─── Global Role ──────────────────────────────────────────────────

export const GlobalRoleSchema = v.object({
  actor_type: v.string(),
  when: ConditionExpressionSchema,
});

// ─── Resource Ref (for test cases) ────────────────────────────────

export const ResourceRefSchema = v.object({
  type: v.string(),
  id: v.string(),
  attributes: v.optional(v.record(v.string(), v.unknown())),
});

// ─── Actor Ref (for test cases) ───────────────────────────────────

export const ActorRefSchema = v.object({
  type: v.string(),
  id: v.string(),
  attributes: v.record(v.string(), v.unknown()),
});

// ─── Test Case ────────────────────────────────────────────────────

export const TestCaseSchema = v.object({
  name: v.string(),
  actor: ActorRefSchema,
  resolvers: v.optional(v.record(v.string(), v.record(v.string(), v.unknown()))),
  action: v.string(),
  resource: ResourceRefSchema,
  expected: v.picklist(["allow", "deny"]),
});

// ─── Policy (top-level) ───────────────────────────────────────────

export const PolicySchema = v.object({
  version: v.literal("1"),
  actors: v.record(v.string(), ActorDeclarationSchema),
  global_roles: v.optional(v.record(v.string(), GlobalRoleSchema)),
  resources: v.record(v.string(), ResourceBlockSchema),
  tests: v.optional(v.array(TestCaseSchema)),
});

// ─── Test File (separate .test.yaml) ────────────────────────────────

export const TestFileSchema = v.object({
  policy: v.string(),
  tests: v.array(TestCaseSchema),
});
