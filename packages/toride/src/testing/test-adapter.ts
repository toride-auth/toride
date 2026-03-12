// Shared test helpers for partial evaluation tests (Finding 9: deduplicate)

import type {
  ActorRef,
  Resolvers,
  ResourceRef,
} from "../types.js";
import type {
  ConstraintAdapter,
  LeafConstraint,
} from "../partial/constraint-types.js";
import { AttributeCache } from "../evaluation/cache.js";

/**
 * Create a string-based constraint adapter for testing translation output.
 */
export function makeStringAdapter(): ConstraintAdapter<Record<string, string>> {
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
 * Create a mock AttributeCache for tests.
 * Builds a Resolvers map from the provided attributes and wraps it in an AttributeCache.
 */
export function makeResolver(opts: {
  attributes?: Record<string, Record<string, unknown>>;
} = {}): AttributeCache {
  const typeSet = new Set<string>();
  if (opts.attributes) {
    for (const key of Object.keys(opts.attributes)) {
      const ci = key.indexOf(":");
      if (ci > 0) typeSet.add(key.substring(0, ci));
    }
  }
  const resolvers: Resolvers = {};
  for (const type of typeSet) {
    resolvers[type] = async (ref: ResourceRef) => {
      const key = `${ref.type}:${ref.id}`;
      return opts.attributes?.[key] ?? {};
    };
  }
  return new AttributeCache(resolvers);
}
