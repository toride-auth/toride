// T007: Per-check attribute cache
// Wraps Resolvers map with a Map<string, Promise<Record<string, unknown>>> cache
// keyed by `${type}:${id}` to prevent duplicate resolver calls.
// Merges inline ref.attributes with resolver results (inline wins).

import type { ResourceRef, Resolvers } from "../types.js";

/**
 * Per-check attribute cache. Created fresh for each `can()` call.
 * Stores Promises to prevent duplicate concurrent calls for the same key.
 *
 * Resolution strategy:
 * 1. If the ref has inline attributes AND a resolver exists, merge both (inline wins).
 * 2. If the ref has inline attributes but no resolver, use inline only.
 * 3. If the ref has no inline attributes but a resolver exists, use resolver result.
 * 4. If neither, return empty object (trivial resolver behavior).
 */
export class AttributeCache {
  private readonly cache = new Map<string, Promise<Record<string, unknown>>>();
  private readonly resolvers: Resolvers;

  constructor(resolvers?: Resolvers) {
    this.resolvers = resolvers ?? {};
  }

  private key(type: string, id: string): string {
    return `${type}:${id}`;
  }

  /**
   * Resolve all attributes for a resource reference.
   * Merges inline attributes with resolver results (inline takes precedence).
   * Results are cached by `${type}:${id}`.
   */
  async resolve(ref: ResourceRef): Promise<Record<string, unknown>> {
    const k = this.key(ref.type, ref.id);
    if (!this.cache.has(k)) {
      this.cache.set(k, this.doResolve(ref));
    }
    return this.cache.get(k) as Promise<Record<string, unknown>>;
  }

  private async doResolve(ref: ResourceRef): Promise<Record<string, unknown>> {
    const inline = ref.attributes ?? {};
    const resolver = this.resolvers[ref.type];

    if (!resolver) {
      return inline;
    }

    const resolved = await resolver(ref);
    // Merge: inline attributes take precedence over resolver results
    return { ...resolved, ...inline };
  }
}
