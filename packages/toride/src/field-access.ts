// T093-T094: Field-level access control (canField, permittedFields)

import type { TorideSchema, DefaultSchema, ActorRef, ResourceRef, CheckOptions } from "./types.js";

/**
 * Interface for the engine methods needed by field-access functions.
 * Keeps field-access decoupled from the full Toride class.
 * Generic over TorideSchema for type safety when used with Toride<S>.
 */
export interface FieldAccessEngine<S extends TorideSchema = DefaultSchema> {
  resolvedRoles(
    actor: ActorRef<S>,
    resource: ResourceRef<S>,
    options?: CheckOptions,
  ): Promise<string[]>;
  can(
    actor: ActorRef<S>,
    action: string,
    resource: ResourceRef<S>,
    options?: CheckOptions,
  ): Promise<boolean>;
}

/**
 * The field_access definition from a resource block.
 * Maps field names to { read?: roles[], update?: roles[] }.
 */
interface FieldAccessMap {
  [fieldName: string]: {
    readonly read?: string[];
    readonly update?: string[];
  };
}

/**
 * T093: Check if an actor can perform a field-level operation on a specific field.
 *
 * Logic:
 * - If the resource type is unknown, deny.
 * - If the field is listed in field_access with the given operation, check if any
 *   of the actor's resolved roles appear in that operation's role list.
 * - If the field is NOT listed in field_access (or the operation is not defined
 *   for that field), the field is unrestricted: fall back to the resource-level
 *   permission check (can()).
 * - If there is no field_access section at all, all fields are unrestricted.
 */
export async function canField<
  S extends TorideSchema = DefaultSchema,
  R extends S["resources"] = S["resources"],
>(
  engine: FieldAccessEngine<S>,
  actor: ActorRef<S>,
  operation: "read" | "update",
  resource: ResourceRef<S, R>,
  field: keyof S["resourceAttributeMap"][R] & string,
  fieldAccess: FieldAccessMap | undefined,
  options?: CheckOptions,
): Promise<boolean> {
  // No field_access defined -> all fields unrestricted, governed by resource-level permission
  if (!fieldAccess) {
    return engine.can(actor, operation, resource, options);
  }

  const fieldDef = fieldAccess[field];

  // Field not listed or operation not defined for this field -> unrestricted
  if (!fieldDef || !fieldDef[operation]) {
    return engine.can(actor, operation, resource, options);
  }

  // Field is restricted for this operation: check resolved roles
  const allowedRoles = fieldDef[operation]!;
  const actorRoles = await engine.resolvedRoles(actor, resource, options);

  return actorRoles.some((role) => allowedRoles.includes(role));
}

/**
 * T094: Return the list of declared field_access field names the actor can access
 * for the given operation.
 *
 * Only returns fields that are explicitly declared in field_access.
 * Unlisted fields are not included (they are unrestricted by definition).
 *
 * For each declared field:
 * - If the operation is defined, check if any resolved role is in the list.
 * - If the operation is NOT defined for that field, the field is unrestricted
 *   for that operation: include it if the actor has the resource-level permission.
 */
export async function permittedFields<
  S extends TorideSchema = DefaultSchema,
  R extends S["resources"] = S["resources"],
>(
  engine: FieldAccessEngine<S>,
  actor: ActorRef<S>,
  operation: "read" | "update",
  resource: ResourceRef<S, R>,
  fieldAccess: FieldAccessMap | undefined,
  options?: CheckOptions,
): Promise<(keyof S["resourceAttributeMap"][R] & string)[]> {
  // No field_access defined -> no declared fields to return
  if (!fieldAccess) {
    return [];
  }

  const fieldNames = Object.keys(fieldAccess);
  if (fieldNames.length === 0) {
    return [];
  }

  // Resolve roles once for efficiency
  const actorRoles = await engine.resolvedRoles(actor, resource, options);

  // Check resource-level permission once (needed for unrestricted fields)
  let hasResourcePermission: boolean | undefined;

  const permitted: (keyof S["resourceAttributeMap"][R] & string)[] = [];

  for (const fieldName of fieldNames) {
    const fieldDef = fieldAccess[fieldName];
    const allowedRoles = fieldDef?.[operation];
    const typedFieldName = fieldName as keyof S["resourceAttributeMap"][R] & string;

    if (allowedRoles) {
      // Operation is restricted: check if actor has any of the allowed roles
      if (actorRoles.some((role) => allowedRoles.includes(role))) {
        permitted.push(typedFieldName);
      }
    } else {
      // Operation not defined for this field -> unrestricted, check resource-level
      if (hasResourcePermission === undefined) {
        hasResourcePermission = await engine.can(actor, operation, resource, options);
      }
      if (hasResourcePermission) {
        permitted.push(typedFieldName);
      }
    }
  }

  return permitted;
}
