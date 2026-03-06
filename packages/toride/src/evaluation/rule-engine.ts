// T029: Grant evaluation
// Maps resolved roles to permissions via grants, resolves `all` keyword,
// checks if action is in granted permissions, returns ExplainResult.
// Default-deny semantics.

import type {
  ActorRef,
  ResourceRef,
  RelationResolver,
  ResourceBlock,
  ExplainResult,
} from "../types.js";
import { resolveDirectRoles } from "./role-resolver.js";

/**
 * Expand grants for resolved roles, handling the `all` keyword.
 * When a grant maps a role to `["all"]`, substitutes with the resource's
 * full `permissions` array.
 */
function expandGrants(
  roles: string[],
  grants: Record<string, string[]>,
  allPermissions: string[],
): string[] {
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

  return [...permissionSet];
}

/**
 * Evaluate whether an actor can perform an action on a resource.
 * Returns a full ExplainResult (can() extracts .allowed).
 *
 * Steps:
 * 1. Resolve direct roles
 * 2. Expand grants (handling `all` keyword)
 * 3. Check if action is in granted permissions
 * 4. Return ExplainResult with default-deny
 */
export async function evaluate(
  actor: ActorRef,
  action: string,
  resource: ResourceRef,
  resourceBlock: ResourceBlock,
  resolver: RelationResolver,
): Promise<ExplainResult> {
  // Step 1: Resolve direct roles
  const resolvedRoles = await resolveDirectRoles(actor, resource, resolver);
  const allRoles = [...resolvedRoles.direct];

  // Step 2: Expand grants
  const grants = resourceBlock.grants ?? {};
  const grantedPermissions = expandGrants(
    allRoles,
    grants,
    resourceBlock.permissions,
  );

  // Step 3: Check if action is in granted permissions (default-deny)
  const allowed = grantedPermissions.includes(action);

  // Step 4: Build ExplainResult
  return {
    allowed,
    resolvedRoles,
    grantedPermissions,
    matchedRules: [], // No conditional rules in US1
    finalDecision: allowed
      ? `Allowed: action "${action}" is granted via roles [${allRoles.join(", ")}]`
      : `Denied: action "${action}" is not granted (default-deny)`,
  };
}
