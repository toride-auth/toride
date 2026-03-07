// T028: Direct role resolution
// T036-T042: Full role resolution with derived roles, cycle detection, depth limits

import type {
  ActorRef,
  ResourceRef,
  // RelationResolver removed — replaced by AttributeCache
  ResolvedRolesDetail,
  DerivedRoleTrace,
  Policy,
  ResourceBlock,
  DerivedRoleEntry,
  ConditionExpression,
} from "../types.js";
import { CycleError, DepthLimitError } from "../types.js";
import type { AttributeCache } from "./cache.js";
import { evaluateCondition } from "./condition.js";

/** Default maximum depth for derived role chain traversal. */
const DEFAULT_MAX_DERIVED_ROLE_DEPTH = 5;

/**
 * Resolve direct roles for an actor on a resource.
 * FR-008: getRoles has been removed. Direct roles are always empty.
 * All roles are now derived through derived_roles policy entries.
 */
export async function resolveDirectRoles(
  _actor: ActorRef,
  _resource: ResourceRef,
  _cache: AttributeCache,
): Promise<ResolvedRolesDetail> {
  // FR-008: No more getRoles — direct roles always empty.
  // All role assignment happens through derived_roles.
  return { direct: [], derived: [] };
}

/**
 * Resolve all roles (direct + derived) for an actor on a resource.
 * Evaluates all 5 derivation patterns exhaustively with cycle detection
 * and configurable depth limits.
 *
 * Patterns:
 *   1. from_global_role - Global role derived from actor attributes
 *   2. from_role + on_relation - Role on a related resource
 *   3. from_relation - Actor identity matches relation target
 *   4. actor_type + when - Actor-type-specific condition
 *   5. when only - Condition without actor type restriction
 */
export async function resolveRoles(
  actor: ActorRef,
  resource: ResourceRef,
  cache: AttributeCache,
  resourceBlock: ResourceBlock,
  policy: Policy,
  options?: { maxDerivedRoleDepth?: number },
): Promise<ResolvedRolesDetail> {
  const maxDepth =
    options?.maxDerivedRoleDepth ?? DEFAULT_MAX_DERIVED_ROLE_DEPTH;

  // FR-008: No more getRoles — direct roles always empty.
  const direct: string[] = [];

  // Step 2: Evaluate derived roles exhaustively
  const derived: DerivedRoleTrace[] = [];
  const derivedEntries = resourceBlock.derived_roles ?? [];

  // Initial visited set contains the current resource
  const visited = new Set<string>();
  visited.add(`${resource.type}:${resource.id}`);

  for (const entry of derivedEntries) {
    try {
      const traces = await evaluateDerivedRole(
        entry,
        actor,
        resource,
        cache,
        resourceBlock,
        policy,
        maxDepth,
        maxDepth,
        visited,
      );
      derived.push(...traces);
    } catch (e) {
      // Re-throw CycleError and DepthLimitError
      if (e instanceof CycleError || e instanceof DepthLimitError) {
        throw e;
      }
      // Fail-closed: other errors -> skip this derivation path
    }
  }

  return { direct, derived };
}

/**
 * Evaluate a single derived role entry. Returns traces for each successful match.
 * This function dispatches to the appropriate pattern handler.
 */
async function evaluateDerivedRole(
  entry: DerivedRoleEntry,
  actor: ActorRef,
  resource: ResourceRef,
  cache: AttributeCache,
  resourceBlock: ResourceBlock,
  policy: Policy,
  depthRemaining: number,
  maxDepth: number,
  visited: Set<string>,
): Promise<DerivedRoleTrace[]> {
  // Pattern 1: from_global_role
  if (entry.from_global_role !== undefined) {
    return evaluateGlobalRole(entry, actor, policy);
  }

  // Pattern 2: from_role + on_relation
  if (entry.from_role !== undefined && entry.on_relation !== undefined) {
    return evaluateRelationRole(
      entry,
      actor,
      resource,
      cache,
      policy,
      depthRemaining,
      maxDepth,
      visited,
    );
  }

  // Pattern 3: from_relation (identity check)
  if (entry.from_relation !== undefined) {
    return evaluateRelationIdentity(entry, actor, resource, cache);
  }

  // Pattern 4: actor_type + when
  if (entry.actor_type !== undefined && entry.when !== undefined) {
    return evaluateActorTypeCondition(entry, actor, resource, cache, resourceBlock, policy);
  }

  // Pattern 5: when only (no actor_type, no other pattern fields)
  if (entry.when !== undefined) {
    return evaluateWhenOnly(entry, actor, resource, cache, resourceBlock, policy);
  }

  return [];
}

// ─── Pattern 1: Global Role ──────────────────────────────────────────

/**
 * T036: Evaluate global role derivation.
 * Matches actor type and evaluates `when` conditions against actor attributes.
 */
function evaluateGlobalRole(
  entry: DerivedRoleEntry,
  actor: ActorRef,
  policy: Policy,
): DerivedRoleTrace[] {
  const globalRoleName = entry.from_global_role!;
  const globalRole = policy.global_roles?.[globalRoleName];
  if (!globalRole) return [];

  // Check actor type matches
  if (actor.type !== globalRole.actor_type) return [];

  // Evaluate the when condition against actor attributes
  if (!evaluateActorCondition(globalRole.when, actor)) return [];

  return [
    {
      role: entry.role,
      via: `global_role:${globalRoleName}`,
    },
  ];
}

// ─── Pattern 2: Relation-based Role ──────────────────────────────────

/**
 * T037: Evaluate relation-based role derivation.
 * Traverses the relation, resolves roles on the related resource(s),
 * and checks if the actor has the required role there.
 */
async function evaluateRelationRole(
  entry: DerivedRoleEntry,
  actor: ActorRef,
  resource: ResourceRef,
  cache: AttributeCache,
  policy: Policy,
  depthRemaining: number,
  maxDepth: number,
  visited: Set<string>,
): Promise<DerivedRoleTrace[]> {
  // T041: Check depth limit
  if (depthRemaining <= 0) {
    throw new DepthLimitError(
      `Derived role chain exceeded maximum depth of ${maxDepth}`,
      maxDepth,
      "derivation",
    );
  }

  const relationName = entry.on_relation!;
  const requiredRole = entry.from_role!;

  // Resolve the relation target from resource attributes (via cache)
  // Full relation traversal via attributes is deferred to US3/US4.
  // For now, we look up the relation field in attributes and check if it's a ResourceRef.
  let relatedRefs: ResourceRef[];
  try {
    const attrs = await cache.resolve(resource);
    const relValue = attrs[relationName];
    if (!relValue) return [];
    if (Array.isArray(relValue)) {
      relatedRefs = relValue.filter(
        (r): r is ResourceRef =>
          r != null && typeof r === "object" && "type" in r && "id" in r,
      );
    } else if (
      typeof relValue === "object" &&
      relValue !== null &&
      "type" in relValue &&
      "id" in relValue
    ) {
      relatedRefs = [relValue as ResourceRef];
    } else {
      return [];
    }
  } catch {
    return []; // Fail-closed
  }

  const traces: DerivedRoleTrace[] = [];

  for (const relatedRef of relatedRefs) {
    const refKey = `${relatedRef.type}:${relatedRef.id}`;

    // T040: Cycle detection
    if (visited.has(refKey)) {
      throw new CycleError(
        `Cycle detected in derived role resolution: ${refKey} already visited`,
        [...visited, refKey],
      );
    }

    // Clone visited set for branch safety (DAG-safe)
    const branchVisited = new Set(visited);
    branchVisited.add(refKey);

    // FR-008: No direct roles. Check derived roles on the related resource.
    let hasRole = false;
    const relatedBlock = policy.resources[relatedRef.type];
    if (relatedBlock?.derived_roles?.length) {
      const relatedResult = await resolveRolesRecursive(
        actor,
        relatedRef,
        cache,
        relatedBlock,
        policy,
        depthRemaining - 1,
        maxDepth,
        branchVisited,
      );
      if (relatedResult.derived.some((d) => d.role === requiredRole)) {
        hasRole = true;
      }
    }

    if (hasRole) {
      traces.push({
        role: entry.role,
        via: `from_role:${requiredRole} on ${relationName} -> ${relatedRef.type}:${relatedRef.id}`,
      });
    }
  }

  return traces;
}

/**
 * Internal recursive role resolution for relation-based derivation.
 * Called when checking roles on related resources.
 */
async function resolveRolesRecursive(
  actor: ActorRef,
  resource: ResourceRef,
  cache: AttributeCache,
  resourceBlock: ResourceBlock,
  policy: Policy,
  depthRemaining: number,
  maxDepth: number,
  visited: Set<string>,
): Promise<ResolvedRolesDetail> {
  if (depthRemaining <= 0) {
    throw new DepthLimitError(
      `Derived role chain exceeded maximum depth of ${maxDepth}`,
      maxDepth,
      "derivation",
    );
  }

  // FR-008: No more getRoles — direct roles always empty.
  const direct: string[] = [];

  const derived: DerivedRoleTrace[] = [];
  const derivedEntries = resourceBlock.derived_roles ?? [];

  for (const entry of derivedEntries) {
    try {
      const traces = await evaluateDerivedRole(
        entry,
        actor,
        resource,
        cache,
        resourceBlock,
        policy,
        depthRemaining,
        maxDepth,
        visited,
      );
      derived.push(...traces);
    } catch (e) {
      if (e instanceof CycleError || e instanceof DepthLimitError) {
        throw e;
      }
      // Fail-closed: other errors -> skip
    }
  }

  return { direct, derived };
}

// ─── Pattern 3: Relation Identity ────────────────────────────────────

/**
 * T038: Evaluate relation identity derivation.
 * Compares actor ID and type with the relation target.
 */
async function evaluateRelationIdentity(
  entry: DerivedRoleEntry,
  actor: ActorRef,
  resource: ResourceRef,
  cache: AttributeCache,
): Promise<DerivedRoleTrace[]> {
  const relationName = entry.from_relation!;

  // Resolve the relation target from resource attributes (via cache)
  let relatedRefs: ResourceRef[];
  try {
    const attrs = await cache.resolve(resource);
    const relValue = attrs[relationName];
    if (!relValue) return [];
    if (Array.isArray(relValue)) {
      relatedRefs = relValue.filter(
        (r): r is ResourceRef =>
          r != null && typeof r === "object" && "type" in r && "id" in r,
      );
    } else if (
      typeof relValue === "object" &&
      relValue !== null &&
      "type" in relValue &&
      "id" in relValue
    ) {
      relatedRefs = [relValue as ResourceRef];
    } else {
      return [];
    }
  } catch {
    return []; // Fail-closed
  }

  for (const ref of relatedRefs) {
    // Compare both type and ID
    if (ref.type === actor.type && ref.id === actor.id) {
      return [
        {
          role: entry.role,
          via: `identity on ${relationName} -> ${ref.type}:${ref.id}`,
        },
      ];
    }
  }

  return [];
}

// ─── Pattern 4: Actor-type + when ────────────────────────────────────

/**
 * T039/T024: Evaluate actor-type-conditional derivation.
 * Requires actor type match AND condition satisfaction.
 * Now async to support $resource.* references via AttributeCache.
 *
 * Evaluation strategy (Design decision 5):
 * - Actor part evaluated eagerly; if actor_type fails, resource part never evaluated.
 * - $env conditions are fail-closed (Design decision 4).
 */
async function evaluateActorTypeCondition(
  entry: DerivedRoleEntry,
  actor: ActorRef,
  resource: ResourceRef,
  cache: AttributeCache,
  resourceBlock: ResourceBlock,
  policy: Policy,
): Promise<DerivedRoleTrace[]> {
  // Silently skip if actor type doesn't match (eager actor evaluation)
  if (actor.type !== entry.actor_type) return [];

  // Use full condition evaluator for $resource.* support
  const matched = await evaluateRoleCondition(entry.when!, actor, resource, cache, resourceBlock, policy);
  if (!matched) return [];

  return [
    {
      role: entry.role,
      via: `actor_type:${entry.actor_type} + when condition`,
    },
  ];
}

// ─── Pattern 5: when-only ────────────────────────────────────────────

/**
 * T039/T024: Evaluate when-only condition (no actor type restriction).
 * Now async to support $resource.* references via AttributeCache.
 */
async function evaluateWhenOnly(
  entry: DerivedRoleEntry,
  actor: ActorRef,
  resource: ResourceRef,
  cache: AttributeCache,
  resourceBlock: ResourceBlock,
  policy: Policy,
): Promise<DerivedRoleTrace[]> {
  const matched = await evaluateRoleCondition(entry.when!, actor, resource, cache, resourceBlock, policy);
  if (!matched) return [];

  return [
    {
      role: entry.role,
      via: `when condition`,
    },
  ];
}

// ─── Role Condition Evaluator (T024: full context) ────────────────────

/**
 * T024: Evaluate a condition expression in the full evaluation context.
 * Uses the condition evaluator from condition.ts to support $resource.*,
 * $actor.*, and $env.* references.
 *
 * Design decisions:
 * - $env conditions are fail-closed (return false) to prevent privilege escalation.
 *   This is handled by the condition evaluator's strict null semantics.
 * - Errors during evaluation are caught and treated as fail-closed (false).
 */
async function evaluateRoleCondition(
  condition: ConditionExpression,
  actor: ActorRef,
  resource: ResourceRef,
  cache: AttributeCache,
  resourceBlock: ResourceBlock,
  policy: Policy,
): Promise<boolean> {
  try {
    return await evaluateCondition(
      condition,
      actor,
      resource,
      cache,
      {}, // empty env — $env conditions will resolve to undefined -> fail-closed
      resourceBlock,
      policy,
    );
  } catch {
    // Fail-closed: errors during evaluation -> role not assigned
    return false;
  }
}

// ─── Minimal Actor Condition Evaluator (Pattern 1 only) ────────────────────

/**
 * Evaluate a condition expression against actor attributes only.
 * Used for Pattern 1 (global roles) which only reference actor attributes.
 * $resource and $env conditions are fail-closed.
 */
/** Maximum nesting depth for any/all combinators in actor conditions (fail-closed). */
const MAX_ACTOR_COMBINATOR_DEPTH = 10;

function evaluateActorCondition(
  condition: ConditionExpression,
  actor: ActorRef,
  combinatorDepth: number = 0,
): boolean {
  // Handle logical combinators with recursion depth limit
  if ("any" in condition && Array.isArray(condition.any)) {
    if (combinatorDepth >= MAX_ACTOR_COMBINATOR_DEPTH) return false;
    return (condition.any as ConditionExpression[]).some((c) =>
      evaluateActorCondition(c, actor, combinatorDepth + 1),
    );
  }
  if ("all" in condition && Array.isArray(condition.all)) {
    if (combinatorDepth >= MAX_ACTOR_COMBINATOR_DEPTH) return false;
    return (condition.all as ConditionExpression[]).every((c) =>
      evaluateActorCondition(c, actor, combinatorDepth + 1),
    );
  }

  // Simple conditions: all key-value pairs ANDed together
  const entries = Object.entries(condition as Record<string, unknown>);
  for (const [key, expectedValue] of entries) {
    if (key.startsWith("$actor.")) {
      const attrName = key.slice(7); // Remove "$actor."
      const actualValue = actor.attributes[attrName];

      // Strict null semantics: undefined never equals anything
      if (actualValue === undefined || actualValue === null) return false;

      if (actualValue !== expectedValue) return false;
    }
    // $resource and $env conditions -> fail-closed (return false)
    if (key.startsWith("$resource.") || key.startsWith("$env.")) return false;
  }

  return true;
}
