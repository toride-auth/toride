// T016: Constraint AST types (public stable API)

// ─── Leaf Constraints ─────────────────────────────────────────────

export interface FieldEqConstraint {
  readonly type: "field_eq";
  readonly field: string;
  readonly value: unknown;
}

export interface FieldNeqConstraint {
  readonly type: "field_neq";
  readonly field: string;
  readonly value: unknown;
}

export interface FieldGtConstraint {
  readonly type: "field_gt";
  readonly field: string;
  readonly value: unknown;
}

export interface FieldGteConstraint {
  readonly type: "field_gte";
  readonly field: string;
  readonly value: unknown;
}

export interface FieldLtConstraint {
  readonly type: "field_lt";
  readonly field: string;
  readonly value: unknown;
}

export interface FieldLteConstraint {
  readonly type: "field_lte";
  readonly field: string;
  readonly value: unknown;
}

export interface FieldInConstraint {
  readonly type: "field_in";
  readonly field: string;
  readonly values: unknown[];
}

export interface FieldNinConstraint {
  readonly type: "field_nin";
  readonly field: string;
  readonly values: unknown[];
}

export interface FieldExistsConstraint {
  readonly type: "field_exists";
  readonly field: string;
  readonly exists: boolean;
}

export interface FieldIncludesConstraint {
  readonly type: "field_includes";
  readonly field: string;
  readonly value: unknown;
}

export interface FieldContainsConstraint {
  readonly type: "field_contains";
  readonly field: string;
  readonly value: string;
}

// ─── Composite / Special Constraints ──────────────────────────────

export interface FieldStartsWithConstraint {
  readonly type: "field_starts_with";
  readonly field: string;
  readonly value: string;
}

export interface FieldEndsWithConstraint {
  readonly type: "field_ends_with";
  readonly field: string;
  readonly value: string;
}

export interface RelationConstraint {
  readonly quantifier: "any";
  readonly type: "relation";
  readonly field: string;
  readonly resourceType: string;
  readonly constraint: Constraint;
}

export interface HasRoleConstraint {
  readonly type: "has_role";
  readonly actorId: string;
  readonly actorType: string;
  readonly role: string;
}

export interface UnknownConstraint {
  readonly type: "unknown";
  readonly name: string;
}

export interface AndConstraint {
  readonly type: "and";
  readonly children: Constraint[];
}

export interface OrConstraint {
  readonly type: "or";
  readonly children: Constraint[];
}

export interface NotConstraint {
  readonly type: "not";
  readonly child: Constraint;
}

export interface AlwaysConstraint {
  readonly type: "always";
}

export interface NeverConstraint {
  readonly type: "never";
}

// ─── Discriminated Union ──────────────────────────────────────────

/** Full constraint discriminated union (AST node). */
export type Constraint =
  | FieldEqConstraint
  | FieldNeqConstraint
  | FieldGtConstraint
  | FieldGteConstraint
  | FieldLtConstraint
  | FieldLteConstraint
  | FieldInConstraint
  | FieldNinConstraint
  | FieldExistsConstraint
  | FieldIncludesConstraint
  | FieldStartsWithConstraint
  | FieldEndsWithConstraint
  | FieldContainsConstraint
  | RelationConstraint
  | HasRoleConstraint
  | UnknownConstraint
  | AndConstraint
  | OrConstraint
  | NotConstraint
  | AlwaysConstraint
  | NeverConstraint;

/** Leaf constraint subset for ConstraintAdapter.translate(). */
export type LeafConstraint =
  | FieldEqConstraint
  | FieldNeqConstraint
  | FieldGtConstraint
  | FieldGteConstraint
  | FieldLtConstraint
  | FieldLteConstraint
  | FieldInConstraint
  | FieldNinConstraint
  | FieldExistsConstraint
  | FieldIncludesConstraint
  | FieldStartsWithConstraint
  | FieldEndsWithConstraint
  | FieldContainsConstraint;

// ─── Constraint Result ────────────────────────────────────────────

/** A compiler-produced root carrying the resource type used for query inference. */
export type ResourceConstraint<R extends string = string> = Constraint & {
  readonly rootResourceType: R;
};

export type ConstraintResult<R extends string = string> =
  | { readonly ok: true; readonly constraint: ResourceConstraint<R> | null; readonly __resource?: R }
  | { readonly ok: false; readonly __resource?: R };

// ─── Constraint Adapter ───────────────────────────────────────────

export interface ConstraintContext {
  readonly resourceType: string;
}

export class UnsupportedConstraintError extends Error {
  constructor(readonly feature: string, readonly resourceType?: string) {
    super(`Unsupported constraint: ${feature}${resourceType ? ` on ${resourceType}` : ""}`);
    this.name = "UnsupportedConstraintError";
  }
}

/**
 * Each translated predicate must return a Boolean, including for null fields.
 * Ordinary comparison leaves are false for null. `not` complements that total
 * predicate. Relation callbacks implement ANY using their persistence mapping.
 */
export interface ConstraintAdapter<
  TQueryMap extends Record<string, unknown> = Record<string, unknown>,
> {
  translate(constraint: LeafConstraint, context: ConstraintContext): TQueryMap[string];
  relation(field: string, resourceType: string, childQuery: TQueryMap[string], context: ConstraintContext): TQueryMap[string];
  and(queries: TQueryMap[string][], context: ConstraintContext): TQueryMap[string];
  or(queries: TQueryMap[string][], context: ConstraintContext): TQueryMap[string];
  not(query: TQueryMap[string], context: ConstraintContext): TQueryMap[string];
  always(context: ConstraintContext): TQueryMap[string];
  never(context: ConstraintContext): TQueryMap[string];
}
