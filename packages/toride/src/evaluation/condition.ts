// T046: Condition expression evaluator
// T047: Nested property resolution
// T048: Strict null semantics
// T053: Cardinality:many relation resolution with ANY semantics

import type {
  ActorRef,
  ResourceRef,
  RelationResolver,
  ConditionExpression,
  ConditionOperator,
  ConditionValue,
  ResourceBlock,
  Policy,
  EvaluatorFn,
} from "../types.js";

/** Default maximum depth for nested property resolution. */
const DEFAULT_MAX_CONDITION_DEPTH = 3;

/** Sentinel value representing an undefined/missing property. */
const UNDEFINED_SENTINEL = Symbol("UNDEFINED");

export interface ConditionOptions {
  readonly maxConditionDepth?: number;
  readonly customEvaluators?: Record<string, EvaluatorFn>;
  readonly ruleEffect?: "permit" | "forbid";
}

/**
 * Evaluate a condition expression against the full context.
 * Handles all operators, cross-references, nested property resolution,
 * strict null semantics, logical combinators, and cardinality:many ANY semantics.
 */
export async function evaluateCondition(
  condition: ConditionExpression,
  actor: ActorRef,
  resource: ResourceRef,
  resolver: RelationResolver,
  env: Record<string, unknown>,
  resourceBlock: ResourceBlock,
  policy: Policy,
  options?: ConditionOptions,
): Promise<boolean> {
  const maxDepth = options?.maxConditionDepth ?? DEFAULT_MAX_CONDITION_DEPTH;

  // Handle logical combinators
  if ("any" in condition && Array.isArray((condition as { any: unknown }).any)) {
    const items = (condition as { any: ConditionExpression[] }).any;
    for (const item of items) {
      if (await evaluateCondition(item, actor, resource, resolver, env, resourceBlock, policy, options)) {
        return true;
      }
    }
    return false;
  }

  if ("all" in condition && Array.isArray((condition as { all: unknown }).all)) {
    const items = (condition as { all: ConditionExpression[] }).all;
    for (const item of items) {
      if (!(await evaluateCondition(item, actor, resource, resolver, env, resourceBlock, policy, options))) {
        return false;
      }
    }
    return true;
  }

  // Simple conditions: all key-value pairs ANDed together
  const entries = Object.entries(condition as Record<string, ConditionValue>);
  for (const [key, conditionValue] of entries) {
    const matched = await evaluatePair(
      key,
      conditionValue,
      actor,
      resource,
      resolver,
      env,
      resourceBlock,
      policy,
      maxDepth,
      options,
    );
    if (!matched) return false;
  }

  return true;
}

/**
 * Evaluate a single key-value pair from a simple condition.
 */
async function evaluatePair(
  key: string,
  conditionValue: ConditionValue,
  actor: ActorRef,
  resource: ResourceRef,
  resolver: RelationResolver,
  env: Record<string, unknown>,
  resourceBlock: ResourceBlock,
  policy: Policy,
  maxDepth: number,
  options?: ConditionOptions,
): Promise<boolean> {
  // Resolve the left-hand side value
  const leftValue = await resolveValue(
    key,
    actor,
    resource,
    resolver,
    env,
    resourceBlock,
    policy,
    maxDepth,
  );

  // Handle operator-based conditions
  if (isOperator(conditionValue)) {
    return evaluateOperator(
      leftValue,
      conditionValue,
      actor,
      resource,
      resolver,
      env,
      resourceBlock,
      policy,
      maxDepth,
      options,
    );
  }

  // Equality shorthand: primitive or cross-reference string
  const rightValue = await resolveRightValue(
    conditionValue,
    actor,
    resource,
    resolver,
    env,
    resourceBlock,
    policy,
    maxDepth,
  );

  // Strict null semantics: undefined never equals anything
  if (leftValue === UNDEFINED_SENTINEL || leftValue === null || leftValue === undefined) {
    return false;
  }
  if (rightValue === UNDEFINED_SENTINEL || rightValue === null || rightValue === undefined) {
    return false;
  }

  return leftValue === rightValue;
}

/**
 * Resolve a reference path to its value.
 * Handles $actor.x, $resource.x, $env.x, and nested paths like $resource.org.name.
 */
async function resolveValue(
  path: string,
  actor: ActorRef,
  resource: ResourceRef,
  resolver: RelationResolver,
  env: Record<string, unknown>,
  resourceBlock: ResourceBlock,
  policy: Policy,
  maxDepth: number,
): Promise<unknown> {
  if (path.startsWith("$actor.")) {
    const attrPath = path.slice(7); // Remove "$actor."
    return getNestedAttribute(actor.attributes, attrPath);
  }

  if (path.startsWith("$resource.")) {
    const attrPath = path.slice(10); // Remove "$resource."
    return resolveResourcePath(
      attrPath,
      resource,
      resolver,
      resourceBlock,
      policy,
      maxDepth,
    );
  }

  if (path.startsWith("$env.")) {
    const attrName = path.slice(5); // Remove "$env."
    const val = env[attrName];
    return val === undefined ? UNDEFINED_SENTINEL : val;
  }

  return UNDEFINED_SENTINEL;
}

/**
 * Resolve a resource attribute path, handling nested property resolution via relations.
 * T047: $resource.org.name -> resolve org relation, then get name attribute.
 * T053: Cardinality:many -> ANY semantics (returns array of values for further eval).
 */
async function resolveResourcePath(
  path: string,
  resource: ResourceRef,
  resolver: RelationResolver,
  resourceBlock: ResourceBlock,
  policy: Policy,
  depthRemaining: number,
): Promise<unknown> {
  const parts = path.split(".");

  if (parts.length === 1) {
    // Simple attribute lookup
    try {
      const attrs = await resolver.getAttributes(resource);
      const val = attrs[parts[0]];
      return val === undefined ? UNDEFINED_SENTINEL : val;
    } catch {
      return UNDEFINED_SENTINEL;
    }
  }

  // Nested path: first part is a relation name, rest is the attribute path on the related resource
  if (depthRemaining <= 0) {
    return UNDEFINED_SENTINEL;
  }

  const relationName = parts[0];
  const remainingPath = parts.slice(1).join(".");

  // Check if the relation exists in the resource block
  const relationDef = resourceBlock.relations?.[relationName];
  if (!relationDef) {
    // Not a relation - might be a nested attribute object
    try {
      const attrs = await resolver.getAttributes(resource);
      const val = getNestedAttribute(attrs, path);
      return val;
    } catch {
      return UNDEFINED_SENTINEL;
    }
  }

  // Resolve the related resource(s)
  let relatedRefs: ResourceRef[];
  try {
    const result = await resolver.getRelated(resource, relationName);
    relatedRefs = Array.isArray(result) ? result : result ? [result] : [];
  } catch {
    return UNDEFINED_SENTINEL;
  }

  if (relatedRefs.length === 0) {
    return UNDEFINED_SENTINEL;
  }

  // Get the resource block for the related type
  const relatedType = relatedRefs[0].type;
  const relatedBlock = policy.resources[relatedType] ?? {
    roles: [],
    permissions: [],
  };

  if (relationDef.cardinality === "many") {
    // T053: Cardinality:many -> collect all values (ANY semantics applied at operator level)
    const values: unknown[] = [];
    for (const ref of relatedRefs) {
      const refBlock = policy.resources[ref.type] ?? { roles: [], permissions: [] };
      const val = await resolveResourcePath(
        remainingPath,
        ref,
        resolver,
        refBlock,
        policy,
        depthRemaining - 1,
      );
      if (val !== UNDEFINED_SENTINEL) {
        values.push(val);
      }
    }
    return values.length > 0 ? values : UNDEFINED_SENTINEL;
  }

  // Cardinality:one -> resolve on first ref
  return resolveResourcePath(
    remainingPath,
    relatedRefs[0],
    resolver,
    relatedBlock,
    policy,
    depthRemaining - 1,
  );
}

/**
 * Get a nested attribute from an object using dot-separated path.
 */
function getNestedAttribute(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return UNDEFINED_SENTINEL;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current === undefined ? UNDEFINED_SENTINEL : current;
}

/**
 * Resolve a right-hand side value, handling cross-references.
 */
async function resolveRightValue(
  value: ConditionValue,
  actor: ActorRef,
  resource: ResourceRef,
  resolver: RelationResolver,
  env: Record<string, unknown>,
  resourceBlock: ResourceBlock,
  policy: Policy,
  maxDepth: number,
): Promise<unknown> {
  if (typeof value === "string" && isCrossReference(value)) {
    return resolveValue(value, actor, resource, resolver, env, resourceBlock, policy, maxDepth);
  }
  return value;
}

/**
 * Check if a string value is a cross-reference ($actor., $resource., $env.).
 */
function isCrossReference(value: string): boolean {
  return (
    value.startsWith("$actor.") ||
    value.startsWith("$resource.") ||
    value.startsWith("$env.")
  );
}

/**
 * Check if a ConditionValue is an operator object.
 */
function isOperator(value: ConditionValue): value is ConditionOperator {
  if (typeof value !== "object" || value === null) return false;
  const keys = Object.keys(value as object);
  const operatorKeys = [
    "eq", "neq", "gt", "gte", "lt", "lte",
    "in", "includes", "exists",
    "startsWith", "endsWith", "contains",
    "custom",
  ];
  return keys.length === 1 && operatorKeys.includes(keys[0]);
}

/**
 * Evaluate an operator condition.
 */
async function evaluateOperator(
  leftValue: unknown,
  operator: ConditionOperator,
  actor: ActorRef,
  resource: ResourceRef,
  resolver: RelationResolver,
  env: Record<string, unknown>,
  resourceBlock: ResourceBlock,
  policy: Policy,
  maxDepth: number,
  options?: ConditionOptions,
): Promise<boolean> {
  const op = operator as Record<string, unknown>;
  const opKey = Object.keys(op)[0];
  const opValue = op[opKey];

  // Handle custom evaluator
  if (opKey === "custom") {
    return evaluateCustom(
      opValue as string,
      actor,
      resource,
      env,
      options,
    );
  }

  // Handle exists operator (doesn't need right-side resolution)
  if (opKey === "exists") {
    const exists = leftValue !== UNDEFINED_SENTINEL && leftValue !== undefined && leftValue !== null;
    return opValue === true ? exists : !exists;
  }

  // Resolve right-hand side value (may be a cross-reference)
  const rightValue = await resolveRightValue(
    opValue as ConditionValue,
    actor,
    resource,
    resolver,
    env,
    resourceBlock,
    policy,
    maxDepth,
  );

  // T053: If leftValue is an array (from cardinality:many), apply ANY semantics
  if (Array.isArray(leftValue)) {
    return evaluateAnySemantics(leftValue, opKey, rightValue);
  }

  // Strict null semantics
  if (leftValue === UNDEFINED_SENTINEL || leftValue === null || leftValue === undefined) {
    return false;
  }

  return evaluateOperatorPrimitive(leftValue, opKey, rightValue);
}

/**
 * T053: Cardinality:many ANY semantics - true if ANY value in the array satisfies the operator.
 */
function evaluateAnySemantics(
  values: unknown[],
  opKey: string,
  rightValue: unknown,
): boolean {
  // Special case: "includes" on an array of arrays - check each sub-value
  if (opKey === "includes") {
    // The left side is an array of individual values from many related resources
    // "includes" means: does this collection include the value
    return values.some((v) => v === rightValue);
  }

  return values.some((v) => {
    if (v === UNDEFINED_SENTINEL || v === null || v === undefined) return false;
    return evaluateOperatorPrimitive(v, opKey, rightValue);
  });
}

/**
 * Evaluate a primitive operator comparison.
 */
function evaluateOperatorPrimitive(
  left: unknown,
  opKey: string,
  right: unknown,
): boolean {
  switch (opKey) {
    case "eq":
      if (right === UNDEFINED_SENTINEL || right === null || right === undefined) return false;
      return left === right;

    case "neq":
      if (right === UNDEFINED_SENTINEL || right === null || right === undefined) return false;
      return left !== right;

    case "gt":
      if (right === UNDEFINED_SENTINEL || right === null || right === undefined) return false;
      return (left as number) > (right as number);

    case "gte":
      if (right === UNDEFINED_SENTINEL || right === null || right === undefined) return false;
      return (left as number) >= (right as number);

    case "lt":
      if (right === UNDEFINED_SENTINEL || right === null || right === undefined) return false;
      return (left as number) < (right as number);

    case "lte":
      if (right === UNDEFINED_SENTINEL || right === null || right === undefined) return false;
      return (left as number) <= (right as number);

    case "in": {
      if (right === UNDEFINED_SENTINEL || right === null || right === undefined) return false;
      if (Array.isArray(right)) {
        return right.includes(left);
      }
      // right might be a string reference that resolved to an array
      return false;
    }

    case "includes": {
      if (right === UNDEFINED_SENTINEL || right === null || right === undefined) return false;
      if (Array.isArray(left)) {
        return (left as unknown[]).includes(right);
      }
      return false;
    }

    case "startsWith":
      if (typeof left !== "string" || typeof right !== "string") return false;
      return left.startsWith(right);

    case "endsWith":
      if (typeof left !== "string" || typeof right !== "string") return false;
      return left.endsWith(right);

    case "contains":
      if (typeof left !== "string" || typeof right !== "string") return false;
      return left.includes(right);

    default:
      return false;
  }
}

/**
 * Evaluate a custom evaluator.
 * Fail-closed semantics: errors in permit rules -> false (not matched),
 * errors in forbid rules -> true (matched = deny).
 */
async function evaluateCustom(
  evaluatorName: string,
  actor: ActorRef,
  resource: ResourceRef,
  env: Record<string, unknown>,
  options?: ConditionOptions,
): Promise<boolean> {
  const evaluator = options?.customEvaluators?.[evaluatorName];
  if (!evaluator) {
    // Evaluator not found -> fail-closed
    return options?.ruleEffect === "forbid";
  }

  try {
    return await evaluator(actor, resource, env);
  } catch {
    // Fail-closed: permit errors -> false, forbid errors -> true
    return options?.ruleEffect === "forbid";
  }
}
