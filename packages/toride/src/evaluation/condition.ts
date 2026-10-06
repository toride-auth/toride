import type { ActorRef, ResourceRef, ConditionExpression, ResourceBlock, Policy, EvaluatorFn } from "../types.js";
import { AttributeCache, isResourceRef } from "./cache.js";
import { all, any, compare, normalizeCondition, readPath, staticOperand, unavailable } from "./semantics.js";
import type { Condition, Operand, Truth } from "./semantics.js";

export interface ConditionOptions {
  readonly maxConditionDepth?: number;
  readonly maxCombinatorDepth?: number;
  readonly customEvaluators?: Record<string, EvaluatorFn>;
  readonly actorOnly?: boolean;
}
type Values = { kind: "scalar"; value: unknown } | { kind: "traversal"; values: unknown[] };

async function resourcePath(path: string, resource: ResourceRef, cache: AttributeCache, block: ResourceBlock, policy: Policy, depth: number): Promise<Values> {
  if (depth < 0) {
    cache.report("depth_limit", `$resource.${path}`);
    return { kind: "scalar", value: unavailable };
  }
  try {
    const attributes = await cache.resolve(resource, block);
    if (attributes === null) return { kind: "scalar", value: null };
    if (path === "id") return { kind: "scalar", value: resource.id };
    const [first, ...rest] = path.split(".");
    const target = block.relations?.[first];
    if (!target || !rest.length) return { kind: "scalar", value: readPath(attributes, path) };
    const relation = readPath(attributes, first);
    if (relation === unavailable || relation === null) return { kind: "scalar", value: relation };
    const refs = Array.isArray(relation) ? relation : [relation];
    const values: unknown[] = [];
    for (const ref of refs) {
      if (!isResourceRef(ref)) return { kind: "scalar", value: unavailable };
      const child = await resourcePath(rest.join("."), ref, cache, policy.resources[target] ?? { roles: [], permissions: [] }, policy, depth - 1);
      values.push(...(child.kind === "scalar" ? [child.value] : child.values));
    }
    return { kind: "traversal", values };
  } catch {
    return { kind: "scalar", value: unavailable };
  }
}

export async function evaluateNormalizedCondition(condition: Condition, actor: ActorRef, resource: ResourceRef, cache: AttributeCache, env: Record<string, unknown>, block: ResourceBlock, policy: Policy, options: ConditionOptions = {}): Promise<Truth> {
  const resolve = async (value: Operand): Promise<Values> => {
    const result = value.kind === "reference" && value.scope === "resource" && !options.actorOnly
      ? await resourcePath(value.path, resource, cache, block, policy, options.maxConditionDepth ?? 3)
      : { kind: "scalar" as const, value: staticOperand(value, actor, env, options.actorOnly) };
    if (result.kind === "scalar" && result.value === unavailable && value.kind === "reference") cache.report("missing_value", `$${value.scope}.${value.path}`);
    return result;
  };
  switch (condition.kind) {
    case "all": return all(await Promise.all(condition.children.map(child => evaluateNormalizedCondition(child, actor, resource, cache, env, block, policy, options))));
    case "any": return any(await Promise.all(condition.children.map(child => evaluateNormalizedCondition(child, actor, resource, cache, env, block, policy, options))));
    case "unavailable": cache.report("depth_limit", "condition"); return "indeterminate";
    case "custom": {
      const evaluator = options.customEvaluators?.[condition.name];
      if (evaluator && !options.actorOnly) {
        try { return await evaluator(actor, resource, env) ? "true" : "false"; } catch {}
      }
      cache.report("custom_evaluator", condition.name);
      return "indeterminate";
    }
    case "predicate": {
      const left = await resolve(condition.left);
      const right = await resolve(condition.right);
      if (right.kind === "traversal") return "indeterminate";
      if (left.kind === "scalar") return compare(condition.operator, left.value, right.value);
      if (condition.operator === "exists") {
        const present = any(left.values.map(value => compare("exists", value, true)));
        return right.value === false ? present === "true" ? "false" : present === "false" ? "true" : "indeterminate" : present;
      }
      return any(left.values.map(value => compare(condition.operator, value, right.value)));
    }
  }
}

export async function evaluateConditionOutcome(condition: ConditionExpression, actor: ActorRef, resource: ResourceRef, cache: AttributeCache, env: Record<string, unknown>, block: ResourceBlock, policy: Policy, options?: ConditionOptions): Promise<Truth> {
  return evaluateNormalizedCondition(normalizeCondition(condition, 0, options?.maxCombinatorDepth), actor, resource, cache, env, block, policy, options);
}
export async function evaluateCondition(condition: ConditionExpression, actor: ActorRef, resource: ResourceRef, cache: AttributeCache, env: Record<string, unknown>, block: ResourceBlock, policy: Policy, options?: ConditionOptions): Promise<boolean> {
  return await evaluateConditionOutcome(condition, actor, resource, cache, env, block, policy, options) === "true";
}
