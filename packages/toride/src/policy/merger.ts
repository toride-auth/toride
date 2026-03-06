// T096: mergePolicies() - Additive policy composition with conflict detection

import type {
  Policy,
  ResourceBlock,
  FieldAccessDef,
  GlobalRole,
  ActorDeclaration,
  DerivedRoleEntry,
  Rule,
  RelationDef,
} from "../types.js";

/**
 * Merge two policies into one.
 *
 * - Actors: additive union of actor types and their attributes
 * - Global roles: additive union (overlay wins on conflict)
 * - Resources: additive union of resource types; overlapping resources merge
 *   roles, permissions, relations, derived_roles, rules, and field_access
 * - Grants: throws on conflicting grants (same role, different permission sets)
 * - Rules: silently appended
 * - Tests: dropped (not merged)
 */
export function mergePolicies(base: Policy, overlay: Policy): Policy {
  const actors = mergeActors(base.actors, overlay.actors);
  const global_roles = mergeGlobalRoles(base.global_roles, overlay.global_roles);
  const resources = mergeResources(base.resources, overlay.resources);

  const result: Policy = {
    version: "1",
    actors,
    resources,
  };

  if (global_roles && Object.keys(global_roles).length > 0) {
    (result as { global_roles?: Record<string, GlobalRole> }).global_roles = global_roles;
  }

  return result;
}

function mergeActors(
  base: Record<string, ActorDeclaration>,
  overlay: Record<string, ActorDeclaration>,
): Record<string, ActorDeclaration> {
  const result: Record<string, ActorDeclaration> = { ...base };

  for (const [name, actor] of Object.entries(overlay)) {
    if (result[name]) {
      result[name] = {
        attributes: { ...result[name].attributes, ...actor.attributes },
      };
    } else {
      result[name] = actor;
    }
  }

  return result;
}

function mergeGlobalRoles(
  base?: Record<string, GlobalRole>,
  overlay?: Record<string, GlobalRole>,
): Record<string, GlobalRole> | undefined {
  if (!base && !overlay) return undefined;
  return { ...(base ?? {}), ...(overlay ?? {}) };
}

function mergeResources(
  base: Record<string, ResourceBlock>,
  overlay: Record<string, ResourceBlock>,
): Record<string, ResourceBlock> {
  const result: Record<string, ResourceBlock> = {};

  // Copy base resources
  for (const [name, block] of Object.entries(base)) {
    result[name] = block;
  }

  // Merge overlay resources
  for (const [name, overlayBlock] of Object.entries(overlay)) {
    if (result[name]) {
      result[name] = mergeResourceBlock(name, result[name], overlayBlock);
    } else {
      result[name] = overlayBlock;
    }
  }

  return result;
}

function mergeResourceBlock(
  resourceName: string,
  base: ResourceBlock,
  overlay: ResourceBlock,
): ResourceBlock {
  const roles = unionArrays(base.roles, overlay.roles);
  const permissions = unionArrays(base.permissions, overlay.permissions);
  const grants = mergeGrants(resourceName, base.grants, overlay.grants);
  const relations = mergeRelations(base.relations, overlay.relations);
  const derived_roles = appendArrays(base.derived_roles, overlay.derived_roles);
  const rules = appendArrays(base.rules, overlay.rules);
  const field_access = mergeFieldAccess(base.field_access, overlay.field_access);

  const result: Record<string, unknown> = { roles, permissions };

  if (grants && Object.keys(grants).length > 0) {
    result.grants = grants;
  }
  if (relations && Object.keys(relations).length > 0) {
    result.relations = relations;
  }
  if (derived_roles && derived_roles.length > 0) {
    result.derived_roles = derived_roles;
  }
  if (rules && rules.length > 0) {
    result.rules = rules;
  }
  if (field_access && Object.keys(field_access).length > 0) {
    result.field_access = field_access;
  }

  return result as ResourceBlock;
}

function unionArrays(a: string[], b: string[]): string[] {
  return [...new Set([...a, ...b])];
}

function appendArrays<T>(a?: T[], b?: T[]): T[] | undefined {
  if (!a && !b) return undefined;
  return [...(a ?? []), ...(b ?? [])];
}

function mergeGrants(
  resourceName: string,
  base?: Record<string, string[]>,
  overlay?: Record<string, string[]>,
): Record<string, string[]> | undefined {
  if (!base && !overlay) return undefined;
  if (!base) return overlay;
  if (!overlay) return base;

  const result: Record<string, string[]> = { ...base };

  for (const [role, perms] of Object.entries(overlay)) {
    if (result[role]) {
      // Check for conflict: same role, different permission sets
      const existingSet = new Set(result[role]);
      const newSet = new Set(perms);

      if (existingSet.size !== newSet.size || ![...existingSet].every((p) => newSet.has(p))) {
        throw new Error(
          `Grant conflict on resource "${resourceName}": role "${role}" has different permission sets. ` +
          `Base: [${result[role].join(", ")}], Overlay: [${perms.join(", ")}]`,
        );
      }
      // Identical - keep existing
    } else {
      result[role] = perms;
    }
  }

  return result;
}

function mergeRelations(
  base?: Record<string, RelationDef>,
  overlay?: Record<string, RelationDef>,
): Record<string, RelationDef> | undefined {
  if (!base && !overlay) return undefined;
  return { ...(base ?? {}), ...(overlay ?? {}) };
}

function mergeFieldAccess(
  base?: Record<string, FieldAccessDef>,
  overlay?: Record<string, FieldAccessDef>,
): Record<string, FieldAccessDef> | undefined {
  if (!base && !overlay) return undefined;
  if (!base) return overlay;
  if (!overlay) return base;

  const result: Record<string, FieldAccessDef> = { ...base };

  for (const [field, def] of Object.entries(overlay)) {
    if (result[field]) {
      const mergedRead = unionArrays(result[field].read ?? [], def.read ?? []);
      const mergedUpdate = unionArrays(result[field].update ?? [], def.update ?? []);

      const merged: Record<string, string[]> = {};
      if (mergedRead.length > 0) merged.read = mergedRead;
      if (mergedUpdate.length > 0) merged.update = mergedUpdate;

      result[field] = merged as FieldAccessDef;
    } else {
      result[field] = def;
    }
  }

  return result;
}
