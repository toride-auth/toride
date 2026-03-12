/**
 * Contract: Engine Method Type Signatures (Post Deep Type Safety)
 *
 * Shows the target signatures for all engine methods that gain
 * deeper type narrowing. NOT executable code — contract only.
 */

// ─── canField: typed field parameter ──────────────────────────────

declare class Toride<S extends TorideSchema = DefaultSchema> {
  /**
   * Field parameter narrowed to known attribute names for resource R.
   * Uses `keyof S['resourceAttributeMap'][R] & string` to derive field union.
   *
   * When R has no declared attributes (resourceAttributeMap[R] = Record<string, unknown>),
   * field type degrades to `string` — permissive fallback.
   */
  canField<R extends S["resources"]>(
    actor: ActorRef<S>,
    operation: "read" | "update",
    resource: ResourceRef<S, R>,
    field: keyof S["resourceAttributeMap"][R] & string,
    options?: CheckOptions,
  ): Promise<boolean>;

  /**
   * Returns typed field name array for the resource.
   */
  permittedFields<R extends S["resources"]>(
    actor: ActorRef<S>,
    operation: "read" | "update",
    resource: ResourceRef<S, R>,
    options?: CheckOptions,
  ): Promise<(keyof S["resourceAttributeMap"][R] & string)[]>;

  /**
   * Returns per-resource role union array instead of string[].
   */
  resolvedRoles<R extends S["resources"]>(
    actor: ActorRef<S>,
    resource: ResourceRef<S, R>,
    options?: CheckOptions,
  ): Promise<S["roleMap"][R][]>;

  /**
   * Snapshot now carries schema type parameter.
   */
  snapshot(
    actor: ActorRef<S>,
    resources: ResourceRef<S>[],
    options?: CheckOptions,
  ): Promise<PermissionSnapshot<S>>;
}

// ─── PermissionSnapshot<S> ────────────────────────────────────────

/**
 * Runtime structure unchanged (Record<string, string[]>).
 * S is a phantom type parameter for compile-time safety.
 */
type PermissionSnapshot<S extends TorideSchema = DefaultSchema> =
  Record<string, string[]> & { readonly __schema?: S };
