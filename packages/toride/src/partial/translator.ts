// T063: translateConstraints() implementation

import type {
  Constraint,
  LeafConstraint,
  ConstraintAdapter,
} from "./constraint-types.js";

/** Maximum recursion depth to prevent stack overflow on deeply nested ASTs. */
const MAX_TRANSLATE_DEPTH = 100;

/**
 * Recursively translate a Constraint AST into a query using the provided adapter.
 *
 * Dispatches each node type to the appropriate adapter method:
 * - Leaf constraints -> adapter.translate()
 * - Relation constraints -> adapter.relation()
 * - HasRole constraints -> adapter.hasRole()
 * - Unknown constraints -> adapter.unknown()
 * - AND/OR -> adapter.and() / adapter.or()
 * - NOT -> adapter.not()
 * - always/never -> throws (should be simplified out before translation)
 */
export function translateConstraints<TQueryMap extends Record<string, unknown>>(
  constraint: Constraint,
  adapter: ConstraintAdapter<TQueryMap>,
  _depth = 0,
): TQueryMap[string] {
  if (_depth > MAX_TRANSLATE_DEPTH) {
    throw new Error(
      `translateConstraints exceeded maximum recursion depth (${MAX_TRANSLATE_DEPTH}). ` +
      "The constraint AST may be malformed or excessively nested.",
    );
  }
  switch (constraint.type) {
    // Leaf constraints
    case "field_eq":
    case "field_neq":
    case "field_gt":
    case "field_gte":
    case "field_lt":
    case "field_lte":
    case "field_in":
    case "field_nin":
    case "field_exists":
    case "field_includes":
    case "field_contains":
      return adapter.translate(constraint as LeafConstraint);

    // Relation constraint
    case "relation": {
      const childQuery = translateConstraints(constraint.constraint, adapter, _depth + 1);
      return adapter.relation(constraint.field, constraint.resourceType, childQuery);
    }

    // Has role constraint
    case "has_role":
      return adapter.hasRole(constraint.actorId, constraint.actorType, constraint.role);

    // Unknown constraint (custom evaluator)
    case "unknown":
      return adapter.unknown(constraint.name);

    // Combinators
    case "and": {
      const queries = constraint.children.map((c) => translateConstraints(c, adapter, _depth + 1));
      return adapter.and(queries);
    }

    case "or": {
      const queries = constraint.children.map((c) => translateConstraints(c, adapter, _depth + 1));
      return adapter.or(queries);
    }

    case "not": {
      const childQuery = translateConstraints(constraint.child, adapter, _depth + 1);
      return adapter.not(childQuery);
    }

    // Terminal nodes - should not reach the translator
    case "always":
      throw new Error(
        'Constraint node "always" should be simplified out before translation. ' +
        "Check result.ok and result.constraint before calling translateConstraints().",
      );

    case "never":
      throw new Error(
        'Constraint node "never" should be simplified out before translation. ' +
        "Check result.ok and result.constraint before calling translateConstraints().",
      );

    default: {
      // Exhaustive check
      const _exhaustive: never = constraint;
      throw new Error(`Unknown constraint type: ${(constraint as { type: string }).type}`);
    }
  }
}
