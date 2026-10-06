import type { ActorRef, ResourceRef, ResourceBlock, Policy, ResolvedRolesDetail, EvaluatorFn } from "../types.js";
import { AttributeCache, isResourceRef } from "./cache.js";
import { evaluateNormalizedCondition } from "./condition.js";
import { any, normalizeCondition, roleSource, unavailable } from "./semantics.js";
import type { Truth } from "./semantics.js";

export interface RoleOptions {
  maxDerivedRoleDepth?: number;
  maxConditionDepth?: number;
  customEvaluators?: Record<string, EvaluatorFn>;
  env?: Record<string, unknown>;
}
export interface RoleResolution {
  readonly detail: ResolvedRolesDetail;
  readonly outcomes: Map<string, Truth>;
}

export async function resolveRoleOutcomes(actor: ActorRef, resource: ResourceRef, cache: AttributeCache, block: ResourceBlock, policy: Policy, options: RoleOptions = {}): Promise<RoleResolution> {
  const traces: { role: string; via: string }[] = [];
  const memo = new Map<string, Promise<Truth>>();
  const maxDepth = options.maxDerivedRoleDepth ?? 5;
  const role = async (name: string, ref: ResourceRef, current: ResourceBlock, visited: Set<string>, depth: number): Promise<Truth> => {
    const key = JSON.stringify([ref.type, ref.id, name]);
    if (visited.has(key)) { cache.report("cycle", `${ref.type}.${name}`); return "indeterminate"; }
    if (depth > maxDepth) { cache.report("depth_limit", `${ref.type}.${name}`); return "indeterminate"; }
    const stored = memo.get(key);
    if (stored) return stored;
    const branch = new Set(visited).add(key);
    const computation = async (): Promise<Truth> => {
      const results: Truth[] = [];
      for (const entry of current.derived_roles ?? []) {
        if (entry.role !== name) continue;
        const source = roleSource(entry);
        let result: Truth;
        let via: string;
        switch (source.kind) {
          case "global": {
            const global = policy.global_roles?.[source.name];
            result = !global || actor.type !== global.actor_type ? "false" : await evaluateNormalizedCondition(normalizeCondition(global.when), actor, ref, cache, {}, current, policy, { ...options, actorOnly: true });
            via = `global_role:${source.name}`;
            break;
          }
          case "condition": {
            result = source.actorType && source.actorType !== actor.type ? "false" : await evaluateNormalizedCondition(source.condition, actor, ref, cache, options.env ?? {}, current, policy, options);
            via = source.actorType ? `actor_type:${source.actorType} + when condition` : "when condition";
            break;
          }
          case "identity":
          case "related": {
            via = source.kind === "identity" ? `identity on ${source.relation}` : `from_role:${source.role} on ${source.relation}`;
            const target = current.relations?.[source.relation];
            if (!target) { result = "indeterminate"; break; }
            try {
              const data = await cache.resolve(ref, current);
              const value = data === null ? null : Object.hasOwn(data, source.relation) ? data[source.relation] : unavailable;
              if (value === unavailable || value === undefined) { cache.report("missing_value", `${ref.type}.${source.relation}`); result = "indeterminate"; break; }
              if (value === null) { result = "false"; break; }
              const refs = Array.isArray(value) ? value : [value];
              const outcomes: Truth[] = [];
              for (const child of refs) {
                if (!isResourceRef(child) || child.type !== target) { outcomes.push("indeterminate"); continue; }
                if (source.kind === "identity") outcomes.push(child.type === actor.type && child.id === actor.id ? "true" : "false");
                else outcomes.push(policy.resources[target] ? await role(source.role, child, policy.resources[target], branch, depth + 1) : "false");
              }
              result = any(outcomes);
            } catch { result = "indeterminate"; }
            break;
          }
          case "unavailable": result = "indeterminate"; via = "unavailable"; break;
        }
        if (cache.isAbsent(ref)) result = "false";
        results.push(result);
        if (result === "true" && ref === resource) traces.push({ role: name, via });
      }
      return any(results);
    };
    const result = computation();
    memo.set(key, result);
    return result;
  };
  const names = new Set([...block.roles, ...(block.derived_roles ?? []).map(entry => entry.role)]);
  const outcomes = new Map<string, Truth>();
  for (const name of names) outcomes.set(name, await role(name, resource, block, new Set(), 0));
  return { detail: { direct: [], derived: traces }, outcomes };
}

export async function resolveRoles(actor: ActorRef, resource: ResourceRef, cache: AttributeCache, block: ResourceBlock, policy: Policy, options?: RoleOptions): Promise<ResolvedRolesDetail> {
  return (await resolveRoleOutcomes(actor, resource, cache, block, policy, options)).detail;
}
