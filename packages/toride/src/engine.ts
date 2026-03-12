// T030: Toride class with can() method
// T031: createToride() typed factory function
// T064: Wire up buildConstraints() and translateConstraints()
// T068-T072: explain(), permittedActions(), resolvedRoles(), canBatch(), audit callbacks
// T083: Wire up snapshot() method
// T095: Wire up canField() and permittedFields()

import type {
  TorideSchema,
  DefaultSchema,
  ActorRef,
  ResourceRef,
  CheckOptions,
  TorideOptions,
  Policy,
  Resolvers,
  ExplainResult,
  BatchCheckItem,
  DecisionEvent,
  QueryEvent,
} from "./types.js";
import type {
  Constraint,
  ConstraintResult,
  ConstraintAdapter,
} from "./partial/constraint-types.js";
import { evaluate } from "./evaluation/rule-engine.js";
import { AttributeCache } from "./evaluation/cache.js";
import { buildConstraints as buildConstraintsImpl } from "./partial/constraint-builder.js";
import { translateConstraints as translateConstraintsImpl } from "./partial/translator.js";
import { snapshot as snapshotImpl } from "./snapshot.js";
import type { PermissionSnapshot, SnapshotEngine } from "./snapshot.js";
import {
  canField as canFieldImpl,
  permittedFields as permittedFieldsImpl,
} from "./field-access.js";
import type { FieldAccessEngine } from "./field-access.js";

/**
 * Main authorization engine.
 * Creates a per-check cache, resolves direct roles, checks grants,
 * and returns boolean with default-deny semantics.
 */
export class Toride<S extends TorideSchema = DefaultSchema> {
  private policy: Policy;
  private readonly resolvers: Resolvers;
  private readonly options: TorideOptions;

  constructor(options: TorideOptions<S>) {
    this.policy = options.policy;
    this.resolvers = (options.resolvers ?? {}) as Resolvers;
    this.options = options as unknown as TorideOptions;
  }

  /**
   * Check if an actor can perform an action on a resource.
   * Default-deny: returns false if resource type is unknown or no grants match.
   */
  async can<R extends S["resources"]>(
    actor: ActorRef<S>,
    action: S["permissionMap"][R],
    resource: ResourceRef<S, R>,
    options?: CheckOptions,
  ): Promise<boolean> {
    const a = actor as ActorRef;
    const r = resource as ResourceRef;
    const act = action as string;
    const result = await this.evaluateInternal(a, act, r, options);
    this.fireDecisionEvent(a, act, r, result);
    return result.allowed;
  }

  /**
   * T097: Atomic policy swap. In-flight checks capture the resource block
   * at the start of evaluateInternal, so they complete with the old policy.
   * JS single-threaded nature ensures the assignment is atomic.
   */
  setPolicy(policy: Policy): void {
    this.policy = policy;
  }

  /**
   * T068: Return full ExplainResult with role derivation traces,
   * granted permissions, matched rules, and human-readable final decision.
   */
  async explain<R extends S["resources"]>(
    actor: ActorRef<S>,
    action: S["permissionMap"][R],
    resource: ResourceRef<S, R>,
    options?: CheckOptions,
  ): Promise<ExplainResult<S, R>> {
    const a = actor as ActorRef;
    const r = resource as ResourceRef;
    const act = action as string;
    const result = await this.evaluateInternal(a, act, r, options);
    this.fireDecisionEvent(a, act, r, result);
    return result as ExplainResult<S, R>;
  }

  /**
   * T069: Check all declared permissions for a resource and return permitted ones.
   * Uses a shared cache across all per-action evaluations.
   */
  async permittedActions<R extends S["resources"]>(
    actor: ActorRef<S>,
    resource: ResourceRef<S, R>,
    options?: CheckOptions,
  ): Promise<S["permissionMap"][R][]> {
    const a = actor as ActorRef;
    const r = resource as ResourceRef;
    const resourceBlock = this.policy.resources[r.type];
    if (!resourceBlock) {
      return [];
    }

    const sharedCache = new AttributeCache(this.resolvers);
    const permitted: string[] = [];

    for (const action of resourceBlock.permissions) {
      const result = await this.evaluateInternal(
        a,
        action,
        r,
        options,
        sharedCache,
      );
      if (result.allowed) {
        permitted.push(action);
      }
    }

    return permitted as S["permissionMap"][R][];
  }

  /**
   * T083: Generate a PermissionSnapshot for a list of resources.
   * Calls permittedActions() for each resource and returns a map
   * keyed by "Type:id" with arrays of permitted action strings.
   * Suitable for serializing to the client via TorideClient.
   */
  async snapshot(
    actor: ActorRef<S>,
    resources: ResourceRef<S>[],
    options?: CheckOptions,
  ): Promise<PermissionSnapshot> {
    return snapshotImpl(
      this as unknown as SnapshotEngine,
      actor as ActorRef,
      resources as ResourceRef[],
      options,
    );
  }

  /**
   * T095: Check if an actor can perform a field-level operation on a specific field.
   * Restricted fields require the actor to have a role listed in field_access.
   * Unlisted fields are unrestricted: any actor with the resource-level permission can access them.
   */
  async canField<R extends S["resources"]>(
    actor: ActorRef<S>,
    operation: "read" | "update",
    resource: ResourceRef<S, R>,
    field: string,
    options?: CheckOptions,
  ): Promise<boolean> {
    const r = resource as ResourceRef;
    const resourceBlock = this.policy.resources[r.type];
    if (!resourceBlock) {
      return false;
    }
    return canFieldImpl(
      this as unknown as FieldAccessEngine,
      actor as ActorRef,
      operation,
      r,
      field,
      resourceBlock.field_access,
      options,
    );
  }

  /**
   * T095: Return the list of declared field_access field names the actor can access
   * for the given operation. Only returns explicitly declared fields.
   */
  async permittedFields<R extends S["resources"]>(
    actor: ActorRef<S>,
    operation: "read" | "update",
    resource: ResourceRef<S, R>,
    options?: CheckOptions,
  ): Promise<string[]> {
    const r = resource as ResourceRef;
    const resourceBlock = this.policy.resources[r.type];
    if (!resourceBlock) {
      return [];
    }
    return permittedFieldsImpl(
      this as unknown as FieldAccessEngine,
      actor as ActorRef,
      operation,
      r,
      resourceBlock.field_access,
      options,
    );
  }

  /**
   * T070: Return flat deduplicated list of all resolved roles (direct + derived).
   */
  async resolvedRoles<R extends S["resources"]>(
    actor: ActorRef<S>,
    resource: ResourceRef<S, R>,
    options?: CheckOptions,
  ): Promise<string[]> {
    const a = actor as ActorRef;
    const r = resource as ResourceRef;
    const resourceBlock = this.policy.resources[r.type];
    if (!resourceBlock) {
      return [];
    }

    // Use any action just to trigger evaluation for role resolution;
    // pick the first permission or use a dummy
    const action = resourceBlock.permissions[0] ?? "__resolvedRoles__";
    const result = await this.evaluateInternal(a, action, r, options);

    const directRoles = result.resolvedRoles.direct;
    const derivedRoleNames = result.resolvedRoles.derived.map((d) => d.role);
    return [...new Set([...directRoles, ...derivedRoleNames])];
  }

  /**
   * T071: Evaluate multiple checks for the same actor with a shared resolver cache.
   * Returns boolean[] in the same order as the input checks.
   */
  async canBatch(
    actor: ActorRef<S>,
    checks: BatchCheckItem<S>[],
    options?: CheckOptions,
  ): Promise<boolean[]> {
    if (checks.length === 0) {
      return [];
    }

    const a = actor as ActorRef;
    const sharedCache = new AttributeCache(this.resolvers);
    const results: boolean[] = [];

    for (const check of checks) {
      const r = check.resource as ResourceRef;
      const act = check.action as string;
      const result = await this.evaluateInternal(
        a,
        act,
        r,
        options,
        sharedCache,
      );
      this.fireDecisionEvent(a, act, r, result);
      results.push(result.allowed);
    }

    return results;
  }

  /**
   * T064: Build constraint AST for partial evaluation / data filtering.
   * Returns ConstraintResult with unrestricted/forbidden sentinels or constraint AST.
   */
  async buildConstraints<R extends S["resources"]>(
    actor: ActorRef<S>,
    action: S["permissionMap"][R],
    resourceType: R,
    options?: CheckOptions,
  ): Promise<ConstraintResult> {
    const a = actor as ActorRef;
    const act = action as string;
    const rt = resourceType as string;
    const cache = new AttributeCache(this.resolvers);
    const constraintResult = await buildConstraintsImpl(
      a,
      act,
      rt,
      cache,
      this.policy,
      {
        env: options?.env,
        maxDerivedRoleDepth: this.options.maxDerivedRoleDepth,
        customEvaluators: this.options.customEvaluators,
      },
    );

    this.fireQueryEvent(a, act, rt, constraintResult);
    return constraintResult;
  }

  /**
   * T064: Translate constraint AST using an adapter.
   * Dispatches each constraint node to the adapter's methods.
   */
  translateConstraints<TQuery>(
    constraints: Constraint,
    adapter: ConstraintAdapter<TQuery>,
  ): TQuery {
    return translateConstraintsImpl(constraints, adapter);
  }

  /**
   * T072: Fire onDecision audit callback via microtask (non-blocking).
   * Errors are silently swallowed to prevent audit failures from affecting authorization.
   */
  private fireDecisionEvent(
    actor: ActorRef,
    action: string,
    resource: ResourceRef,
    result: ExplainResult,
  ): void {
    const callback = this.options.onDecision;
    if (!callback) return;

    const directRoles = result.resolvedRoles.direct;
    const derivedRoleNames = result.resolvedRoles.derived.map((d) => d.role);
    const resolvedRoles = [...new Set([...directRoles, ...derivedRoleNames])];

    const event: DecisionEvent = {
      actor,
      action,
      resource,
      allowed: result.allowed,
      resolvedRoles,
      matchedRules: result.matchedRules.map((r) => ({
        effect: r.effect,
        matched: r.matched,
      })),
      timestamp: new Date(),
    };

    queueMicrotask(() => {
      try {
        callback(event);
      } catch {
        // Silently swallow errors - audit must not affect authorization
      }
    });
  }

  /**
   * T072: Fire onQuery audit callback via microtask (non-blocking).
   * Errors are silently swallowed.
   */
  private fireQueryEvent(
    actor: ActorRef,
    action: string,
    resourceType: string,
    constraintResult: ConstraintResult,
  ): void {
    const callback = this.options.onQuery;
    if (!callback) return;

    let resultType: "unrestricted" | "forbidden" | "constrained";
    if ("unrestricted" in constraintResult && constraintResult.unrestricted) {
      resultType = "unrestricted";
    } else if ("forbidden" in constraintResult && constraintResult.forbidden) {
      resultType = "forbidden";
    } else {
      resultType = "constrained";
    }

    const event: QueryEvent = {
      actor,
      action,
      resourceType,
      resultType,
      timestamp: new Date(),
    };

    queueMicrotask(() => {
      try {
        callback(event);
      } catch {
        // Silently swallow errors - audit must not affect authorization
      }
    });
  }

  /**
   * Evaluate with full ExplainResult (shared code path for can(), explain(), and helpers).
   * Accepts an optional pre-existing AttributeCache for shared-cache scenarios (canBatch, permittedActions).
   */
  private async evaluateInternal(
    actor: ActorRef,
    action: string,
    resource: ResourceRef,
    checkOptions?: CheckOptions,
    existingCache?: AttributeCache,
  ): Promise<ExplainResult> {
    // Look up resource block; unknown resource type -> default deny
    const resourceBlock = this.policy.resources[resource.type];
    if (!resourceBlock) {
      return {
        allowed: false,
        resolvedRoles: { direct: [], derived: [] },
        grantedPermissions: [],
        matchedRules: [],
        finalDecision: `Denied: unknown resource type "${resource.type}"`,
      };
    }

    // Use existing cache or create a new one
    const cache = existingCache ?? new AttributeCache(this.resolvers);
    const env = checkOptions?.env ?? {};

    // T052: Forward all options including customEvaluators and maxConditionDepth
    try {
      return await evaluate(actor, action, resource, resourceBlock, cache, this.policy, {
        maxDerivedRoleDepth: this.options.maxDerivedRoleDepth,
        maxConditionDepth: this.options.maxConditionDepth,
        customEvaluators: this.options.customEvaluators,
        env,
      });
    } catch {
      // T052: Fail-closed error handling - any uncaught error denies access
      return {
        allowed: false,
        resolvedRoles: { direct: [], derived: [] },
        grantedPermissions: [],
        matchedRules: [],
        finalDecision: `Denied: evaluation error (fail-closed)`,
      };
    }
  }
}

/**
 * Typed factory function for creating a Toride instance.
 */
export function createToride<S extends TorideSchema = DefaultSchema>(options: TorideOptions<S>): Toride<S> {
  return new Toride<S>(options);
}
