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

/** Result of partial evaluation. */
export type ConstraintResult =
  | { readonly unrestricted: true }
  | { readonly forbidden: true }
  | { readonly constraints: Constraint };

// ─── Constraint Adapter ───────────────────────────────────────────

/** User-provided adapter for translating constraint ASTs to queries. */
export interface ConstraintAdapter<TQuery> {
  translate(constraint: LeafConstraint): TQuery;
  relation(field: string, resourceType: string, childQuery: TQuery): TQuery;
  hasRole(actorId: string, actorType: string, role: string): TQuery;
  unknown(name: string): TQuery;
  and(queries: TQuery[]): TQuery;
  or(queries: TQuery[]): TQuery;
  not(query: TQuery): TQuery;
}
