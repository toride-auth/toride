// T057: buildConstraints() implementation
// T058: $actor and $env value inlining
// T059: has_role constraint node emission
// T060: Forbid rule application as NOT constraints
// T061: Constraint simplification
// T062: Unknown constraint node emission for custom evaluators

import type {
  ActorRef,
  RelationResolver,
  Policy,
  ResourceBlock,
  DerivedRoleEntry,
  Rule,
  ConditionExpression,
  ConditionValue,
  ConditionOperator,
  CheckOptions,
} from "../types.js";
import type {
  Constraint,
  ConstraintResult,
} from "./constraint-types.js";

// ─── Module-level operator key set ────────────────────────────────

const OPERATOR_KEYS = new Set([
  "eq", "neq", "gt", "gte", "lt", "lte",
  "in", "includes", "exists",
  "startsWith", "endsWith", "contains",
  "custom",
]);

// ─── Public API ───────────────────────────────────────────────────

/**
 * T057: Build constraint AST for partial evaluation.
 *
 * Evaluates all derivation paths for the actor/action/resourceType,
 * emits constraints per path, combines with OR, simplifies,
 * and returns ConstraintResult.
 */
export async function buildConstraints(
  actor: ActorRef,
  action: string,
  resourceType: string,
  resolver: RelationResolver,
  policy: Policy,
  options?: CheckOptions & {
    maxDerivedRoleDepth?: number;
    customEvaluators?: Record<string, unknown>;
  },
): Promise<ConstraintResult> {
  const resourceBlock = policy.resources[resourceType];
  if (!resourceBlock) {
    return { forbidden: true };
  }

  const env = options?.env ?? {};

  // Step 1: Find which roles grant the requested action
  const rolesGrantingAction = findRolesGrantingAction(action, resourceBlock);
  if (rolesGrantingAction.length === 0) {
    // Check if any permit rule could grant this action
    const permitRules = (resourceBlock.rules ?? []).filter(
      (r) => r.effect === "permit" && r.permissions.includes(action),
    );
    if (permitRules.length === 0) {
      return { forbidden: true };
    }
  }

  // Step 2: Evaluate all derivation paths to collect constraints
  const pathConstraints: Constraint[] = [];

  // For each role that grants the action, evaluate derivation paths
  for (const role of rolesGrantingAction) {
    const derivedEntries = resourceBlock.derived_roles ?? [];
    for (const entry of derivedEntries) {
      if (entry.role !== role) continue;

      const constraint = await evaluateDerivedRoleConstraint(
        entry,
        actor,
        resourceType,
        resolver,
        policy,
        resourceBlock,
        env,
      );

      if (constraint !== null) {
        pathConstraints.push(constraint);
      }
    }
  }

  // Step 3: If no derivation paths produced any constraints, check for permit rules
  // that might still grant access (without role requirements)
  const permitRules = (resourceBlock.rules ?? []).filter(
    (r) => r.effect === "permit" && r.permissions.includes(action),
  );

  // If we have derivation paths that matched, we need to consider permit rules too
  // Permit rules with role guards need the role to already be derivable
  for (const rule of permitRules) {
    if (rule.roles && rule.roles.length > 0) {
      // Check if any of the required roles have derivation paths
      const hasDerivablePath = rule.roles.some((role) => {
        // Check if this role is directly derivable
        return pathConstraints.length > 0 || rolesGrantingAction.includes(role);
      });
      if (!hasDerivablePath) continue;
    }

    // For permit rules, the rule condition becomes a constraint on the resource
    const ruleConstraint = conditionToConstraint(rule.when, actor, env);
    if (ruleConstraint !== null) {
      // If the rule has role guards, combine with role derivation constraints
      if (rule.roles && rule.roles.length > 0) {
        // The rule applies when: (actor has one of the roles) AND (condition matches)
        // We already know derivation paths exist, so wrap in AND
        const roleConstraints: Constraint[] = [];
        for (const role of rule.roles) {
          for (const entry of resourceBlock.derived_roles ?? []) {
            if (entry.role !== role) continue;
            const rc = await evaluateDerivedRoleConstraint(
              entry, actor, resourceType, resolver, policy, resourceBlock, env,
            );
            if (rc !== null) roleConstraints.push(rc);
          }
        }
        if (roleConstraints.length > 0) {
          pathConstraints.push(
            simplify({
              type: "and",
              children: [
                roleConstraints.length === 1 ? roleConstraints[0] : { type: "or", children: roleConstraints },
                ruleConstraint,
              ],
            }),
          );
        }
      } else {
        // No role guard: if the actor has any derivable role, apply the permit condition
        if (pathConstraints.length > 0) {
          pathConstraints.push(ruleConstraint);
        }
      }
    }
  }

  // If no paths produced constraints, it's forbidden
  if (pathConstraints.length === 0) {
    return { forbidden: true };
  }

  // Step 4: Combine all path constraints with OR
  let combined: Constraint;
  if (pathConstraints.length === 1) {
    combined = pathConstraints[0];
  } else {
    combined = { type: "or", children: pathConstraints };
  }

  // Step 5: Apply forbid rules as NOT constraints
  const forbidRules = (resourceBlock.rules ?? []).filter(
    (r) => r.effect === "forbid" && r.permissions.includes(action),
  );

  for (const rule of forbidRules) {
    const forbidConstraint = conditionToConstraint(rule.when, actor, env);
    if (forbidConstraint !== null) {
      // Forbid wraps the combined result: combined AND NOT(forbid_condition)
      combined = {
        type: "and",
        children: [combined, { type: "not", child: forbidConstraint }],
      };
    }
  }

  // Step 6: Simplify
  combined = simplify(combined);

  // Step 7: Return result based on simplified constraint
  if (combined.type === "always") {
    return { unrestricted: true };
  }
  if (combined.type === "never") {
    return { forbidden: true };
  }

  return { constraints: combined };
}

// ─── Role Grant Resolution ────────────────────────────────────────

/**
 * Find all roles that grant the requested action.
 */
function findRolesGrantingAction(
  action: string,
  resourceBlock: ResourceBlock,
): string[] {
  const grants = resourceBlock.grants ?? {};
  const roles: string[] = [];

  for (const [role, permissions] of Object.entries(grants)) {
    if (permissions.includes(action) || permissions.includes("all")) {
      roles.push(role);
    }
  }

  return roles;
}

// ─── Derived Role Constraint Evaluation ───────────────────────────

/**
 * T059: Evaluate a derived role entry and produce a constraint.
 * Returns null if the derivation path cannot produce access.
 * Returns `always` if the path unconditionally grants access.
 */
async function evaluateDerivedRoleConstraint(
  entry: DerivedRoleEntry,
  actor: ActorRef,
  resourceType: string,
  resolver: RelationResolver,
  policy: Policy,
  resourceBlock: ResourceBlock,
  env: Record<string, unknown>,
): Promise<Constraint | null> {
  // Pattern 1: from_global_role
  if (entry.from_global_role !== undefined) {
    return evaluateGlobalRoleConstraint(entry, actor, policy);
  }

  // Pattern 2: from_role + on_relation
  if (entry.from_role !== undefined && entry.on_relation !== undefined) {
    return evaluateRelationRoleConstraint(entry, actor, resourceBlock, policy);
  }

  // Pattern 3: from_relation (identity check)
  if (entry.from_relation !== undefined) {
    return evaluateRelationIdentityConstraint(entry, actor, resourceBlock);
  }

  // Pattern 4: actor_type + when
  if (entry.actor_type !== undefined && entry.when !== undefined) {
    return evaluateActorTypeConstraint(entry, actor, env);
  }

  // Pattern 5: when only
  if (entry.when !== undefined) {
    return evaluateWhenOnlyConstraint(entry, actor, env);
  }

  return null;
}

// ─── Pattern 1: Global Role ──────────────────────────────────────

function evaluateGlobalRoleConstraint(
  entry: DerivedRoleEntry,
  actor: ActorRef,
  policy: Policy,
): Constraint | null {
  const globalRoleName = entry.from_global_role!;
  const globalRole = policy.global_roles?.[globalRoleName];
  if (!globalRole) return null;

  // Check actor type match
  if (actor.type !== globalRole.actor_type) return null;

  // Evaluate the when condition against actor attributes
  if (!evaluateActorCondition(globalRole.when, actor)) return null;

  // Global role matched - this path grants unconditional access
  return { type: "always" };
}

// ─── Pattern 2: Relation-based Role ──────────────────────────────

/**
 * T059: Emit has_role constraint for relation-based derived roles.
 */
function evaluateRelationRoleConstraint(
  entry: DerivedRoleEntry,
  actor: ActorRef,
  resourceBlock: ResourceBlock,
  policy: Policy,
): Constraint | null {
  const relationName = entry.on_relation!;
  const requiredRole = entry.from_role!;

  // Look up the relation definition to get the FK field and target type
  const relationDef = resourceBlock.relations?.[relationName];
  if (!relationDef) return null;

  const targetResourceType = relationDef.resource;

  // Emit a relation constraint wrapping a has_role constraint
  // This tells the adapter: "the related resource must have a role assignment for this actor"
  return {
    type: "relation",
    field: relationName,
    resourceType: targetResourceType,
    constraint: {
      type: "has_role",
      actorId: actor.id,
      actorType: actor.type,
      role: requiredRole,
    },
  };
}

// ─── Pattern 3: Relation Identity ────────────────────────────────

function evaluateRelationIdentityConstraint(
  entry: DerivedRoleEntry,
  actor: ActorRef,
  resourceBlock: ResourceBlock,
): Constraint | null {
  const relationName = entry.from_relation!;

  // Look up the relation definition
  const relationDef = resourceBlock.relations?.[relationName];
  if (!relationDef) {
    // If no explicit relation def, emit a field_eq on the relation name as FK
    return {
      type: "field_eq",
      field: relationName,
      value: actor.id,
    };
  }

  // The actor's ID must match the relation target
  // This produces a relation constraint or a direct field_eq on the FK
  return {
    type: "relation",
    field: relationName,
    resourceType: relationDef.resource,
    constraint: {
      type: "and",
      children: [
        { type: "field_eq", field: "id", value: actor.id },
        { type: "field_eq", field: "type", value: actor.type },
      ],
    },
  };
}

// ─── Pattern 4: Actor Type + When ────────────────────────────────

function evaluateActorTypeConstraint(
  entry: DerivedRoleEntry,
  actor: ActorRef,
  env: Record<string, unknown>,
): Constraint | null {
  // Skip if actor type doesn't match
  if (actor.type !== entry.actor_type) return null;

  // Evaluate condition against actor attributes
  if (!evaluateActorCondition(entry.when!, actor)) return null;

  // Condition matched on actor attributes - unconditional access
  return { type: "always" };
}

// ─── Pattern 5: When Only ────────────────────────────────────────

function evaluateWhenOnlyConstraint(
  entry: DerivedRoleEntry,
  actor: ActorRef,
  env: Record<string, unknown>,
): Constraint | null {
  // Evaluate condition against actor attributes only
  if (!evaluateActorCondition(entry.when!, actor)) return null;

  // Condition matched - unconditional access
  return { type: "always" };
}

// ─── Condition to Constraint Conversion ───────────────────────────

/**
 * T058: Convert a condition expression to a constraint, inlining
 * $actor and $env values. $resource references become field constraints.
 */
function conditionToConstraint(
  condition: ConditionExpression,
  actor: ActorRef,
  env: Record<string, unknown>,
): Constraint | null {
  // Handle logical combinators
  if ("any" in condition && Array.isArray((condition as { any: unknown }).any)) {
    const items = (condition as { any: ConditionExpression[] }).any;
    const children: Constraint[] = [];
    for (const item of items) {
      const child = conditionToConstraint(item, actor, env);
      if (child !== null) children.push(child);
    }
    if (children.length === 0) return null;
    if (children.length === 1) return children[0];
    return { type: "or", children };
  }

  if ("all" in condition && Array.isArray((condition as { all: unknown }).all)) {
    const items = (condition as { all: ConditionExpression[] }).all;
    const children: Constraint[] = [];
    for (const item of items) {
      const child = conditionToConstraint(item, actor, env);
      if (child !== null) children.push(child);
    }
    if (children.length === 0) return { type: "always" };
    if (children.length === 1) return children[0];
    return { type: "and", children };
  }

  // Simple conditions: all key-value pairs ANDed together
  const entries = Object.entries(condition as Record<string, ConditionValue>);
  const children: Constraint[] = [];

  for (const [key, conditionValue] of entries) {
    const constraint = pairToConstraint(key, conditionValue, actor, env);
    if (constraint !== null) {
      children.push(constraint);
    }
  }

  if (children.length === 0) return { type: "always" };
  if (children.length === 1) return children[0];
  return { type: "and", children };
}

/**
 * Convert a single condition key-value pair to a constraint.
 * T058: Inlines $actor and $env values.
 */
function pairToConstraint(
  key: string,
  conditionValue: ConditionValue,
  actor: ActorRef,
  env: Record<string, unknown>,
): Constraint | null {
  // Determine if the key references $actor, $resource, or $env
  if (key.startsWith("$actor.")) {
    // The left side references actor attribute - we know the value at partial eval time
    const attrPath = key.slice(7);
    const actorValue = getNestedAttribute(actor.attributes, attrPath);

    if (isOperator(conditionValue)) {
      // $actor.x: { operator: value }
      // Evaluate at partial eval time if possible
      return evaluateActorOperatorConstraint(actorValue, conditionValue, actor, env);
    }

    // Equality shorthand
    const rightValue = resolveStaticValue(conditionValue, actor, env);
    if (rightValue === undefined || rightValue === null) return null;
    if (actorValue === undefined || actorValue === null) return null;

    // Both sides are known at partial eval time
    return actorValue === rightValue ? { type: "always" } : { type: "never" };
  }

  if (key.startsWith("$resource.")) {
    // The left side is a resource attribute - becomes a constraint on the resource
    const field = key.slice(10); // Remove "$resource."

    if (isOperator(conditionValue)) {
      return operatorToConstraint(field, conditionValue, actor, env);
    }

    // Equality shorthand
    const rightValue = resolveStaticValue(conditionValue, actor, env);
    if (rightValue === undefined || rightValue === null) return null;

    return { type: "field_eq", field, value: rightValue };
  }

  if (key.startsWith("$env.")) {
    // The left side is an env value - known at partial eval time
    const envPath = key.slice(5);
    const envValue = env[envPath];
    if (envValue === undefined || envValue === null) return null;

    if (isOperator(conditionValue)) {
      return evaluateActorOperatorConstraint(envValue, conditionValue, actor, env);
    }

    const rightValue = resolveStaticValue(conditionValue, actor, env);
    if (rightValue === undefined || rightValue === null) return null;

    return envValue === rightValue ? { type: "always" } : { type: "never" };
  }

  return null;
}

/**
 * Convert an operator condition on a resource field to a constraint.
 */
function operatorToConstraint(
  field: string,
  operator: ConditionOperator,
  actor: ActorRef,
  env: Record<string, unknown>,
): Constraint | null {
  const op = operator as Record<string, unknown>;
  const opKey = Object.keys(op)[0];
  const opValue = op[opKey];

  // T062: Custom evaluator -> unknown node
  if (opKey === "custom") {
    return { type: "unknown", name: opValue as string };
  }

  // exists operator
  if (opKey === "exists") {
    return { type: "field_exists", field, exists: opValue as boolean };
  }

  // Resolve the right-side value (may be a cross-reference)
  const resolvedValue = resolveStaticValue(opValue as ConditionValue, actor, env);

  switch (opKey) {
    case "eq":
      return { type: "field_eq", field, value: resolvedValue };
    case "neq":
      return { type: "field_neq", field, value: resolvedValue };
    case "gt":
      return { type: "field_gt", field, value: resolvedValue };
    case "gte":
      return { type: "field_gte", field, value: resolvedValue };
    case "lt":
      return { type: "field_lt", field, value: resolvedValue };
    case "lte":
      return { type: "field_lte", field, value: resolvedValue };
    case "in":
      if (Array.isArray(resolvedValue)) {
        return { type: "field_in", field, values: resolvedValue };
      }
      return { type: "field_in", field, values: [resolvedValue] };
    case "includes":
      return { type: "field_includes", field, value: resolvedValue };
    case "startsWith":
    case "endsWith":
    case "contains":
      return { type: "field_contains", field, value: resolvedValue as string };
    default:
      return null;
  }
}

/**
 * Evaluate an operator on a known left-side value (actor/env).
 * Returns always/never if both sides are known.
 */
function evaluateActorOperatorConstraint(
  leftValue: unknown,
  operator: ConditionOperator,
  actor: ActorRef,
  env: Record<string, unknown>,
): Constraint | null {
  const op = operator as Record<string, unknown>;
  const opKey = Object.keys(op)[0];
  const opValue = op[opKey];

  if (opKey === "custom") {
    return { type: "unknown", name: opValue as string };
  }

  if (opKey === "exists") {
    const exists = leftValue !== undefined && leftValue !== null;
    return (opValue === true ? exists : !exists) ? { type: "always" } : { type: "never" };
  }

  const resolvedRight = resolveStaticValue(opValue as ConditionValue, actor, env);

  if (leftValue === undefined || leftValue === null) return { type: "never" };
  if (resolvedRight === undefined || resolvedRight === null) return { type: "never" };

  let result: boolean;
  switch (opKey) {
    case "eq": result = leftValue === resolvedRight; break;
    case "neq": result = leftValue !== resolvedRight; break;
    case "gt": result = (leftValue as number) > (resolvedRight as number); break;
    case "gte": result = (leftValue as number) >= (resolvedRight as number); break;
    case "lt": result = (leftValue as number) < (resolvedRight as number); break;
    case "lte": result = (leftValue as number) <= (resolvedRight as number); break;
    case "in":
      result = Array.isArray(resolvedRight) ? resolvedRight.includes(leftValue) : false;
      break;
    case "includes":
      result = Array.isArray(leftValue) ? (leftValue as unknown[]).includes(resolvedRight) : false;
      break;
    default: return null;
  }

  return result ? { type: "always" } : { type: "never" };
}

// ─── Static Value Resolution ─────────────────────────────────────

/**
 * T058: Resolve a value at partial evaluation time.
 * Cross-references to $actor and $env are inlined.
 * $resource references cannot be resolved statically.
 */
function resolveStaticValue(
  value: ConditionValue,
  actor: ActorRef,
  env: Record<string, unknown>,
): unknown {
  if (typeof value === "string") {
    if (value.startsWith("$actor.")) {
      const attrPath = value.slice(7);
      return getNestedAttribute(actor.attributes, attrPath);
    }
    if (value.startsWith("$env.")) {
      const envPath = value.slice(5);
      return env[envPath];
    }
    if (value.startsWith("$resource.")) {
      // Resource references cannot be resolved at partial eval time
      // This should not normally happen as a right-side value
      return value;
    }
  }
  return value;
}

/**
 * Get a nested attribute from an object using dot-separated path.
 */
function getNestedAttribute(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

// ─── Actor Condition Evaluation ───────────────────────────────────

/**
 * Evaluate a condition expression against actor attributes at partial eval time.
 * Returns true if the condition is satisfied by the actor's known attributes.
 */
function evaluateActorCondition(
  condition: ConditionExpression,
  actor: ActorRef,
): boolean {
  // Handle logical combinators
  if ("any" in condition && Array.isArray((condition as { any: unknown }).any)) {
    return ((condition as { any: ConditionExpression[] }).any).some((c) =>
      evaluateActorCondition(c, actor),
    );
  }
  if ("all" in condition && Array.isArray((condition as { all: unknown }).all)) {
    return ((condition as { all: ConditionExpression[] }).all).every((c) =>
      evaluateActorCondition(c, actor),
    );
  }

  // Simple conditions
  const entries = Object.entries(condition as Record<string, unknown>);
  for (const [key, expectedValue] of entries) {
    if (key.startsWith("$actor.")) {
      const attrName = key.slice(7);
      const actualValue = getNestedAttribute(actor.attributes, attrName);
      if (actualValue === undefined || actualValue === null) return false;
      if (actualValue !== expectedValue) return false;
    }
    // $resource and $env conditions can't be fully evaluated during derivation
    // but for actor-only conditions (patterns 1, 4, 5), we only have $actor refs
  }

  return true;
}

// ─── Operator Detection ───────────────────────────────────────────

function isOperator(value: ConditionValue): value is ConditionOperator {
  if (typeof value !== "object" || value === null) return false;
  const keys = Object.keys(value as object);
  return keys.length === 1 && OPERATOR_KEYS.has(keys[0]);
}

// ─── Constraint Simplification ────────────────────────────────────

/**
 * T061: Simplify a constraint AST.
 *
 * Rules:
 * - and([]) -> always
 * - or([]) -> never
 * - and([X]) -> X
 * - or([X]) -> X
 * - and([always, X]) -> X
 * - and([never, ...]) -> never
 * - or([always, ...]) -> always
 * - or([never, X]) -> X
 * - not(always) -> never
 * - not(never) -> always
 * - not(not(X)) -> X
 */
export function simplify(constraint: Constraint): Constraint {
  switch (constraint.type) {
    case "and": {
      // Recursively simplify children
      let children = constraint.children.map(simplify);

      // Remove always nodes (identity element for AND)
      children = children.filter((c) => c.type !== "always");

      // If any child is never, the whole AND is never
      if (children.some((c) => c.type === "never")) {
        return { type: "never" };
      }

      // Empty children after filtering -> always (all conditions satisfied)
      if (children.length === 0) return { type: "always" };

      // Single child -> unwrap
      if (children.length === 1) return children[0];

      return { type: "and", children };
    }

    case "or": {
      // Recursively simplify children
      let children = constraint.children.map(simplify);

      // Remove never nodes (identity element for OR)
      children = children.filter((c) => c.type !== "never");

      // If any child is always, the whole OR is always
      if (children.some((c) => c.type === "always")) {
        return { type: "always" };
      }

      // Empty children after filtering -> never (no paths available)
      if (children.length === 0) return { type: "never" };

      // Single child -> unwrap
      if (children.length === 1) return children[0];

      return { type: "or", children };
    }

    case "not": {
      const child = simplify(constraint.child);

      // not(always) -> never
      if (child.type === "always") return { type: "never" };

      // not(never) -> always
      if (child.type === "never") return { type: "always" };

      // not(not(X)) -> X
      if (child.type === "not") return child.child;

      return { type: "not", child };
    }

    case "relation": {
      const simplified = simplify(constraint.constraint);
      return { type: "relation", field: constraint.field, resourceType: constraint.resourceType, constraint: simplified };
    }

    default:
      return constraint;
  }
}
