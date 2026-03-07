// @toride/drizzle - Drizzle ORM integration for Toride
// T101: DrizzleConstraintAdapter

export const VERSION = "0.0.1";

import type { ConstraintAdapter, LeafConstraint, ResourceRef } from "toride";

/**
 * Drizzle query representation.
 * Produces intermediate objects that describe the query operation.
 * Users can pass these to their own Drizzle query builder or use
 * the provided `toDrizzle()` helper when drizzle-orm is available.
 */
export type DrizzleQuery = Record<string, unknown>;

/** Table reference type (generic for any Drizzle table). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTable = Record<string, any>;

/** Relation configuration for the adapter. */
export interface RelationConfig {
  table: AnyTable;
  foreignKey: string;
}

/** Role assignment configuration. */
export interface RoleAssignmentConfig {
  table: AnyTable;
  userIdColumn: string;
  roleColumn: string;
}

/** Options for createDrizzleAdapter. */
export interface DrizzleAdapterOptions {
  /** Maps relation fields to Drizzle table references and foreign keys. */
  relations?: Record<string, RelationConfig>;
  /** Role assignment table configuration. */
  roleAssignments?: RoleAssignmentConfig;
}

/**
 * Create a Drizzle constraint adapter for a specific table.
 *
 * Produces intermediate query description objects that capture the
 * operation type, field, and value. These can be used with drizzle-orm
 * operators or processed by custom query builders.
 */
export function createDrizzleAdapter(
  table: AnyTable,
  options?: DrizzleAdapterOptions,
): ConstraintAdapter<DrizzleQuery> {
  const relations = options?.relations ?? {};
  const roleAssignments = options?.roleAssignments;

  return {
    translate(constraint: LeafConstraint): DrizzleQuery {
      switch (constraint.type) {
        case "field_eq":
          return { _op: "eq", field: constraint.field, value: constraint.value, table };
        case "field_neq":
          return { _op: "ne", field: constraint.field, value: constraint.value, table };
        case "field_gt":
          return { _op: "gt", field: constraint.field, value: constraint.value, table };
        case "field_gte":
          return { _op: "gte", field: constraint.field, value: constraint.value, table };
        case "field_lt":
          return { _op: "lt", field: constraint.field, value: constraint.value, table };
        case "field_lte":
          return { _op: "lte", field: constraint.field, value: constraint.value, table };
        case "field_in":
          return { _op: "inArray", field: constraint.field, values: constraint.values, table };
        case "field_nin":
          return { _op: "notInArray", field: constraint.field, values: constraint.values, table };
        case "field_exists":
          return constraint.exists
            ? { _op: "isNotNull", field: constraint.field, table }
            : { _op: "isNull", field: constraint.field, table };
        case "field_includes":
          return { _op: "arrayContains", field: constraint.field, value: constraint.value, table };
        case "field_contains": {
          // Escape LIKE metacharacters (%, _) in the value before wrapping in wildcards
          const escaped = String(constraint.value).replace(/[%_\\]/g, "\\$&");
          return { _op: "like", field: constraint.field, pattern: `%${escaped}%`, table };
        }
        default: {
          const _exhaustive: never = constraint;
          throw new Error(`Unknown constraint type: ${(constraint as { type: string }).type}`);
        }
      }
    },

    relation(field: string, resourceType: string, childQuery: DrizzleQuery): DrizzleQuery {
      const relationConfig = relations[field];
      if (relationConfig) {
        return {
          _op: "relation",
          field,
          resourceType,
          child: childQuery,
          relatedTable: relationConfig.table,
          foreignKey: relationConfig.foreignKey,
        };
      }
      return { _op: "relation", field, resourceType, child: childQuery };
    },

    hasRole(actorId: string, actorType: string, role: string): DrizzleQuery {
      if (roleAssignments) {
        return {
          _op: "hasRole",
          actorId,
          actorType,
          role,
          roleTable: roleAssignments.table,
          userIdColumn: roleAssignments.userIdColumn,
          roleColumn: roleAssignments.roleColumn,
        };
      }
      return { _op: "hasRole", actorId, actorType, role };
    },

    unknown(_name: string): DrizzleQuery {
      return { _op: "literal", value: true };
    },

    and(queries: DrizzleQuery[]): DrizzleQuery {
      return { _op: "and", children: queries };
    },

    or(queries: DrizzleQuery[]): DrizzleQuery {
      return { _op: "or", children: queries };
    },

    not(query: DrizzleQuery): DrizzleQuery {
      return { _op: "not", child: query };
    },
  };
}

/** Options for createDrizzleResolver. */
export interface DrizzleResolverOptions {
  /** Column used as the resource ID. Defaults to "id". */
  idColumn?: string;
}

/**
 * Creates a resolver function for a Drizzle table.
 * Wraps a Drizzle select query into the ResourceResolver signature.
 *
 * The db and table parameters are duck-typed — no direct drizzle-orm
 * dependency is required. The db object must support `db.select().from(table).where(condition)`.
 *
 * @param db - A Drizzle database instance (duck-typed).
 * @param table - A Drizzle table reference (duck-typed).
 * @param options - Optional configuration.
 * @returns A ResourceResolver function.
 */
export function createDrizzleResolver(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any,
  options?: DrizzleResolverOptions,
): (ref: ResourceRef) => Promise<Record<string, unknown>> {
  const idColumn = options?.idColumn ?? "id";

  return async (ref: ResourceRef): Promise<Record<string, unknown>> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = await db
      .select()
      .from(table)
      .where({ [idColumn]: ref.id });

    if (!rows || rows.length === 0) {
      return {};
    }
    return rows[0] as Record<string, unknown>;
  };
}
