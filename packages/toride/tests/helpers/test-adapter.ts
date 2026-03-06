// Shared test helpers for partial evaluation tests (Finding 9: deduplicate)

import type {
  ActorRef,
  RelationResolver,
  ResourceRef,
} from "../../src/types.js";
import type {
  ConstraintAdapter,
  LeafConstraint,
} from "../../src/partial/constraint-types.js";

/**
 * Create a string-based constraint adapter for testing translation output.
 */
export function makeStringAdapter(): ConstraintAdapter<string> {
  return {
    translate(c: LeafConstraint): string {
      switch (c.type) {
        case "field_eq": return `${c.field} = ${JSON.stringify(c.value)}`;
        case "field_neq": return `${c.field} != ${JSON.stringify(c.value)}`;
        case "field_gt": return `${c.field} > ${JSON.stringify(c.value)}`;
        case "field_gte": return `${c.field} >= ${JSON.stringify(c.value)}`;
        case "field_lt": return `${c.field} < ${JSON.stringify(c.value)}`;
        case "field_lte": return `${c.field} <= ${JSON.stringify(c.value)}`;
        case "field_in": return `${c.field} IN ${JSON.stringify(c.values)}`;
        case "field_nin": return `${c.field} NOT IN ${JSON.stringify(c.values)}`;
        case "field_exists": return c.exists ? `${c.field} IS NOT NULL` : `${c.field} IS NULL`;
        case "field_includes": return `${c.field} INCLUDES ${JSON.stringify(c.value)}`;
        case "field_contains": return `${c.field} CONTAINS ${JSON.stringify(c.value)}`;
        default: return "UNKNOWN_LEAF";
      }
    },
    relation(field: string, resourceType: string, childQuery: string): string {
      return `${field} -> ${resourceType}(${childQuery})`;
    },
    hasRole(actorId: string, actorType: string, role: string): string {
      return `HAS_ROLE(${actorType}:${actorId}, ${role})`;
    },
    unknown(name: string): string {
      return `UNKNOWN(${name})`;
    },
    and(queries: string[]): string {
      return `(${queries.join(" AND ")})`;
    },
    or(queries: string[]): string {
      return `(${queries.join(" OR ")})`;
    },
    not(query: string): string {
      return `NOT(${query})`;
    },
  };
}

/**
 * Create a mock relation resolver for tests.
 */
export function makeResolver(opts: {
  roles?: Record<string, string[]>;
  related?: Record<string, Record<string, ResourceRef | ResourceRef[]>>;
  attributes?: Record<string, Record<string, unknown>>;
} = {}): RelationResolver {
  return {
    getRoles: async (actor: ActorRef, resource: ResourceRef) => {
      const key = `${actor.id}:${resource.type}:${resource.id}`;
      return opts.roles?.[key] ?? [];
    },
    getRelated: async (resource: ResourceRef, relation: string) => {
      const key = `${resource.type}:${resource.id}`;
      return opts.related?.[key]?.[relation] ?? [];
    },
    getAttributes: async (ref: ResourceRef) => {
      const key = `${ref.type}:${ref.id}`;
      return opts.attributes?.[key] ?? {};
    },
  };
}
