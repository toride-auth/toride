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

export interface RelationConstraint {
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
  | FieldContainsConstraint;

// ─── Constraint Result ────────────────────────────────────────────

/** Result of partial evaluation, tagged with resource type R (phantom). */
export type ConstraintResult<R extends string = string> =
  | { readonly unrestricted: true; readonly __resource?: R }
  | { readonly forbidden: true; readonly __resource?: R }
  | { readonly constraints: Constraint; readonly __resource?: R };

// ─── Constraint Adapter ───────────────────────────────────────────

/**
 * User-provided adapter for translating constraint ASTs to queries.
 * TQueryMap maps resource type names to their query output types.
 *
 * BREAKING CHANGE: Previously ConstraintAdapter<TQuery> with a single query type.
 * Now uses a resource-to-query-type map for per-resource output typing.
 */
export interface ConstraintAdapter<
  TQueryMap extends Record<string, unknown> = Record<string, unknown>,
> {
  translate(constraint: LeafConstraint): TQueryMap[string];
  relation(field: string, resourceType: string, childQuery: TQueryMap[string]): TQueryMap[string];
  hasRole(actorId: string, actorType: string, role: string): TQueryMap[string];
  unknown(name: string): TQueryMap[string];
  and(queries: TQueryMap[string][]): TQueryMap[string];
  or(queries: TQueryMap[string][]): TQueryMap[string];
  not(query: TQueryMap[string]): TQueryMap[string];
}
