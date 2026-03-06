// T030: Toride class with can() method
// T031: createToride() typed factory function
// T064: Wire up buildConstraints() and translateConstraints()

import type {
  ActorRef,
  ResourceRef,
  CheckOptions,
  TorideOptions,
  Policy,
  RelationResolver,
  ExplainResult,
} from "./types.js";
import type {
  Constraint,
  ConstraintResult,
  ConstraintAdapter,
} from "./partial/constraint-types.js";
import { evaluate } from "./evaluation/rule-engine.js";
import { ResolverCache } from "./evaluation/cache.js";
import { buildConstraints as buildConstraintsImpl } from "./partial/constraint-builder.js";
import { translateConstraints as translateConstraintsImpl } from "./partial/translator.js";

/**
 * Main authorization engine.
 * Creates a per-check cache, resolves direct roles, checks grants,
 * and returns boolean with default-deny semantics.
 */
export class Toride {
  private readonly policy: Policy;
  private readonly resolver: RelationResolver;
  private readonly options: TorideOptions;

  constructor(options: TorideOptions) {
    this.policy = options.policy;
    this.resolver = options.resolver;
    this.options = options;
  }

  /**
   * Check if an actor can perform an action on a resource.
   * Default-deny: returns false if resource type is unknown or no grants match.
   */
  async can(
    actor: ActorRef,
    action: string,
    resource: ResourceRef,
    options?: CheckOptions,
  ): Promise<boolean> {
    const result = await this.evaluate(actor, action, resource, options);
    return result.allowed;
  }

  /**
   * T064: Build constraint AST for partial evaluation / data filtering.
   * Returns ConstraintResult with unrestricted/forbidden sentinels or constraint AST.
   */
  async buildConstraints(
    actor: ActorRef,
    action: string,
    resourceType: string,
    options?: CheckOptions,
  ): Promise<ConstraintResult> {
    const cachedResolver = new ResolverCache(this.resolver);
    return buildConstraintsImpl(
      actor,
      action,
      resourceType,
      cachedResolver,
      this.policy,
      {
        env: options?.env,
        maxDerivedRoleDepth: this.options.maxDerivedRoleDepth,
        customEvaluators: this.options.customEvaluators,
      },
    );
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
   * Evaluate with full ExplainResult (shared code path for can() and explain()).
   */
  private async evaluate(
    actor: ActorRef,
    action: string,
    resource: ResourceRef,
    checkOptions?: CheckOptions,
  ): Promise<ExplainResult> {
    // Look up resource block; unknown resource type → default deny
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

    // Wire up ResolverCache for per-check deduplication
    const cachedResolver = new ResolverCache(this.resolver);
    const env = checkOptions?.env ?? {};

    // T052: Forward all options including customEvaluators and maxConditionDepth
    try {
      return await evaluate(actor, action, resource, resourceBlock, cachedResolver, this.policy, {
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
export function createToride(options: TorideOptions): Toride {
  return new Toride(options);
}
