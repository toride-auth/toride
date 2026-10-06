import type { ActorRef, Policy, ConditionExpression, CheckOptions } from "../types.js";
import type { Constraint, ConstraintResult, LeafConstraint } from "./constraint-types.js";
import type { AttributeCache } from "../evaluation/cache.js";
import { compare, composeAction, normalizeCondition, roleSource, staticOperand, unavailable } from "../evaluation/semantics.js";
import type { Condition, Operand, Operator, Truth } from "../evaluation/semantics.js";

const always: Constraint = { type: "always" };
const never: Constraint = { type: "never" };
interface Sets { whenTrue: Constraint; whenFalse: Constraint }
const conjunction = (children: Constraint[]): Constraint => simplify({ type: "and", children });
const disjunction = (children: Constraint[]): Constraint => simplify({ type: "or", children });
const complement = (child: Constraint): Constraint => simplify({ type: "not", child });
const logic = {
  all: (values: Sets[]): Sets => ({ whenTrue: conjunction(values.map(value => value.whenTrue)), whenFalse: disjunction(values.map(value => value.whenFalse)) }),
  any: (values: Sets[]): Sets => ({ whenTrue: disjunction(values.map(value => value.whenTrue)), whenFalse: conjunction(values.map(value => value.whenFalse)) }),
  not: (value: Sets): Sets => ({ whenTrue: value.whenFalse, whenFalse: value.whenTrue }),
};
function known(value: Truth): Sets {
  return { whenTrue: value === "true" ? always : never, whenFalse: value === "false" ? always : never };
}
function unsupported(name: string): Sets {
  const node: Constraint = { type: "unknown", name };
  return { whenTrue: node, whenFalse: complement(node) };
}
function existsRelated(field: string, resourceType: string, child: Constraint): Constraint {
  return simplify({ type: "relation", quantifier: "any", field, resourceType, constraint: child });
}
function related(field: string, resourceType: string, child: Sets): Sets {
  return { whenTrue: existsRelated(field, resourceType, child.whenTrue), whenFalse: complement(existsRelated(field, resourceType, complement(child.whenFalse))) };
}

export async function buildConstraints(actor: ActorRef, action: string, resourceType: string, _cache: AttributeCache, policy: Policy, options?: CheckOptions & { maxDerivedRoleDepth?: number; maxConditionDepth?: number; customEvaluators?: Record<string, unknown> }): Promise<ConstraintResult> {
  const block = policy.resources[resourceType];
  if (!block) return { ok: false };
  const env = options?.env ?? {};
  const condition = (expression: ConditionExpression, type: string, actorOnly = false) => compileCondition(normalizeCondition(expression), type, actorOnly);
  function compileCondition(node: Condition, type: string, actorOnly = false): Sets {
    switch (node.kind) {
      case "all": return logic.all(node.children.map(child => compileCondition(child, type, actorOnly)));
      case "any": return logic.any(node.children.map(child => compileCondition(child, type, actorOnly)));
      case "unavailable": return known("indeterminate");
      case "custom": return actorOnly ? known("indeterminate") : unsupported(`custom evaluator ${node.name}`);
      case "predicate": {
        const dynamic = (value: Operand) => !actorOnly && value.kind === "reference" && value.scope === "resource";
        const leftDynamic = dynamic(node.left), rightDynamic = dynamic(node.right);
        if (leftDynamic && rightDynamic) return unsupported("resource-to-resource comparison");
        if (!leftDynamic && !rightDynamic) return known(compare(node.operator, staticOperand(node.left, actor, env, actorOnly), staticOperand(node.right, actor, env, actorOnly)));
        const fieldOperand = leftDynamic ? node.left : node.right;
        if (fieldOperand.kind !== "reference") return known("indeterminate");
        const value = staticOperand(leftDynamic ? node.right : node.left, actor, env, actorOnly);
        let operator = node.operator;
        if (!leftDynamic) {
          const reverse: Partial<Record<Operator, Operator>> = { eq: "eq", neq: "neq", gt: "lt", gte: "lte", lt: "gt", lte: "gte", in: "includes", includes: "in" };
          const reversed = reverse[operator];
          if (!reversed) return unsupported(`reversed ${operator}`);
          operator = reversed;
        }
        return field(fieldOperand.path, operator, value, type);
      }
    }
  }
  function field(path: string, operator: Operator, value: unknown, type: string, depth = 0): Sets {
    if (depth > (options?.maxConditionDepth ?? 3)) return known("indeterminate");
    const [first, ...rest] = path.split(".");
    const target = policy.resources[type]?.relations?.[first];
    if (target && rest.length) {
      if (operator === "exists" && value === false) return logic.not(field(path, "exists", true, type, depth));
      return related(first, target, field(rest.join("."), operator, value, target, depth + 1));
    }
    if (value === unavailable) return known("indeterminate");
    if (target) return unsupported(`relation value operator ${operator}`);
    if (value === null && operator !== "exists") return known("false");
    let leaf: LeafConstraint;
    switch (operator) {
      case "eq": leaf = { type: "field_eq", field: path, value }; break;
      case "neq": leaf = { type: "field_neq", field: path, value }; break;
      case "gt": case "gte": case "lt": case "lte":
        if (typeof value !== "number" && typeof value !== "string") return known("false");
        leaf = { type: `field_${operator}`, field: path, value }; break;
      case "in":
        if (!Array.isArray(value)) return known("false");
        leaf = { type: "field_in", field: path, values: value }; break;
      case "includes": leaf = { type: "field_includes", field: path, value }; break;
      case "exists": leaf = { type: "field_exists", field: path, exists: value === true }; break;
      case "startsWith": case "endsWith": case "contains":
        if (typeof value !== "string") return known("false");
        leaf = { type: operator === "startsWith" ? "field_starts_with" : operator === "endsWith" ? "field_ends_with" : "field_contains", field: path, value }; break;
    }
    return { whenTrue: leaf, whenFalse: complement(leaf) };
  }
  const role = (name: string, type: string, visited = new Set<string>(), depth = 0): Sets => {
    const current = policy.resources[type];
    if (!current) return known("false");
    const key = `${type}.${name}`;
    if (visited.has(key) || depth > (options?.maxDerivedRoleDepth ?? 5)) return unsupported(`recursive role ${key}`);
    const branch = new Set(visited).add(key);
    return logic.any((current.derived_roles ?? []).filter(entry => entry.role === name).map(entry => {
      const source = roleSource(entry);
      switch (source.kind) {
        case "global": {
          const global = policy.global_roles?.[source.name];
          return !global || global.actor_type !== actor.type ? known("false") : condition(global.when, type, true);
        }
        case "condition": return source.actorType && source.actorType !== actor.type ? known("false") : compileCondition(source.condition, type);
        case "identity": {
          const target = current.relations?.[source.relation];
          if (!target) return known("indeterminate");
          if (target !== actor.type) return known("false");
          return related(source.relation, target, field("id", "eq", actor.id, target));
        }
        case "related": {
          const target = current.relations?.[source.relation];
          return target ? related(source.relation, target, role(source.role, target, branch, depth + 1)) : known("indeterminate");
        }
        case "unavailable": return known("indeterminate");
      }
    }));
  };
  const result = await composeAction(block, action, logic, async name => role(name, resourceType), async rule => condition(rule.when, resourceType));
  const constraint = simplify(result.whenTrue);
  if (constraint.type === "never") return { ok: false };
  if (constraint.type === "always") return { ok: true, constraint: null };
  return { ok: true, constraint: { ...constraint, rootResourceType: resourceType } };
}

export function simplify(constraint: Constraint, depth = 0): Constraint {
  if (depth > 100) return constraint;
  switch (constraint.type) {
    case "and": case "or": {
      const and = constraint.type === "and";
      const children = constraint.children.map(child => simplify(child, depth + 1));
      if (children.some(child => child.type === (and ? "never" : "always"))) return and ? never : always;
      const remaining = children.filter(child => child.type !== (and ? "always" : "never"));
      if (!remaining.length) return and ? always : never;
      if (remaining.length === 1) return remaining[0];
      return { type: constraint.type, children: remaining };
    }
    case "not": {
      const child = simplify(constraint.child, depth + 1);
      return child.type === "always" ? never : child.type === "never" ? always : child.type === "not" ? child.child : { type: "not", child };
    }
    case "relation": {
      const child = simplify(constraint.constraint, depth + 1);
      if (child.type === "never") return never;
      return { ...constraint, constraint: child };
    }
    default: return constraint;
  }
}
