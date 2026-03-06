// T029: Grant evaluation
// T049: Permit/forbid rule evaluation with forbid-wins precedence
// T050: Roles-only guard
// T051: Custom evaluator support
// Maps resolved roles to permissions via grants, resolves `all` keyword,
// evaluates conditional rules with forbid-wins, returns ExplainResult.
// Default-deny semantics.

import type {
  ActorRef,
  ResourceRef,
  RelationResolver,
  ResourceBlock,
  ExplainResult,
  MatchedRule,
  Policy,
  Rule,
  EvaluatorFn,
} from "../types.js";
import { resolveRoles } from "./role-resolver.js";
import { evaluateCondition } from "./condition.js";

/**
 * Expand grants for resolved roles, handling the `all` keyword.
 * When a grant maps a role to `["all"]`, substitutes with the resource's
 * full `permissions` array.
 * Returns a Set for O(1) membership checks.
 */
function expandGrants(
  roles: string[],
  grants: Record<string, string[]>,
  allPermissions: string[],
): Set<string> {
  const permissionSet = new Set<string>();

  for (const role of roles) {
    const roleGrants = grants[role];
    if (!roleGrants) continue;

    for (const perm of roleGrants) {
      if (perm === "all") {
        for (const p of allPermissions) {
          permissionSet.add(p);
        }
      } else {
        permissionSet.add(perm);
      }
    }
  }

  return permissionSet;
}

/**
 * Evaluate whether an actor can perform an action on a resource.
 * Returns a full ExplainResult (can() extracts .allowed).
 *
 * Steps:
 * 1. Resolve direct + derived roles
 * 2. Expand grants (handling `all` keyword)
 * 3. Check if action is in granted permissions
 * 4. Evaluate conditional rules (permit/forbid) with forbid-wins
 * 5. Return ExplainResult
 */
export async function evaluate(
  actor: ActorRef,
  action: string,
  resource: ResourceRef,
  resourceBlock: ResourceBlock,
  resolver: RelationResolver,
  policy: Policy,
  options?: {
    maxDerivedRoleDepth?: number;
    maxConditionDepth?: number;
    customEvaluators?: Record<string, EvaluatorFn>;
    env?: Record<string, unknown>;
  },
): Promise<ExplainResult> {
  // Step 1: Resolve direct + derived roles
  const resolvedRoles = await resolveRoles(
    actor,
    resource,
    resolver,
    resourceBlock,
    policy,
    options,
  );
  // Combine direct and derived roles for grant expansion
  const derivedRoleNames = resolvedRoles.derived.map((d) => d.role);
  const allRoles = [
    ...new Set([...resolvedRoles.direct, ...derivedRoleNames]),
  ];

  // Step 2: Expand grants (returns Set for O(1) lookups)
  const grants = resourceBlock.grants ?? {};
  const grantedPermissionSet = expandGrants(
    allRoles,
    grants,
    resourceBlock.permissions,
  );
  const grantedPermissions = [...grantedPermissionSet];

  // Step 3: Check if action is in granted permissions (default-deny)
  let allowed = grantedPermissionSet.has(action);

  // Step 4: Evaluate conditional rules
  const rules = resourceBlock.rules ?? [];
  const matchedRules: MatchedRule[] = [];
  const env = options?.env ?? {};

  if (rules.length > 0) {
    const { permitGranted, forbidMatched, ruleResults } = await evaluateRules(
      rules,
      action,
      allRoles,
      actor,
      resource,
      resolver,
      env,
      resourceBlock,
      policy,
      options,
    );

    matchedRules.push(...ruleResults);

    // Forbid-wins: if any forbid rule matches for this action, deny
    if (forbidMatched) {
      allowed = false;
    }
    // Permit rules can grant access not in static grants
    else if (!allowed && permitGranted) {
      allowed = true;
    }
  }

  // Step 5: Build ExplainResult
  let finalDecision: string;
  if (matchedRules.some((r) => r.effect === "forbid" && r.matched)) {
    finalDecision = `Denied: action "${action}" is forbidden by rule`;
  } else if (allowed) {
    finalDecision = `Allowed: action "${action}" is granted via roles [${allRoles.join(", ")}]`;
  } else {
    finalDecision = `Denied: action "${action}" is not granted (default-deny)`;
  }

  return {
    allowed,
    resolvedRoles,
    grantedPermissions,
    matchedRules,
    finalDecision,
  };
}

/**
 * Evaluate all rules for a given action.
 * Returns whether any permit rule grants and any forbid rule matches.
 */
async function evaluateRules(
  rules: Rule[],
  action: string,
  allRoles: string[],
  actor: ActorRef,
  resource: ResourceRef,
  resolver: RelationResolver,
  env: Record<string, unknown>,
  resourceBlock: ResourceBlock,
  policy: Policy,
  options?: {
    maxConditionDepth?: number;
    customEvaluators?: Record<string, EvaluatorFn>;
  },
): Promise<{
  permitGranted: boolean;
  forbidMatched: boolean;
  ruleResults: MatchedRule[];
}> {
  let permitGranted = false;
  let forbidMatched = false;
  const ruleResults: MatchedRule[] = [];

  for (const rule of rules) {
    // Skip rules that don't apply to this action
    if (!rule.permissions.includes(action)) continue;

    // T050: Roles-only guard - skip if actor lacks required role
    if (rule.roles && rule.roles.length > 0) {
      if (!rule.roles.some((r) => allRoles.includes(r))) {
        ruleResults.push({
          effect: rule.effect,
          matched: false,
          rule,
          resolvedValues: {},
        });
        continue;
      }
    }

    // Short-circuit: skip permit condition evaluation once a forbid has matched
    if (forbidMatched && rule.effect === "permit") {
      ruleResults.push({
        effect: rule.effect,
        matched: false,
        rule,
        resolvedValues: {},
      });
      continue;
    }

    // Evaluate condition with fail-closed semantics
    let conditionMatched: boolean;
    try {
      conditionMatched = await evaluateCondition(
        rule.when,
        actor,
        resource,
        resolver,
        env,
        resourceBlock,
        policy,
        {
          maxConditionDepth: options?.maxConditionDepth,
          customEvaluators: options?.customEvaluators,
          ruleEffect: rule.effect,
        },
      );
    } catch {
      // Fail-closed: permit errors -> not matched, forbid errors -> matched (deny)
      conditionMatched = rule.effect === "forbid";
    }

    ruleResults.push({
      effect: rule.effect,
      matched: conditionMatched,
      rule,
      resolvedValues: {},
    });

    if (conditionMatched) {
      if (rule.effect === "forbid") {
        forbidMatched = true;
      } else if (rule.effect === "permit") {
        permitGranted = true;
      }
    }
  }

  return { permitGranted, forbidMatched, ruleResults };
}
