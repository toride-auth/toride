// T015: Core runtime types
// T017: Evaluation result types
// T018: Error types

// ─── Schema Interface ─────────────────────────────────────────────

/**
 * Shape constraint for Toride's type parameter.
 * Each property is a union or mapped type that codegen fills with literals.
 */
export interface TorideSchema {
  /** Union of all resource type names (e.g., "Document" | "Organization") */
  resources: string;
  /** Global union of all action/permission names across all resources */
  actions: string;
  /** Union of all actor type names (e.g., "User" | "ServiceAccount") */
  actorTypes: string;
  /** Per-resource permission unions: { Document: "read" | "write"; ... } */
  permissionMap: { [R in string]: string };
  /** Per-resource role unions: { Document: "admin" | "editor"; ... } */
  roleMap: { [R in string]: string };
  /** Per-resource attribute shapes: { Document: { status: string; ownerId: string }; ... } */
  resourceAttributeMap: { [R in string]: Record<string, unknown> };
  /** Per-actor attribute shapes: { User: { email: string; is_admin: boolean }; ... } */
  actorAttributeMap: { [A in string]: Record<string, unknown> };
  /** Per-resource relation maps: { Document: { org: "Organization" }; ... } */
  relationMap: { [R in string]: Record<string, string> };
}

/**
 * Default schema where everything is string / Record<string, unknown>.
 * Used when Toride is instantiated without a type parameter.
 * Provides full backward compatibility with the current untyped API.
 */
export interface DefaultSchema extends TorideSchema {
  resources: string;
  actions: string;
  actorTypes: string;
  permissionMap: Record<string, string>;
  roleMap: Record<string, string>;
  resourceAttributeMap: Record<string, Record<string, unknown>>;
  actorAttributeMap: Record<string, Record<string, unknown>>;
  relationMap: Record<string, Record<string, string>>;
}

// ─── Core Runtime Types (T015) ────────────────────────────────────

/**
 * Represents an entity performing actions.
 * Generic discriminated union over actor types in S.
 * When S = DefaultSchema, collapses to the original untyped shape.
 */
export type ActorRef<S extends TorideSchema = DefaultSchema> = {
  [A in S["actorTypes"]]: {
    readonly type: A;
    readonly id: string;
    readonly attributes: S["actorAttributeMap"][A];
  };
}[S["actorTypes"]];

/**
 * Represents a protected entity being accessed.
 * Generic over schema S and resource type R.
 * When S = DefaultSchema, collapses to the original untyped shape.
 */
export type ResourceRef<
  S extends TorideSchema = DefaultSchema,
  R extends S["resources"] = S["resources"],
> = {
  readonly type: R;
  readonly id: string;
  /** Pre-fetched attributes. Inline values take precedence over resolver results. */
  readonly attributes?: S["resourceAttributeMap"][R];
};

/** Optional per-check configuration. */
export interface CheckOptions {
  readonly env?: Record<string, unknown>;
}

/** A single item in a canBatch() call. Action narrowed to global actions union. */
export interface BatchCheckItem<S extends TorideSchema = DefaultSchema> {
  readonly action: S["actions"];
  readonly resource: ResourceRef<S>;
}

/**
 * Per-type resolver function.
 * Called when the engine needs attributes not available inline.
 * Called at most once per unique resource per evaluation (cached).
 *
 * Registering a resolver is **optional** per resource type. When no resolver is
 * registered, inline {@link ResourceRef.attributes} are used as the sole data
 * source — this is referred to as "default resolver" behavior (analogous to
 * GraphQL's default field resolver, which returns `parent[fieldName]`).
 *
 * A resolver is only needed when attributes must be fetched from an external
 * source (e.g., a database). When both inline attributes and a resolver are
 * present, inline attributes take precedence field-by-field over resolver
 * results.
 */
export type ResourceResolver<
  S extends TorideSchema = DefaultSchema,
  R extends S["resources"] = S["resources"],
> = (
  ref: ResourceRef<S, R>,
) => Promise<Record<string, unknown>>;

/**
 * Map of resource type names to their resolver functions.
 *
 * Not all types need resolvers. Types without a registered resolver use
 * **default resolver** behavior (also called "trivial resolution"): the engine
 * reads attribute values directly from the inline {@link ResourceRef.attributes}
 * passed at the call site. Fields not present inline resolve to `undefined`,
 * causing conditions that reference them to fail (default-deny).
 *
 * This mirrors GraphQL's default field resolver pattern, where an unresolved
 * field simply returns `parent[fieldName]` — here, inline attributes play the
 * role of the `parent` object.
 */
export type Resolvers<S extends TorideSchema = DefaultSchema> = {
  [R in S["resources"]]?: ResourceResolver<S, R>;
};

/** Custom evaluator function signature. */
export type EvaluatorFn = (
  actor: ActorRef,
  resource: ResourceRef,
  env: Record<string, unknown>,
) => Promise<boolean>;

/** Engine construction options. */
export interface TorideOptions<S extends TorideSchema = DefaultSchema> {
  readonly policy: Policy;
  /**
   * Per-type resolver map.
   *
   * Optional — the engine works without any resolvers when all required data is
   * provided inline via {@link ResourceRef.attributes}. This "default resolver"
   * mode is the simplest way to use toride and requires no async data fetching.
   *
   * When both inline attributes and a resolver are present for the same resource
   * type, **inline attributes take precedence** over resolver results on a
   * field-by-field basis.
   *
   * @example
   * ```ts
   * // Inline-only mode — no resolvers needed
   * const toride = new Toride({ policy });
   *
   * const allowed = await toride.can(actor, "read", {
   *   type: "Document",
   *   id: "doc-1",
   *   attributes: { status: "published", ownerId: "user-42" },
   * });
   * ```
   */
  readonly resolvers?: Resolvers<S>;
  readonly maxConditionDepth?: number;
  readonly maxDerivedRoleDepth?: number;
  readonly customEvaluators?: Record<string, EvaluatorFn>;
  readonly onDecision?: (event: DecisionEvent) => void;
  readonly onQuery?: (event: QueryEvent) => void;
}

// ─── Policy Model Types ───────────────────────────────────────────

/** Attribute type for actor declarations. */
export type AttributeType = "string" | "number" | "boolean";

/** Schema for a primitive attribute. */
export interface PrimitiveAttributeSchema {
  readonly kind: "primitive";
  readonly type: AttributeType;
}

/** Schema for a nested object attribute. */
export interface ObjectAttributeSchema {
  readonly kind: "object";
  readonly fields: Record<string, AttributeSchema>;
}

/** Schema for an array attribute. */
export interface ArrayAttributeSchema {
  readonly kind: "array";
  readonly items: AttributeSchema;
}

/** Discriminated union of all attribute schema types. */
export type AttributeSchema =
  | PrimitiveAttributeSchema
  | ObjectAttributeSchema
  | ArrayAttributeSchema;

/** Actor type declaration with attribute schema. */
export interface ActorDeclaration {
  readonly attributes: Record<string, AttributeSchema>;
}

/** Global role definition derived from actor attributes. */
export interface GlobalRole {
  readonly actor_type: string;
  readonly when: ConditionExpression;
}

/**
 * Derived role entry. Exactly one derivation pattern per entry.
 * Patterns:
 *   1. from_global_role
 *   2. from_role + on_relation
 *   3. from_relation
 *   4. actor_type + when (conditional)
 *   5. when only
 */
export interface DerivedRoleEntry {
  readonly role: string;
  readonly from_global_role?: string;
  readonly from_role?: string;
  readonly on_relation?: string;
  readonly from_relation?: string;
  readonly actor_type?: string;
  readonly when?: ConditionExpression;
}

/** Conditional rule (permit or forbid). */
export interface Rule {
  readonly effect: "permit" | "forbid";
  readonly roles?: string[];
  readonly permissions: string[];
  readonly when: ConditionExpression;
}

/** Field-level access control definition. */
export interface FieldAccessDef {
  readonly read?: string[];
  readonly update?: string[];
}

/** Resource block definition. */
export interface ResourceBlock {
  readonly roles: string[];
  readonly permissions: string[];
  /** Optional typed attribute declarations for this resource type. */
  readonly attributes?: Record<string, AttributeSchema>;
  /** Relations map field names to target resource type names (simplified). */
  readonly relations?: Record<string, string>;
  readonly grants?: Record<string, string[]>;
  readonly derived_roles?: DerivedRoleEntry[];
  readonly rules?: Rule[];
  readonly field_access?: Record<string, FieldAccessDef>;
}

// ─── Condition Expression Types ───────────────────────────────────

/** Operator-based condition value. */
export type ConditionOperator =
  | { readonly eq: unknown }
  | { readonly neq: unknown }
  | { readonly gt: unknown }
  | { readonly gte: unknown }
  | { readonly lt: unknown }
  | { readonly lte: unknown }
  | { readonly in: unknown[] | string }
  | { readonly includes: unknown }
  | { readonly exists: boolean }
  | { readonly startsWith: string }
  | { readonly endsWith: string }
  | { readonly contains: string }
  | { readonly custom: string };

/**
 * Condition value: either a primitive (equality shorthand),
 * a cross-reference string ($actor.x, $resource.x, $env.x),
 * or an operator object.
 */
export type ConditionValue = string | number | boolean | ConditionOperator;

/** Simple conditions: all key-value pairs ANDed together. */
export type SimpleConditions = Record<string, ConditionValue>;

/**
 * Recursive condition expression.
 * Either simple conditions (Record<string, ConditionValue>),
 * or a logical combinator ({ any: ... } or { all: ... }).
 */
export type ConditionExpression =
  | SimpleConditions
  | { readonly any: ConditionExpression[] }
  | { readonly all: ConditionExpression[] };

// ─── Policy (top-level) ───────────────────────────────────────────

/** Test case for declarative YAML tests. */
export interface TestCase {
  readonly name: string;
  readonly actor: ActorRef;
  /** Mock resolver data: keyed by "Type:id", values are attribute objects. */
  readonly resolvers?: Record<string, Record<string, unknown>>;
  readonly action: string;
  readonly resource: ResourceRef;
  readonly expected: "allow" | "deny";
}

/** Top-level policy object. */
export interface Policy {
  readonly version: "1";
  readonly actors: Record<string, ActorDeclaration>;
  readonly global_roles?: Record<string, GlobalRole>;
  readonly resources: Record<string, ResourceBlock>;
  readonly tests?: TestCase[];
}

// ─── Evaluation Result Types (T017) ──────────────────────────────

/** Trace for a derived role showing derivation path. */
export interface DerivedRoleTrace {
  readonly role: string;
  readonly via: string;
}

/** Resolved roles detail with direct and derived breakdown. */
export interface ResolvedRolesDetail {
  readonly direct: string[];
  readonly derived: DerivedRoleTrace[];
}

/** A matched rule with evaluation context. */
export interface MatchedRule {
  readonly effect: "permit" | "forbid";
  readonly matched: boolean;
  readonly rule: Rule;
  readonly resolvedValues: Record<string, unknown>;
}

/** Full decision trace from explain(). */
export interface ExplainResult<
  S extends TorideSchema = DefaultSchema,
  R extends S["resources"] = S["resources"],
> {
  readonly allowed: boolean;
  readonly resolvedRoles: ResolvedRolesDetail;
  readonly grantedPermissions: S["permissionMap"][R][];
  readonly matchedRules: MatchedRule[];
  readonly finalDecision: string;
}

/** Audit event for authorization checks. */
export interface DecisionEvent {
  readonly actor: ActorRef;
  readonly action: string;
  readonly resource: ResourceRef;
  readonly allowed: boolean;
  readonly resolvedRoles: string[];
  readonly matchedRules: { effect: string; matched: boolean }[];
  readonly timestamp: Date;
}

/** Audit event for constraint queries. */
export interface QueryEvent {
  readonly actor: ActorRef;
  readonly action: string;
  readonly resourceType: string;
  readonly resultType: "unrestricted" | "forbidden" | "constrained";
  readonly timestamp: Date;
}

// ─── Error Types (T018) ──────────────────────────────────────────

/** Thrown when policy validation fails. */
export class ValidationError extends Error {
  readonly path: string;

  constructor(message: string, path: string) {
    super(message);
    this.name = "ValidationError";
    this.path = path;
  }
}

/** Thrown when a cycle is detected in relation traversal. */
export class CycleError extends Error {
  readonly path: string[];

  constructor(message: string, path: string[]) {
    super(message);
    this.name = "CycleError";
    this.path = path;
  }
}

/** Thrown when depth limit is exceeded. */
export class DepthLimitError extends Error {
  readonly limit: number;
  readonly limitType: "condition" | "derivation";

  constructor(
    message: string,
    limit: number,
    limitType: "condition" | "derivation",
  ) {
    super(message);
    this.name = "DepthLimitError";
    this.limit = limit;
    this.limitType = limitType;
  }
}

/** Thrown when an actor is forbidden from performing an action. */
export class ForbiddenError extends Error {
  readonly actor: ActorRef;
  readonly action: string;
  readonly resourceType: string;

  constructor(actor: ActorRef, action: string, resourceType: string) {
    super(
      `Actor "${actor.type}:${actor.id}" is forbidden from performing "${action}" on resource type "${resourceType}"`,
    );
    this.name = "ForbiddenError";
    this.actor = actor;
    this.action = action;
    this.resourceType = resourceType;
  }
}
