/**
 * Contract: Toride engine API after type safety improvements.
 *
 * Shows the target type signatures for all public engine methods.
 * The class is generic over TorideSchema, defaulting to DefaultSchema.
 */

// Placeholder imports (actual definitions in core-schema.ts contract)
// NOTE: All types keep their original names with added generic params.
type TorideSchema = import("./core-schema").TorideSchema;
type DefaultSchema = import("./core-schema").DefaultSchema;
type ActorRef<S extends TorideSchema> = import("./core-schema").ActorRef<S>;
type ResourceRef<S extends TorideSchema, R extends S["resources"] = S["resources"]> =
  import("./core-schema").ResourceRef<S, R>;

// ─── Generic Engine Options (original names preserved) ───────────

/** Resolver function for a specific resource type. */
type ResourceResolver<S extends TorideSchema, R extends S["resources"]> = (
  ref: ResourceRef<S, R>,
) => Promise<S["resourceAttributeMap"][R]>;

/** Resolver map: resource type name -> typed resolver function. */
type Resolvers<S extends TorideSchema> = {
  [R in S["resources"]]?: ResourceResolver<S, R>;
};

/** Engine construction options — now generic. */
interface TorideOptions<S extends TorideSchema = DefaultSchema> {
  readonly policy: Policy;
  readonly resolvers?: Resolvers<S>;
  readonly maxConditionDepth?: number;
  readonly maxDerivedRoleDepth?: number;
  readonly customEvaluators?: Record<string, EvaluatorFn>;
  readonly onDecision?: (event: DecisionEvent) => void;
  readonly onQuery?: (event: QueryEvent) => void;
}

// ─── Generic Batch Check Item ────────────────────────────────────

/** Batch check item using global actions union (pragmatic for heterogeneous arrays). */
interface BatchCheckItem<S extends TorideSchema = DefaultSchema> {
  readonly action: S["actions"];
  readonly resource: ResourceRef<S>;
}

// ─── Check Options (unchanged) ───────────────────────────────────

/** Check options — env remains untyped. */
interface CheckOptions {
  readonly env?: Record<string, unknown>;
}

// ─── Generic Explain Result ──────────────────────────────────────

/** Explain result with narrowed permission types. */
interface ExplainResult<
  S extends TorideSchema = DefaultSchema,
  R extends S["resources"] = S["resources"],
> {
  readonly allowed: boolean;
  readonly resolvedRoles: ResolvedRolesDetail;
  readonly grantedPermissions: S["permissionMap"][R][];
  readonly matchedRules: MatchedRule[];
  readonly finalDecision: string;
}

// ─── Toride Class (target signatures) ────────────────────────────

/**
 * Main authorization engine — generic over TorideSchema.
 *
 * When instantiated without a type parameter, defaults to DefaultSchema
 * (all strings, full backward compatibility with current API).
 *
 * When instantiated with a codegen-produced schema, all methods gain
 * compile-time type narrowing for actions, resource types, actor types,
 * and attributes.
 */
declare class Toride<S extends TorideSchema = DefaultSchema> {
  constructor(options: TorideOptions<S>);

  /**
   * Check if an actor can perform an action on a resource.
   *
   * Generic over R (resource type). TypeScript infers R from the
   * resource.type literal, which narrows the action parameter to
   * only the permissions declared for that specific resource type.
   */
  can<R extends S["resources"]>(
    actor: ActorRef<S>,
    action: S["permissionMap"][R],
    resource: ResourceRef<S, R>,
    options?: CheckOptions,
  ): Promise<boolean>;

  /**
   * Full explain with narrowed return type.
   * grantedPermissions is typed as the permission union for R.
   */
  explain<R extends S["resources"]>(
    actor: ActorRef<S>,
    action: S["permissionMap"][R],
    resource: ResourceRef<S, R>,
    options?: CheckOptions,
  ): Promise<ExplainResult<S, R>>;

  /**
   * Return permitted actions for a resource.
   * Return type is the permission union array for that resource type.
   */
  permittedActions<R extends S["resources"]>(
    actor: ActorRef<S>,
    resource: ResourceRef<S, R>,
    options?: CheckOptions,
  ): Promise<S["permissionMap"][R][]>;

  /**
   * Batch checks with shared cache.
   * Uses global Actions union for action (pragmatic for heterogeneous arrays).
   */
  canBatch(
    actor: ActorRef<S>,
    checks: BatchCheckItem<S>[],
    options?: CheckOptions,
  ): Promise<boolean[]>;

  /**
   * Build constraint AST. resourceType is narrowed to valid resource names.
   */
  buildConstraints<R extends S["resources"]>(
    actor: ActorRef<S>,
    action: S["permissionMap"][R],
    resourceType: R,
    options?: CheckOptions,
  ): Promise<ConstraintResult>;

  /**
   * Field-level access check with typed resource.
   */
  canField<R extends S["resources"]>(
    actor: ActorRef<S>,
    operation: "read" | "update",
    resource: ResourceRef<S, R>,
    field: string,
    options?: CheckOptions,
  ): Promise<boolean>;

  /**
   * Return permitted fields with typed resource.
   */
  permittedFields<R extends S["resources"]>(
    actor: ActorRef<S>,
    operation: "read" | "update",
    resource: ResourceRef<S, R>,
    options?: CheckOptions,
  ): Promise<string[]>;

  /**
   * Resolved roles with typed resource.
   */
  resolvedRoles<R extends S["resources"]>(
    actor: ActorRef<S>,
    resource: ResourceRef<S, R>,
    options?: CheckOptions,
  ): Promise<string[]>;

  /**
   * Snapshot with typed resource array.
   */
  snapshot(
    actor: ActorRef<S>,
    resources: ResourceRef<S>[],
    options?: CheckOptions,
  ): Promise<PermissionSnapshot>;

  /** Atomic policy swap. */
  setPolicy(policy: Policy): void;

  /** Translate constraint AST using an adapter. */
  translateConstraints<TQuery>(
    constraints: Constraint,
    adapter: ConstraintAdapter<TQuery>,
  ): TQuery;
}

/**
 * Factory function — now generic.
 */
declare function createToride<S extends TorideSchema = DefaultSchema>(
  options: TorideOptions<S>,
): Toride<S>;

// ─── Placeholder types (unchanged from current) ─────────────────

type Policy = unknown;
type EvaluatorFn = unknown;
type DecisionEvent = unknown;
type QueryEvent = unknown;
type ResolvedRolesDetail = unknown;
type MatchedRule = unknown;
type ConstraintResult = unknown;
type Constraint = unknown;
type ConstraintAdapter<T> = unknown;
type PermissionSnapshot = Record<string, string[]>;
