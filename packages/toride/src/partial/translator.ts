import type { Constraint, ResourceConstraint, ConstraintAdapter, ConstraintContext } from "./constraint-types.js";
import { UnsupportedConstraintError } from "./constraint-types.js";

export function translateConstraints<R extends string, TQueryMap extends Record<string, unknown>>(constraint: ResourceConstraint<R>, adapter: ConstraintAdapter<TQueryMap>): TQueryMap[R] {
  if (!constraint.rootResourceType) throw new UnsupportedConstraintError("missing root resource type");
  function visit(node: Constraint, context: ConstraintContext, depth: number): TQueryMap[string] {
    if (depth > 100) throw new UnsupportedConstraintError("maximum constraint depth", context.resourceType);
    switch (node.type) {
      case "field_eq": case "field_neq": case "field_gt": case "field_gte": case "field_lt": case "field_lte": case "field_in": case "field_nin": case "field_exists": case "field_includes": case "field_contains": case "field_starts_with": case "field_ends_with":
        return adapter.translate(node, context);
      case "relation": {
        if (node.quantifier !== "any") throw new UnsupportedConstraintError("relation quantifier", context.resourceType);
        return adapter.relation(node.field, node.resourceType, visit(node.constraint, { resourceType: node.resourceType }, depth + 1), context);
      }
      case "has_role": throw new UnsupportedConstraintError("legacy has_role", context.resourceType);
      case "unknown": throw new UnsupportedConstraintError(node.name, context.resourceType);
      case "and": return adapter.and(node.children.map(child => visit(child, context, depth + 1)), context);
      case "or": return adapter.or(node.children.map(child => visit(child, context, depth + 1)), context);
      case "not": return adapter.not(visit(node.child, context, depth + 1), context);
      case "always": return adapter.always(context);
      case "never": return adapter.never(context);
    }
  }
  return visit(constraint, { resourceType: constraint.rootResourceType }, 0) as TQueryMap[R];
}
