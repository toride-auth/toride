// T007: Per-check attribute cache
// T016: Relation recognition for ResourceRef values
// T017: Cascading inline attributes for nested ResourceRefs
// T018: FR-016 strict validation for resolver relation values
//
// Wraps Resolvers map with a Map<string, Promise<Record<string, unknown>>> cache
// keyed by `${type}:${id}` to prevent duplicate resolver calls.
// Merges inline ref.attributes with resolver results (inline wins).

import type { ResourceRef, ResourceBlock, Resolvers } from "../types.js";
import { ValidationError } from "../types.js";

/**
 * Check if a value is ResourceRef-shaped (has `type` and `id` string fields).
 */
function isResourceRef(value: unknown): value is ResourceRef {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.type === "string" && typeof obj.id === "string";
}

/**
 * Per-check attribute cache. Created fresh for each `can()` call.
 * Stores Promises to prevent duplicate concurrent calls for the same key.
 *
 * Resolution strategy (implements the **default resolver** pattern):
 * 1. If the ref has inline attributes AND a resolver exists, merge both (inline wins).
 * 2. If the ref has inline attributes but no resolver, use inline only — **default
 *    resolver behavior**. Inline {@link ResourceRef.attributes} serve as the sole
 *    data source, analogous to GraphQL's default field resolver returning
 *    `parent[fieldName]`.
 * 3. If the ref has no inline attributes but a resolver exists, use resolver result.
 * 4. If neither, return empty object — **default resolver behavior** with no data.
 *    All `$resource.<field>` references resolve to `undefined`, causing conditions
 *    to fail (default-deny).
 *
 * In all cases, **inline attributes take precedence** over resolver results on a
 * field-by-field basis.
 *
 * T016: When a resolved attribute matches a declared relation AND is ResourceRef-shaped,
 * it is treated as a relation target for path traversal.
 *
 * T017: Extra fields beyond `type`/`id` on a relation-target ResourceRef are
 * seeded as inline attributes for the referenced resource's cache entry.
 *
 * T018: After resolver calls, fields declared as relations are validated:
 * if the value is not a valid ResourceRef, a ValidationError is thrown.
 * This is stricter than inline (which is lenient for non-ResourceRef values).
 */
export class AttributeCache {
  private readonly cache = new Map<string, Promise<Record<string, unknown>>>();
  /** Pre-seeded inline attributes from cascading (T017). */
  private readonly seededInline = new Map<string, Record<string, unknown>>();
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
   *
   * @param ref The resource reference
   * @param resourceBlock Optional resource block for FR-016 validation of resolver results
   */
  async resolve(ref: ResourceRef, resourceBlock?: ResourceBlock): Promise<Record<string, unknown>> {
    const k = this.key(ref.type, ref.id);
    if (!this.cache.has(k)) {
      this.cache.set(k, this.doResolve(ref, resourceBlock));
    }
    return this.cache.get(k) as Promise<Record<string, unknown>>;
  }

  /**
   * Seed inline attributes for a resource from cascading (T017).
   * Called when a relation-target value has extra fields beyond type/id.
   * These are merged into the cache entry as pre-populated inline attributes.
   */
  private seedInline(type: string, id: string, attrs: Record<string, unknown>): void {
    const k = this.key(type, id);
    const existing = this.seededInline.get(k);
    if (existing) {
      // Merge, earlier seeds win (first inline encounter takes precedence)
      this.seededInline.set(k, { ...attrs, ...existing });
    } else {
      this.seededInline.set(k, attrs);
    }
  }

  private async doResolve(ref: ResourceRef, resourceBlock?: ResourceBlock): Promise<Record<string, unknown>> {
    const k = this.key(ref.type, ref.id);
    const seeded = this.seededInline.get(k) ?? {};
    const inline = ref.attributes ?? {};
    // Combine: ref inline attributes take precedence over seeded
    const allInline = { ...seeded, ...inline };

    const resolver = this.resolvers[ref.type];

    if (!resolver) {
      // T017: Process inline attributes for cascading
      this.processCascadingInline(allInline, resourceBlock);
      return allInline;
    }

    const resolved = await resolver(ref);

    // T018: Validate resolver results for declared relations (FR-016)
    if (resourceBlock?.relations) {
      this.validateResolverRelations(resolved, allInline, resourceBlock.relations, ref.type);
    }

    // Merge: inline attributes take precedence over resolver results
    const merged = { ...resolved, ...allInline };

    // T017: Process merged attributes for cascading inline
    this.processCascadingInline(merged, resourceBlock);

    return merged;
  }

  /**
   * T017: Extract extra fields from ResourceRef-shaped relation values
   * and seed them into the cache for the referenced resource.
   */
  private processCascadingInline(
    attrs: Record<string, unknown>,
    resourceBlock?: ResourceBlock,
  ): void {
    if (!resourceBlock?.relations) return;

    for (const [fieldName, targetType] of Object.entries(resourceBlock.relations)) {
      const value = attrs[fieldName];
      if (!isResourceRef(value)) continue;

      // Extract extra fields beyond type/id as inline attributes for the target
      const { type, id, ...extra } = value as unknown as Record<string, unknown>;
      if (Object.keys(extra).length > 0) {
        this.seedInline(targetType, id as string, extra);
      }
    }
  }

  /**
   * T018: Validate that resolver-returned values for declared relation fields
   * are valid ResourceRefs. Throws ValidationError if not.
   * Only validates fields that come from the resolver (not inline).
   */
  private validateResolverRelations(
    resolverResult: Record<string, unknown>,
    inlineAttrs: Record<string, unknown>,
    relations: Record<string, string>,
    resourceType: string,
  ): void {
    for (const [fieldName, targetType] of Object.entries(relations)) {
      // Only validate fields that come from the resolver, not inline overrides
      if (fieldName in inlineAttrs) continue;

      const value = resolverResult[fieldName];
      // Skip if the resolver didn't return this field at all
      if (value === undefined || value === null) continue;

      // Arrays of ResourceRefs are valid (many relations)
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          if (!isResourceRef(value[i])) {
            throw new ValidationError(
              `Resolver for "${resourceType}" returned invalid value for relation field "${fieldName}[${i}]": ` +
              `expected ResourceRef with type/id, got ${typeof value[i] === "object" ? JSON.stringify(value[i]) : String(value[i])}. ` +
              `Declared relation target type: "${targetType}".`,
              `resolvers.${resourceType}.${fieldName}[${i}]`,
            );
          }
        }
        continue;
      }

      // Single value must be ResourceRef-shaped
      if (!isResourceRef(value)) {
        throw new ValidationError(
          `Resolver for "${resourceType}" returned invalid value for relation field "${fieldName}": ` +
          `expected ResourceRef with type/id, got ${typeof value === "object" ? JSON.stringify(value) : String(value)}. ` +
          `Declared relation target type: "${targetType}".`,
          `resolvers.${resourceType}.${fieldName}`,
        );
      }
    }
  }
}
