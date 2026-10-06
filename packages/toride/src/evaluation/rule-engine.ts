import type { ActorRef, ResourceRef, ResourceBlock, ExplainResult, MatchedRule, Policy } from "../types.js";
import type { AttributeCache } from "./cache.js";
import { resolveRoleOutcomes } from "./role-resolver.js";
import type { RoleOptions } from "./role-resolver.js";
import { evaluateConditionOutcome } from "./condition.js";
import { all, any, not, composeAction } from "./semantics.js";

export async function evaluate(actor: ActorRef, action: string, resource: ResourceRef, block: ResourceBlock, cache: AttributeCache, policy: Policy, options: RoleOptions = {}): Promise<ExplainResult> {
  const roles = await resolveRoleOutcomes(actor, resource, cache, block, policy, options);
  const matchedRules: MatchedRule[] = [];
  const outcome = await composeAction(block, action, { all, any, not },
    async name => roles.outcomes.get(name) ?? "false",
    rule => evaluateConditionOutcome(rule.when, actor, resource, cache, options.env ?? {}, block, policy, options),
    (rule, result) => matchedRules.push({ effect: rule.effect, matched: result === "true", outcome: result, rule, resolvedValues: {} }),
  );
  const allowed = outcome === "true" && !cache.hasConflict && !cache.isAbsent(resource);
  const knownRoles = [...roles.outcomes].filter(([, result]) => result === "true").map(([name]) => name);
  const grantedPermissions = [...new Set(knownRoles.flatMap(name => (block.grants?.[name] ?? []).flatMap(permission => permission === "all" ? block.permissions : [permission])))];
  const forbidden = matchedRules.some(rule => rule.effect === "forbid" && rule.outcome !== "false");
  return {
    allowed,
    resolvedRoles: roles.detail,
    grantedPermissions,
    matchedRules,
    diagnostics: [...cache.diagnostics],
    finalDecision: allowed ? `Allowed: action "${action}" is granted via roles [${knownRoles.join(", ")}]` : forbidden ? `Denied: action "${action}" is forbidden by rule or indeterminate forbid` : `Denied: action "${action}" is not granted (default-deny)`,
  };
}
