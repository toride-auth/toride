import type { ActorRef, ConditionExpression, DerivedRoleEntry, EvaluationOutcome, ResourceBlock, Rule } from "../types.js";

export type Truth = EvaluationOutcome;
export const unavailable = Symbol("unavailable");
export type Operator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "includes" | "exists" | "startsWith" | "endsWith" | "contains";
export type Operand = { kind: "literal"; value: unknown } | { kind: "reference"; scope: "actor" | "resource" | "env"; path: string };
export type Condition =
  | { kind: "all" | "any"; children: Condition[] }
  | { kind: "predicate"; left: Operand; operator: Operator; right: Operand }
  | { kind: "custom"; name: string }
  | { kind: "unavailable" };

export function all(values: Truth[]): Truth {
  return values.includes("false") ? "false" : values.includes("indeterminate") ? "indeterminate" : "true";
}
export function any(values: Truth[]): Truth {
  return values.includes("true") ? "true" : values.includes("indeterminate") ? "indeterminate" : "false";
}
export function not(value: Truth): Truth {
  return value === "true" ? "false" : value === "false" ? "true" : "indeterminate";
}
export function operand(value: unknown): Operand {
  if (typeof value === "string") {
    const match = /^\$(actor|resource|env)\.(.+)$/.exec(value);
    if (match) return { kind: "reference", scope: match[1] as "actor" | "resource" | "env", path: match[2] };
  }
  return { kind: "literal", value };
}
export function normalizeCondition(expression: ConditionExpression, depth = 0, maxDepth = 10): Condition {
  if (depth > maxDepth) return { kind: "unavailable" };
  if ("all" in expression && Array.isArray(expression.all)) {
    return { kind: "all", children: expression.all.map(item => normalizeCondition(item, depth + 1, maxDepth)) };
  }
  if ("any" in expression && Array.isArray(expression.any)) {
    return { kind: "any", children: expression.any.map(item => normalizeCondition(item, depth + 1, maxDepth)) };
  }
  return { kind: "all", children: Object.entries(expression).map(([path, value]): Condition => {
    const left = operand(path);
    if (left.kind !== "reference") return { kind: "unavailable" };
    if (typeof value === "object" && value !== null) {
      const entries = Object.entries(value);
      if (entries.length !== 1) return { kind: "unavailable" };
      const [operator, right] = entries[0];
      if (operator === "custom") return { kind: "custom", name: String(right) };
      if (!["eq", "neq", "gt", "gte", "lt", "lte", "in", "includes", "exists", "startsWith", "endsWith", "contains"].includes(operator)) return { kind: "unavailable" };
      return { kind: "predicate", left, operator: operator as Operator, right: operand(right) };
    }
    return { kind: "predicate", left, operator: "eq", right: operand(value) };
  }) };
}
export function readPath(value: unknown, path: string): unknown {
  for (const key of path.split(".")) {
    if (value === null) return null;
    if (["__proto__", "prototype", "constructor"].includes(key) || typeof value !== "object" || value === null || !Object.hasOwn(value, key)) return unavailable;
    value = (value as Record<string, unknown>)[key];
  }
  return value === undefined ? unavailable : value;
}
export function staticOperand(value: Operand, actor: ActorRef, env: Record<string, unknown>, actorOnly = false): unknown {
  if (value.kind === "literal") return value.value === undefined ? unavailable : value.value;
  if (value.scope === "actor") return readPath(actor.attributes, value.path);
  if (value.scope === "env" && !actorOnly) return readPath(env, value.path);
  return unavailable;
}
export function compare(operator: Operator, left: unknown, right: unknown): Truth {
  if (left === unavailable || right === unavailable || left === undefined || right === undefined) return "indeterminate";
  if (operator === "exists") return (left !== null) === right ? "true" : "false";
  if (left === null || right === null) return "false";
  let result: boolean;
  switch (operator) {
    case "eq": result = left === right; break;
    case "neq": result = left !== right; break;
    case "gt": result = ((typeof left === "number" && typeof right === "number") || (typeof left === "string" && typeof right === "string")) && left > right; break;
    case "gte": result = ((typeof left === "number" && typeof right === "number") || (typeof left === "string" && typeof right === "string")) && left >= right; break;
    case "lt": result = ((typeof left === "number" && typeof right === "number") || (typeof left === "string" && typeof right === "string")) && left < right; break;
    case "lte": result = ((typeof left === "number" && typeof right === "number") || (typeof left === "string" && typeof right === "string")) && left <= right; break;
    case "in": result = Array.isArray(right) && right.includes(left); break;
    case "includes": result = Array.isArray(left) && left.includes(right); break;
    case "startsWith": result = typeof left === "string" && typeof right === "string" && left.startsWith(right); break;
    case "endsWith": result = typeof left === "string" && typeof right === "string" && left.endsWith(right); break;
    case "contains": result = typeof left === "string" && typeof right === "string" && left.includes(right); break;
  }
  return result ? "true" : "false";
}

export type RoleSource =
  | { kind: "global"; name: string }
  | { kind: "related"; relation: string; role: string }
  | { kind: "identity"; relation: string }
  | { kind: "condition"; actorType?: string; condition: Condition }
  | { kind: "unavailable" };
export function roleSource(entry: DerivedRoleEntry): RoleSource {
  if (entry.from_global_role !== undefined) return { kind: "global", name: entry.from_global_role };
  if (entry.from_role !== undefined && entry.on_relation !== undefined) return { kind: "related", relation: entry.on_relation, role: entry.from_role };
  if (entry.from_relation !== undefined) return { kind: "identity", relation: entry.from_relation };
  if (entry.when !== undefined) return { kind: "condition", actorType: entry.actor_type, condition: normalizeCondition(entry.when) };
  return { kind: "unavailable" };
}

export interface Logic<T> { all(values: T[]): T; any(values: T[]): T; not(value: T): T }
export async function composeAction<T>(
  block: ResourceBlock,
  action: string,
  logic: Logic<T>,
  role: (name: string) => Promise<T>,
  condition: (rule: Rule) => Promise<T>,
  observe?: (rule: Rule, result: T) => void,
): Promise<T> {
  const permits: T[] = [];
  const forbids: T[] = [];
  for (const [name, permissions] of Object.entries(block.grants ?? {})) {
    if (permissions.some(permission => permission === "all" ? block.permissions.includes(action) : permission === action)) permits.push(await role(name));
  }
  for (const rule of block.rules ?? []) {
    if (!rule.permissions.includes(action)) continue;
    const guard = rule.roles?.length ? logic.any(await Promise.all(rule.roles.map(role))) : logic.all([]);
    const result = logic.all([guard, await condition(rule)]);
    observe?.(rule, result);
    (rule.effect === "permit" ? permits : forbids).push(result);
  }
  return logic.all([logic.any(permits), logic.not(logic.any(forbids))]);
}
