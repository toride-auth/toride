// @toride/prisma - Prisma integration for Toride
// T100: PrismaConstraintAdapter

export const VERSION = "0.0.1";

import type { ConstraintAdapter, LeafConstraint, ResourceRef, TorideSchema, DefaultSchema } from "toride";

/** Prisma WHERE clause type (plain object). */
export type PrismaWhere = Record<string, unknown>;

type ArrayKeys<T> = { [K in keyof T]: T[K] extends unknown[] ? K : never }[keyof T];

type VirtualFieldKeys<T> = string extends keyof T ? string : ArrayKeys<T>;

export interface VirtualFieldMapping<TRoles extends string = string> {
  relation: string;
  matchField: string;
  filter?: { role: TRoles } & Record<string, unknown>;
}

type VirtualFieldsConfig<S extends TorideSchema> = {
  [R in S["resources"]]?: S["resourceAttributeMap"][R] extends Record<string, unknown>
    ? Record<string, unknown> extends S["resourceAttributeMap"][R]
      ? Record<string, VirtualFieldMapping<S["roleMap"][R] & string>>
      : { [K in VirtualFieldKeys<S["resourceAttributeMap"][R]>]?: VirtualFieldMapping<S["roleMap"][R] & string> }
    : never;
};

/** Options for createPrismaAdapter. */
export interface PrismaAdapterOptions<S extends TorideSchema = DefaultSchema> {
  /** Maps constraint relation fields to Prisma relation names. */
  relationMapping?: Record<string, string>;
  /** Prisma table name for role assignments. Default: "roleAssignments". */
  roleAssignmentTable?: string;
  /** Field names in the role assignment table. */
  roleAssignmentFields?: {
    userId?: string;
    role?: string;
  };
  /** Maps virtual fields to their relation queries for field_includes constraints. */
  virtualFields?: VirtualFieldsConfig<S>;
}

/**
 * Create a Prisma constraint adapter that translates constraint AST
 * nodes into Prisma WHERE clause objects.
 *
 * No Prisma dependency required - produces plain JS objects matching
 * Prisma's WHERE clause structure.
 *
 * @typeParam S - The Toride schema type. Defaults to `DefaultSchema` for backward compatibility.
 * @typeParam TQueryMap - Maps resource type names to their Prisma WHERE clause types.
 *   Defaults to `Record<string, PrismaWhere>` for backward compatibility.
 */
export function createPrismaAdapter<
  S extends TorideSchema = DefaultSchema,
  TQueryMap extends Record<string, PrismaWhere> = Record<string, PrismaWhere>,
>(
  options?: PrismaAdapterOptions<S>,
): ConstraintAdapter<TQueryMap> {
  const relationMapping = options?.relationMapping ?? {};
  const roleTable = options?.roleAssignmentTable ?? "roleAssignments";
  const userIdField = options?.roleAssignmentFields?.userId ?? "userId";
  const roleField = options?.roleAssignmentFields?.role ?? "role";

  const flatVirtualFields: Record<string, VirtualFieldMapping> = {};
  if (options?.virtualFields) {
    for (const [_resource, resourceFields] of Object.entries(options.virtualFields)) {
      if (resourceFields) {
        for (const field of Object.keys(resourceFields)) {
          if (flatVirtualFields[field]) {
            throw new Error(
              `Virtual field "${field}" is defined in multiple resources. ` +
              `The adapter cannot disambiguate at translation time. ` +
              `Use unique field names per resource.`
            );
          }
          flatVirtualFields[field] = (resourceFields as Record<string, VirtualFieldMapping>)[field];
        }
      }
    }
  }

  // Internal implementation uses PrismaWhere (the base type).
  // Cast to ConstraintAdapter<TQueryMap> since TQueryMap values extend PrismaWhere.
  return {
    translate(constraint: LeafConstraint): PrismaWhere {
      const vf = flatVirtualFields[constraint.field];
      if (vf && constraint.type === "field_includes") {
        return {
          [vf.relation]: {
            some: {
              [vf.matchField]: constraint.value,
              ...vf.filter,
            },
          },
        };
      }
      switch (constraint.type) {
        case "field_eq":
          return { [constraint.field]: constraint.value };
        case "field_neq":
          return { [constraint.field]: { not: constraint.value } };
        case "field_gt":
          return { [constraint.field]: { gt: constraint.value } };
        case "field_gte":
          return { [constraint.field]: { gte: constraint.value } };
        case "field_lt":
          return { [constraint.field]: { lt: constraint.value } };
        case "field_lte":
          return { [constraint.field]: { lte: constraint.value } };
        case "field_in":
          return { [constraint.field]: { in: constraint.values } };
        case "field_nin":
          return { [constraint.field]: { notIn: constraint.values } };
        case "field_exists":
          return constraint.exists
            ? { [constraint.field]: { not: null } }
            : { [constraint.field]: null };
        case "field_includes":
          return { [constraint.field]: { has: constraint.value } };
        case "field_contains":
          return { [constraint.field]: { contains: constraint.value } };
        default: {
          const _exhaustive: never = constraint;
          throw new Error(`Unknown constraint type: ${(constraint as { type: string }).type}`);
        }
      }
    },

    relation(field: string, _resourceType: string, childQuery: PrismaWhere): PrismaWhere {
      const prismaRelation = relationMapping[field] ?? field;
      return { [prismaRelation]: childQuery };
    },

    hasRole(actorId: string, _actorType: string, role: string): PrismaWhere {
      return {
        [roleTable]: {
          some: {
            [userIdField]: actorId,
            [roleField]: role,
          },
        },
      };
    },

    unknown(_name: string): PrismaWhere {
      return {};
    },

    and(queries: PrismaWhere[]): PrismaWhere {
      return { AND: queries };
    },

    or(queries: PrismaWhere[]): PrismaWhere {
      return { OR: queries };
    },

    not(query: PrismaWhere): PrismaWhere {
      return { NOT: query };
    },
  } as unknown as ConstraintAdapter<TQueryMap>;
}

/** Options for createPrismaResolver. */
export interface PrismaResolverOptions {
  /** Fields to select. Defaults to all scalar fields. */
  select?: Record<string, boolean>;
}

/**
 * Creates a resolver function for a Prisma model.
 * Wraps a Prisma findUnique query into the ResourceResolver signature.
 *
 * The client parameter is duck-typed — no direct @prisma/client dependency
 * is required. The client must support `client[modelName].findUnique({ where: { id } })`.
 *
 * @param client - A Prisma client instance (duck-typed).
 * @param modelName - The Prisma model name (lowercase, e.g. "document").
 * @param options - Optional configuration.
 * @returns A ResourceResolver function.
 */
export function createPrismaResolver<
  S extends TorideSchema = DefaultSchema,
  R extends S["resources"] = S["resources"],
>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  modelName: R,
  options?: PrismaResolverOptions,
): (ref: ResourceRef<S, R>) => Promise<S["resourceAttributeMap"][R]> {
  return async (ref: ResourceRef<S, R>): Promise<S["resourceAttributeMap"][R]> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const model = (client as Record<string, any>)[modelName];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query: Record<string, any> = { where: { id: ref.id } };
    if (options?.select) {
      query.select = options.select;
    }
    const result = await model.findUnique(query);
    return (result as S["resourceAttributeMap"][R]) ?? ({} as S["resourceAttributeMap"][R]);
  };
}
