// T021: Cross-reference semantic validator

import { ValidationError } from "../types.js";
import type { Policy, DerivedRoleEntry } from "../types.js";

/**
 * Validate cross-references in a structurally valid policy.
 * Throws ValidationError with logical path messages on first error found.
 */
export function validatePolicy(policy: Policy): void {
  const declaredActorTypes = new Set(Object.keys(policy.actors));
  const declaredGlobalRoles = new Set(
    policy.global_roles ? Object.keys(policy.global_roles) : [],
  );
  const declaredResourceTypes = new Set(Object.keys(policy.resources));

  // Validate global_roles actor_type references
  if (policy.global_roles) {
    for (const [roleName, globalRole] of Object.entries(policy.global_roles)) {
      if (!declaredActorTypes.has(globalRole.actor_type)) {
        throw new ValidationError(
          `global_roles.${roleName}.actor_type references undeclared actor type "${globalRole.actor_type}"`,
          `global_roles.${roleName}.actor_type`,
        );
      }
    }
  }

  // Validate each resource block
  for (const [resName, resource] of Object.entries(policy.resources)) {
    const declaredRoles = new Set(resource.roles);
    const declaredPermissions = new Set(resource.permissions);
    const declaredRelations = new Set(
      resource.relations ? Object.keys(resource.relations) : [],
    );

    // Validate relation targets reference declared resources (or actor types for identity relations)
    if (resource.relations) {
      for (const [relName, relDef] of Object.entries(resource.relations)) {
        // Relation target can be a resource type or an actor type (for identity relations like assignee)
        if (
          !declaredResourceTypes.has(relDef.resource) &&
          !declaredActorTypes.has(relDef.resource)
        ) {
          throw new ValidationError(
            `resources.${resName}.relations.${relName}.resource references undeclared resource type "${relDef.resource}"`,
            `resources.${resName}.relations.${relName}.resource`,
          );
        }
      }
    }

    // Validate grants
    if (resource.grants) {
      for (const [roleName, permissions] of Object.entries(resource.grants)) {
        if (!declaredRoles.has(roleName)) {
          throw new ValidationError(
            `resources.${resName}.grants references undeclared role "${roleName}"`,
            `resources.${resName}.grants.${roleName}`,
          );
        }
        for (const perm of permissions) {
          if (perm !== "all" && !declaredPermissions.has(perm)) {
            throw new ValidationError(
              `resources.${resName}.grants.${roleName} references undeclared permission "${perm}"`,
              `resources.${resName}.grants.${roleName}`,
            );
          }
        }
      }
    }

    // Validate derived_roles
    if (resource.derived_roles) {
      for (let i = 0; i < resource.derived_roles.length; i++) {
        const entry = resource.derived_roles[i];
        const path = `resources.${resName}.derived_roles[${i}]`;

        // Target role must be declared
        if (!declaredRoles.has(entry.role)) {
          throw new ValidationError(
            `${path} references undeclared role "${entry.role}"`,
            path,
          );
        }

        // Validate mutual exclusivity of derivation patterns
        validateDerivedRolePatterns(entry, path);

        // Validate pattern-specific references
        if (entry.from_global_role !== undefined) {
          if (!declaredGlobalRoles.has(entry.from_global_role)) {
            throw new ValidationError(
              `${path} references undeclared global role "${entry.from_global_role}"`,
              path,
            );
          }
        }

        if (entry.on_relation !== undefined) {
          if (!declaredRelations.has(entry.on_relation)) {
            throw new ValidationError(
              `${path} references undeclared relation "${entry.on_relation}"`,
              path,
            );
          }
        }

        if (entry.from_relation !== undefined) {
          if (!declaredRelations.has(entry.from_relation)) {
            throw new ValidationError(
              `${path} references undeclared relation "${entry.from_relation}"`,
              path,
            );
          }
        }

        if (entry.actor_type !== undefined) {
          if (!declaredActorTypes.has(entry.actor_type)) {
            throw new ValidationError(
              `${path} references undeclared actor type "${entry.actor_type}"`,
              path,
            );
          }
        }
      }
    }

    // Validate rules
    if (resource.rules) {
      for (let i = 0; i < resource.rules.length; i++) {
        const rule = resource.rules[i];
        const path = `resources.${resName}.rules[${i}]`;

        for (const perm of rule.permissions) {
          if (!declaredPermissions.has(perm)) {
            throw new ValidationError(
              `${path}.permissions references undeclared permission "${perm}"`,
              `${path}.permissions`,
            );
          }
        }

        if (rule.roles) {
          for (const roleName of rule.roles) {
            if (!declaredRoles.has(roleName)) {
              throw new ValidationError(
                `${path}.roles references undeclared role "${roleName}"`,
                `${path}.roles`,
              );
            }
          }
        }
      }
    }

    // Validate field_access
    if (resource.field_access) {
      for (const [fieldName, fieldDef] of Object.entries(
        resource.field_access,
      )) {
        const fpath = `resources.${resName}.field_access.${fieldName}`;
        if (fieldDef.read) {
          for (const roleName of fieldDef.read) {
            if (!declaredRoles.has(roleName)) {
              throw new ValidationError(
                `${fpath}.read references undeclared role "${roleName}"`,
                `${fpath}.read`,
              );
            }
          }
        }
        if (fieldDef.update) {
          for (const roleName of fieldDef.update) {
            if (!declaredRoles.has(roleName)) {
              throw new ValidationError(
                `${fpath}.update references undeclared role "${roleName}"`,
                `${fpath}.update`,
              );
            }
          }
        }
      }
    }
  }
}

/**
 * Validate that a derived role entry uses exactly one derivation pattern.
 * Patterns:
 *   1. from_global_role (alone)
 *   2. from_role + on_relation (both required together)
 *   3. from_relation (alone)
 *   4. actor_type + when (conditional)
 *   5. when only (no actor_type)
 */
function validateDerivedRolePatterns(
  entry: DerivedRoleEntry,
  path: string,
): void {
  const hasGlobal = entry.from_global_role !== undefined;
  const hasFromRole = entry.from_role !== undefined;
  const hasOnRelation = entry.on_relation !== undefined;
  const hasFromRelation = entry.from_relation !== undefined;
  const hasActorType = entry.actor_type !== undefined;
  const hasWhen = entry.when !== undefined;

  // from_role and on_relation must appear together
  if (hasFromRole !== hasOnRelation) {
    throw new ValidationError(
      `${path}: from_role and on_relation must be specified together`,
      path,
    );
  }

  // Count how many pattern groups are active
  const patternCount = [
    hasGlobal,
    hasFromRole && hasOnRelation,
    hasFromRelation,
    // actor_type + when and when-only are both valid, but they conflict with other patterns
  ].filter(Boolean).length;

  // If any of the first 3 patterns are active, when/actor_type should not be present
  // (except that from_global_role alone is fine, from_role+on_relation alone is fine, etc.)
  if (patternCount > 1) {
    throw new ValidationError(
      `${path}: derived role entry specifies conflicting derivation patterns`,
      path,
    );
  }

  if (patternCount === 1) {
    // One of the relation/global patterns is active
    // actor_type and when should not appear with from_global_role or from_relation
    if (hasGlobal && (hasActorType || hasWhen || hasFromRelation || hasFromRole)) {
      throw new ValidationError(
        `${path}: from_global_role cannot be combined with other derivation fields`,
        path,
      );
    }
    if (hasFromRelation && (hasActorType || hasWhen || hasGlobal || hasFromRole)) {
      throw new ValidationError(
        `${path}: from_relation cannot be combined with other derivation fields`,
        path,
      );
    }
    // from_role + on_relation can't have from_global_role or from_relation (already checked)
    // but can coexist without actor_type/when conflicts for now
    return;
  }

  // patternCount === 0: must have when (pattern 4 or 5) or it's invalid
  if (!hasWhen && !hasActorType) {
    throw new ValidationError(
      `${path}: derived role entry must specify a derivation pattern (from_global_role, from_role+on_relation, from_relation, or when)`,
      path,
    );
  }
}
