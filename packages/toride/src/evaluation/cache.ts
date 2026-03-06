// T027: Per-check resolver cache
// Wraps RelationResolver methods with a Map<string, Promise<T>> cache
// keyed by `${method}:${type}:${id}` to prevent duplicate resolver calls.

import type { ActorRef, ResourceRef, RelationResolver } from "../types.js";

/**
 * Per-check resolver cache. Created fresh for each `can()` call.
 * Stores Promises to prevent duplicate concurrent calls for the same key.
 */
export class ResolverCache {
  private readonly cache = new Map<string, Promise<unknown>>();
  private readonly resolver: RelationResolver;

  constructor(resolver: RelationResolver) {
    this.resolver = resolver;
  }

  private key(method: string, type: string, id: string): string {
    return `${method}:${type}:${id}`;
  }

  async getRoles(actor: ActorRef, resource: ResourceRef): Promise<string[]> {
    const k = this.key("getRoles", resource.type, resource.id);
    if (!this.cache.has(k)) {
      this.cache.set(k, this.resolver.getRoles(actor, resource));
    }
    return this.cache.get(k) as Promise<string[]>;
  }

  async getRelated(
    resource: ResourceRef,
    relationName: string,
  ): Promise<ResourceRef | ResourceRef[]> {
    const k = this.key("getRelated", resource.type, `${resource.id}:${relationName}`);
    if (!this.cache.has(k)) {
      this.cache.set(k, this.resolver.getRelated(resource, relationName));
    }
    return this.cache.get(k) as Promise<ResourceRef | ResourceRef[]>;
  }

  async getAttributes(ref: ResourceRef): Promise<Record<string, unknown>> {
    const k = this.key("getAttributes", ref.type, ref.id);
    if (!this.cache.has(k)) {
      this.cache.set(k, this.resolver.getAttributes(ref));
    }
    return this.cache.get(k) as Promise<Record<string, unknown>>;
  }
}
