// @toride/prisma - Prisma integration for Toride
// T100: PrismaConstraintAdapter

export const VERSION = "0.0.1";

import type { ConstraintAdapter, LeafConstraint, ResourceRef, TorideSchema, DefaultSchema } from "toride";

/** Prisma WHERE clause type (plain object). */
export type PrismaWhere = Record<string, unknown>;

/** Options for createPrismaAdapter. */
export interface PrismaAdapterOptions {
  /** Maps constraint relation fields to Prisma relation names. */
  relationMapping?: Record<string, string>;
  /** Prisma table name for role assignments. Default: "roleAssignments". */
  roleAssignmentTable?: string;
  /** Field names in the role assignment table. */
  roleAssignmentFields?: {
    userId?: string;
    role?: string;
  };
}

/**
 * Create a Prisma constraint adapter that translates constraint AST
 * nodes into Prisma WHERE clause objects.
 *
 * No Prisma dependency required - produces plain JS objects matching
 * Prisma's WHERE clause structure.
 */
export function createPrismaAdapter(
  options?: PrismaAdapterOptions,
): ConstraintAdapter<PrismaWhere> {
  const relationMapping = options?.relationMapping ?? {};
  const roleTable = options?.roleAssignmentTable ?? "roleAssignments";
  const userIdField = options?.roleAssignmentFields?.userId ?? "userId";
  const roleField = options?.roleAssignmentFields?.role ?? "role";

  return {
    translate(constraint: LeafConstraint): PrismaWhere {
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
  };
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
