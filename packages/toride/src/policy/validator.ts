// T021: Cross-reference semantic validator
// T075: Enhanced cross-reference checks ($actor attribute validation)
// T076: Logical path generation for all error messages
// T077: Strict mode static analysis (unused roles, unreachable rules, redundant derivations)

import { ValidationError } from "../types.js";
import type {
  Policy,
  DerivedRoleEntry,
  ConditionExpression,
  ActorDeclaration,
} from "../types.js";

/** A single validation diagnostic (error or warning). */
export interface ValidationDiagnostic {
  readonly message: string;
  readonly path: string;
}

/** Result from non-throwing validation. */
export interface ValidationResult {
  readonly errors: ValidationDiagnostic[];
}

/** Result from strict validation (errors + warnings). */
export interface StrictValidationResult {
  readonly errors: ValidationDiagnostic[];
  readonly warnings: ValidationDiagnostic[];
}

// ─── $actor Attribute Walking ────────────────────────────────────

/**
 * Extract all $actor.xxx attribute references from a condition expression.
 * Recursively walks any/all combinators and simple condition keys.
 */
function extractActorAttributes(
  condition: ConditionExpression,
): string[] {
  const attrs: string[] = [];

  if ("any" in condition && Array.isArray(condition.any)) {
    for (const sub of condition.any) {
      attrs.push(...extractActorAttributes(sub as ConditionExpression));
    }
    return attrs;
  }

  if ("all" in condition && Array.isArray(condition.all)) {
    for (const sub of condition.all) {
      attrs.push(...extractActorAttributes(sub as ConditionExpression));
    }
    return attrs;
  }

  // Simple conditions: Record<string, ConditionValue>
  for (const key of Object.keys(condition)) {
    if (key.startsWith("$actor.")) {
      const attrName = key.slice("$actor.".length);
      // Handle nested like $actor.foo.bar - just take first segment
      const topLevel = attrName.split(".")[0];
      attrs.push(topLevel);
    }
  }

  return attrs;
}

/**
 * Validate that all $actor attribute references in a condition are declared
 * in the given actor type(s).
 */
function validateActorAttributeRefs(
  condition: ConditionExpression,
  actorTypes: Map<string, ActorDeclaration>,
  path: string,
  errors: ValidationDiagnostic[],
): void {
  const referencedAttrs = extractActorAttributes(condition);
  if (referencedAttrs.length === 0) return;

  for (const attr of referencedAttrs) {
    for (const [typeName, decl] of actorTypes) {
      if (!(attr in decl.attributes)) {
        errors.push({
          message: `${path} references $actor.${attr} which is not declared in actor type "${typeName}"`,
          path,
        });
      }
    }
  }
}

// ─── Core Validation (Collects All Errors) ───────────────────────

/**
 * Collect all validation errors without throwing.
 * Returns errors with logical path messages.
 */
function collectErrors(policy: Policy): ValidationDiagnostic[] {
  const errors: ValidationDiagnostic[] = [];
  const declaredActorTypes = new Set(Object.keys(policy.actors));
  const declaredGlobalRoles = new Set(
    policy.global_roles ? Object.keys(policy.global_roles) : [],
  );
  const declaredResourceTypes = new Set(Object.keys(policy.resources));

  // Validate global_roles
  if (policy.global_roles) {
    for (const [roleName, globalRole] of Object.entries(policy.global_roles)) {
      if (!declaredActorTypes.has(globalRole.actor_type)) {
        errors.push({
          message: `global_roles.${roleName}.actor_type references undeclared actor type "${globalRole.actor_type}"`,
          path: `global_roles.${roleName}.actor_type`,
        });
      } else {
        // Validate $actor attribute references in the when condition
        const actorDecl = policy.actors[globalRole.actor_type];
        validateActorAttributeRefs(
          globalRole.when,
          new Map([[globalRole.actor_type, actorDecl]]),
          `global_roles.${roleName}.when`,
          errors,
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

    // Validate relation targets (relDef is now a plain string: the target type name)
    if (resource.relations) {
      for (const [relName, relDef] of Object.entries(resource.relations)) {
        if (
          !declaredResourceTypes.has(relDef) &&
          !declaredActorTypes.has(relDef)
        ) {
          errors.push({
            message: `resources.${resName}.relations.${relName} references undeclared resource type "${relDef}"`,
            path: `resources.${resName}.relations.${relName}`,
          });
        }
      }
    }

    // Validate grants
    if (resource.grants) {
      for (const [roleName, permissions] of Object.entries(resource.grants)) {
        if (!declaredRoles.has(roleName)) {
          errors.push({
            message: `resources.${resName}.grants references undeclared role "${roleName}"`,
            path: `resources.${resName}.grants.${roleName}`,
          });
        }
        for (const perm of permissions) {
          if (perm !== "all" && !declaredPermissions.has(perm)) {
            errors.push({
              message: `resources.${resName}.grants.${roleName} references undeclared permission "${perm}"`,
              path: `resources.${resName}.grants.${roleName}`,
            });
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
          errors.push({
            message: `${path} references undeclared role "${entry.role}"`,
            path,
          });
        }

        // Validate mutual exclusivity
        const patternErrors = validateDerivedRolePatternsCollect(entry, path);
        errors.push(...patternErrors);

        // Validate pattern-specific references
        if (entry.from_global_role !== undefined) {
          if (!declaredGlobalRoles.has(entry.from_global_role)) {
            errors.push({
              message: `${path} references undeclared global role "${entry.from_global_role}"`,
              path,
            });
          }
        }

        if (entry.on_relation !== undefined) {
          if (!declaredRelations.has(entry.on_relation)) {
            errors.push({
              message: `${path} references undeclared relation "${entry.on_relation}"`,
              path,
            });
          }
        }

        if (entry.from_relation !== undefined) {
          if (!declaredRelations.has(entry.from_relation)) {
            errors.push({
              message: `${path} references undeclared relation "${entry.from_relation}"`,
              path,
            });
          }
        }

        if (entry.actor_type !== undefined) {
          if (!declaredActorTypes.has(entry.actor_type)) {
            errors.push({
              message: `${path} references undeclared actor type "${entry.actor_type}"`,
              path,
            });
          }
        }

        // Validate $actor attribute references in when conditions
        if (entry.when) {
          if (entry.actor_type && declaredActorTypes.has(entry.actor_type)) {
            // Specific actor_type: validate against that type only
            const actorDecl = policy.actors[entry.actor_type];
            validateActorAttributeRefs(
              entry.when,
              new Map([[entry.actor_type, actorDecl]]),
              `${path}.when`,
              errors,
            );
          } else if (!entry.actor_type) {
            // No actor_type: validate against all declared actor types
            const allActors = new Map(
              Object.entries(policy.actors),
            );
            validateActorAttributeRefs(
              entry.when,
              allActors,
              `${path}.when`,
              errors,
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
            errors.push({
              message: `${path}.permissions references undeclared permission "${perm}"`,
              path: `${path}.permissions`,
            });
          }
        }

        if (rule.roles) {
          for (const roleName of rule.roles) {
            if (!declaredRoles.has(roleName)) {
              errors.push({
                message: `${path}.roles references undeclared role "${roleName}"`,
                path: `${path}.roles`,
              });
            }
          }
        }

        // Validate $actor attribute references in rule when conditions
        // Rules can apply to any actor type, so validate against all
        const allActors = new Map(Object.entries(policy.actors));
        validateActorAttributeRefs(
          rule.when,
          allActors,
          `${path}.when`,
          errors,
        );
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
              errors.push({
                message: `${fpath}.read references undeclared role "${roleName}"`,
                path: `${fpath}.read`,
              });
            }
          }
        }
        if (fieldDef.update) {
          for (const roleName of fieldDef.update) {
            if (!declaredRoles.has(roleName)) {
              errors.push({
                message: `${fpath}.update references undeclared role "${roleName}"`,
                path: `${fpath}.update`,
              });
            }
          }
        }
      }
    }
  }

  return errors;
}

// ─── Derived Role Pattern Validation (collecting) ────────────────

function validateDerivedRolePatternsCollect(
  entry: DerivedRoleEntry,
  path: string,
): ValidationDiagnostic[] {
  const errors: ValidationDiagnostic[] = [];

  const hasGlobal = entry.from_global_role !== undefined;
  const hasFromRole = entry.from_role !== undefined;
  const hasOnRelation = entry.on_relation !== undefined;
  const hasFromRelation = entry.from_relation !== undefined;
  const hasActorType = entry.actor_type !== undefined;
  const hasWhen = entry.when !== undefined;

  // from_role and on_relation must appear together
  if (hasFromRole !== hasOnRelation) {
    errors.push({
      message: `${path}: from_role and on_relation must be specified together`,
      path,
    });
    return errors;
  }

  // Count how many pattern groups are active
  const patternCount = [
    hasGlobal,
    hasFromRole && hasOnRelation,
    hasFromRelation,
  ].filter(Boolean).length;

  if (patternCount > 1) {
    errors.push({
      message: `${path}: derived role entry specifies conflicting derivation patterns`,
      path,
    });
    return errors;
  }

  if (patternCount === 1) {
    if (hasGlobal && (hasActorType || hasWhen || hasFromRelation || hasFromRole)) {
      errors.push({
        message: `${path}: from_global_role cannot be combined with other derivation fields`,
        path,
      });
    }
    if (hasFromRelation && (hasActorType || hasWhen || hasGlobal || hasFromRole)) {
      errors.push({
        message: `${path}: from_relation cannot be combined with other derivation fields`,
        path,
      });
    }
    return errors;
  }

  // patternCount === 0: must have when (pattern 4 or 5) or it's invalid
  if (!hasWhen && !hasActorType) {
    errors.push({
      message: `${path}: derived role entry must specify a derivation pattern (from_global_role, from_role+on_relation, from_relation, or when)`,
      path,
    });
  }

  return errors;
}

// ─── Strict Mode Warnings ────────────────────────────────────────

function collectWarnings(policy: Policy): ValidationDiagnostic[] {
  const warnings: ValidationDiagnostic[] = [];

  for (const [resName, resource] of Object.entries(policy.resources)) {
    const declaredRoles = new Set(resource.roles);

    // Collect all roles that are "used" (referenced in grants, derived_roles, rules, field_access)
    const usedRoles = new Set<string>();

    if (resource.grants) {
      for (const roleName of Object.keys(resource.grants)) {
        usedRoles.add(roleName);
      }
    }

    if (resource.derived_roles) {
      for (const entry of resource.derived_roles) {
        usedRoles.add(entry.role);
      }
    }

    if (resource.rules) {
      for (const rule of resource.rules) {
        if (rule.roles) {
          for (const roleName of rule.roles) {
            usedRoles.add(roleName);
          }
        }
      }
    }

    if (resource.field_access) {
      for (const fieldDef of Object.values(resource.field_access)) {
        if (fieldDef.read) {
          for (const roleName of fieldDef.read) {
            usedRoles.add(roleName);
          }
        }
        if (fieldDef.update) {
          for (const roleName of fieldDef.update) {
            usedRoles.add(roleName);
          }
        }
      }
    }

    // Warn about unused roles
    for (const role of declaredRoles) {
      if (!usedRoles.has(role)) {
        warnings.push({
          message: `resources.${resName}.roles includes "${role}" which is never used in grants, derived_roles, rules, or field_access`,
          path: `resources.${resName}.roles`,
        });
      }
    }

    // Warn about unreachable rules (forbid rules on permissions not granted to any role)
    if (resource.rules && resource.grants) {
      // Collect all permissions that are actually granted
      const grantedPermissions = new Set<string>();
      for (const perms of Object.values(resource.grants)) {
        for (const perm of perms) {
          if (perm === "all") {
            // "all" means all declared permissions are granted
            for (const p of resource.permissions) {
              grantedPermissions.add(p);
            }
          } else {
            grantedPermissions.add(perm);
          }
        }
      }

      for (let i = 0; i < resource.rules.length; i++) {
        const rule = resource.rules[i];
        const path = `resources.${resName}.rules[${i}]`;

        // Forbid rules on permissions not granted to any role are unreachable
        // (permit rules can still be meaningful as they add access conditionally)
        if (rule.effect === "forbid") {
          const unreachablePerms = rule.permissions.filter(
            (p) => !grantedPermissions.has(p),
          );
          if (unreachablePerms.length === rule.permissions.length) {
            warnings.push({
              message: `${path} is unreachable: none of its permissions [${unreachablePerms.join(", ")}] are granted to any role`,
              path,
            });
          }
        }
      }
    }

    // Warn about redundant derived_roles (identical derivation entries)
    if (resource.derived_roles && resource.derived_roles.length > 1) {
      const seen = new Set<string>();
      for (let i = 0; i < resource.derived_roles.length; i++) {
        const entry = resource.derived_roles[i];
        const key = JSON.stringify({
          role: entry.role,
          from_global_role: entry.from_global_role,
          from_role: entry.from_role,
          on_relation: entry.on_relation,
          from_relation: entry.from_relation,
          actor_type: entry.actor_type,
          when: entry.when,
        });

        if (seen.has(key)) {
          warnings.push({
            message: `resources.${resName}.derived_roles[${i}] is a duplicate (redundant) derivation entry`,
            path: `resources.${resName}.derived_roles[${i}]`,
          });
        } else {
          seen.add(key);
        }
      }
    }
  }

  return warnings;
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Validate cross-references in a structurally valid policy.
 * Collects ALL errors and throws ValidationError with all messages.
 * Backward compatible: always throws on first error set.
 */
export function validatePolicy(policy: Policy): void {
  const errors = collectErrors(policy);
  if (errors.length > 0) {
    const messages = errors.map((e) => e.message);
    const firstError = errors[0];
    throw new ValidationError(
      messages.length === 1
        ? messages[0]
        : messages.join("; "),
      firstError.path,
    );
  }
}

/**
 * Non-throwing validation: returns all errors as an array.
 * Used by CLI and programmatic consumers that want to collect errors.
 */
export function validatePolicyResult(policy: Policy): ValidationResult {
  return { errors: collectErrors(policy) };
}

/**
 * Strict validation: returns errors + static analysis warnings.
 * Errors are the same as validatePolicy().
 * Warnings include unused roles, unreachable rules, redundant derivations.
 */
export function validatePolicyStrict(policy: Policy): StrictValidationResult {
  const errors = collectErrors(policy);
  const warnings = collectWarnings(policy);
  return { errors, warnings };
}
