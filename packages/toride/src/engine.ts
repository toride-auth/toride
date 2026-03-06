// T030: Toride class with can() method
// T031: createToride() typed factory function

import type {
  ActorRef,
  ResourceRef,
  TorideOptions,
  Policy,
  RelationResolver,
  ExplainResult,
} from "./types.js";
import { evaluate } from "./evaluation/rule-engine.js";

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
  ): Promise<boolean> {
    const result = await this.evaluate(actor, action, resource);
    return result.allowed;
  }

  /**
   * Evaluate with full ExplainResult (shared code path for can() and explain()).
   */
  private async evaluate(
    actor: ActorRef,
    action: string,
    resource: ResourceRef,
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

    return evaluate(actor, action, resource, resourceBlock, this.resolver);
  }
}

/**
 * Typed factory function for creating a Toride instance.
 */
export function createToride(options: TorideOptions): Toride {
  return new Toride(options);
}
