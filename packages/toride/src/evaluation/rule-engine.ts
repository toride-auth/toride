import type { ActorRef, ResourceRef, ResourceBlock, ExplainResult, MatchedRule, Policy, Rule } from "../types.js";
import type { AttributeCache } from "./cache.js";
import { resolveRoleOutcomes } from "./role-resolver.js";
import type { RoleOptions, RoleOutcome } from "./role-resolver.js";
import { evaluateConditionOutcome } from "./condition.js";
import { all, any, not, composeAction } from "./semantics.js";

export async function evaluate(actor: ActorRef, action: string, resource: ResourceRef, block: ResourceBlock, cache: AttributeCache, policy: Policy, options: RoleOptions = {}): Promise<ExplainResult> {
  const roles = await resolveRoleOutcomes(actor, resource, cache, block, policy, options);
  const pendingRules: { rule: Rule; outcome: RoleOutcome }[] = [];
  const outcome = await composeAction<RoleOutcome>(block, action, {
    all: values => () => all(values.map(value => value())),
    any: values => () => any(values.map(value => value())),
    not: value => () => not(value()),
  },
    async name => roles.outcomes.get(name) ?? (() => "false"),
    async rule => {
      const result = await evaluateConditionOutcome(rule.when, actor, resource, cache, options.env ?? {}, block, policy, options);
      return () => result;
    },
    (rule, result) => pendingRules.push({ rule, outcome: result }),
  );
  const matchedRules: MatchedRule[] = pendingRules.map(({ rule, outcome }) => {
    const result = outcome();
    return { effect: rule.effect, matched: result === "true", outcome: result, rule, resolvedValues: {} };
  });
  const allowed = outcome() === "true" && !cache.hasConflict && !cache.isAbsent(resource);
  const knownRoles = [...roles.outcomes].filter(([, result]) => result() === "true").map(([name]) => name);
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
