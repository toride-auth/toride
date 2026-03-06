// T028: Direct role resolution
// Calls resolver.getRoles() and returns ResolvedRolesDetail with direct populated.
// Fail-closed: if resolver throws, returns empty role set.

import type {
  ActorRef,
  ResourceRef,
  RelationResolver,
  ResolvedRolesDetail,
} from "../types.js";

/**
 * Resolve direct roles for an actor on a resource.
 * Only calls `resolver.getRoles()` — derived roles are deferred to Phase 4.
 * Fail-closed: if the resolver throws, returns empty roles (denial).
 */
export async function resolveDirectRoles(
  actor: ActorRef,
  resource: ResourceRef,
  resolver: RelationResolver,
): Promise<ResolvedRolesDetail> {
  try {
    const direct = await resolver.getRoles(actor, resource);
    return { direct, derived: [] };
  } catch {
    // Fail-closed: resolver error → empty roles → denial
    return { direct: [], derived: [] };
  }
}
