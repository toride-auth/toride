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
export type RoleOutcome = () => Truth;

export interface RoleResolution {
  readonly detail: ResolvedRolesDetail;
  readonly outcomes: Map<string, RoleOutcome>;
}

export async function resolveRoleOutcomes(actor: ActorRef, resource: ResourceRef, cache: AttributeCache, block: ResourceBlock, policy: Policy, options: RoleOptions = {}): Promise<RoleResolution> {
  const traces: { role: string; via: string; outcome: RoleOutcome }[] = [];
  const memo = new Map<string, Promise<RoleOutcome>>();
  const maxDepth = options.maxDerivedRoleDepth ?? 5;
  const role = async (name: string, ref: ResourceRef, current: ResourceBlock, visited: Set<string>, depth: number): Promise<RoleOutcome> => {
    const key = JSON.stringify([ref.type, ref.id, name]);
    if (visited.has(key)) { cache.report("cycle", `${ref.type}.${name}`); return () => "indeterminate"; }
    if (depth > maxDepth) { cache.report("depth_limit", `${ref.type}.${name}`); return () => "indeterminate"; }
    const memoKey = JSON.stringify([key, depth, [...visited].sort()]);
    const stored = memo.get(memoKey);
    if (stored) return stored;
    const branch = new Set(visited).add(key);
    const computation = async (): Promise<RoleOutcome> => {
      const results: RoleOutcome[] = [];
      for (const entry of current.derived_roles ?? []) {
        if (entry.role !== name) continue;
        const source = roleSource(entry);
        let outcome: RoleOutcome;
        let via: string;
        switch (source.kind) {
          case "global": {
            const global = policy.global_roles?.[source.name];
            const result = !global || actor.type !== global.actor_type ? "false" : await evaluateNormalizedCondition(normalizeCondition(global.when), actor, ref, cache, {}, current, policy, { ...options, actorOnly: true });
            outcome = () => result;
            via = `global_role:${source.name}`;
            break;
          }
          case "condition": {
            const result = source.actorType && source.actorType !== actor.type ? "false" : await evaluateNormalizedCondition(source.condition, actor, ref, cache, options.env ?? {}, current, policy, options);
            outcome = () => result;
            via = source.actorType ? `actor_type:${source.actorType} + when condition` : "when condition";
            break;
          }
          case "identity":
          case "related": {
            via = source.kind === "identity" ? `identity on ${source.relation}` : `from_role:${source.role} on ${source.relation}`;
            const target = current.relations?.[source.relation];
            if (!target) { outcome = () => "indeterminate"; break; }
            try {
              const data = await cache.resolve(ref, current);
              const value = data === null ? null : Object.hasOwn(data, source.relation) ? data[source.relation] : unavailable;
              if (value === unavailable || value === undefined) { cache.report("missing_value", `${ref.type}.${source.relation}`); outcome = () => "indeterminate"; break; }
              if (value === null) { outcome = () => "false"; break; }
              const refs = Array.isArray(value) ? value : [value];
              const outcomes: RoleOutcome[] = [];
              for (const child of refs) {
                if (!isResourceRef(child) || child.type !== target) { outcomes.push(() => "indeterminate"); continue; }
                if (source.kind === "identity") outcomes.push(() => cache.isAbsent(child) ? "false" : child.type === actor.type && child.id === actor.id ? "true" : "false");
                else outcomes.push(policy.resources[target] ? await role(source.role, child, policy.resources[target], branch, depth + 1) : () => "false");
              }
              outcome = () => any(outcomes.map(value => value()));
            } catch { outcome = () => "indeterminate"; }
            break;
          }
          case "unavailable": outcome = () => "indeterminate"; via = "unavailable"; break;
        }
        const observed = (): Truth => cache.isAbsent(ref) ? "false" : outcome();
        results.push(observed);
        if (ref === resource) traces.push({ role: name, via, outcome: observed });
      }
      return () => cache.isAbsent(ref) ? "false" : any(results.map(result => result()));
    };
    const result = computation();
    memo.set(memoKey, result);
    return result;
  };
  const names = new Set([...block.roles, ...(block.derived_roles ?? []).map(entry => entry.role)]);
  const outcomes = new Map<string, RoleOutcome>();
  for (const name of names) outcomes.set(name, await role(name, resource, block, new Set(), 0));
  return { get detail() { return { direct: [], derived: traces.filter(trace => trace.outcome() === "true").map(({ role, via }) => ({ role, via })) }; }, outcomes };
}

export async function resolveRoles(actor: ActorRef, resource: ResourceRef, cache: AttributeCache, block: ResourceBlock, policy: Policy, options?: RoleOptions): Promise<ResolvedRolesDetail> {
  return (await resolveRoleOutcomes(actor, resource, cache, block, policy, options)).detail;
}
