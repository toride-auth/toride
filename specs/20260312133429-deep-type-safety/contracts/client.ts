/**
 * Contract: TorideClient Type Signatures (Post Deep Type Safety)
 *
 * Shows the target signatures for the client-side permission checker
 * with per-resource action narrowing. NOT executable code — contract only.
 */

// ─── ClientResourceRef<S, R> ─────────────────────────────────────

/**
 * Now generic over R to enable per-resource narrowing on can().
 */
interface ClientResourceRef<
  S extends TorideSchema = DefaultSchema,
  R extends S["resources"] = S["resources"],
> {
  readonly type: R;
  readonly id: string;
}

// ─── TorideClient<S> ─────────────────────────────────────────────

declare class TorideClient<S extends TorideSchema = DefaultSchema> {
  constructor(snapshot: PermissionSnapshot<S>);

  /**
   * Per-resource action narrowing.
   * R is inferred from resource.type, action is narrowed to S['permissionMap'][R].
   *
   * Example:
   *   client.can("read", { type: "Document", id: "d1" })
   *   // R inferred as "Document", action narrowed to "read" | "write" | "delete"
   *
   *   client.can("manage", { type: "Document", id: "d1" })
   *   // ❌ Type error: "manage" not in Document permissions
   */
  can<R extends S["resources"]>(
    action: S["permissionMap"][R],
    resource: ClientResourceRef<S, R>,
  ): boolean;

  /**
   * Returns per-resource permission union array.
   *
   * Example:
   *   client.permittedActions({ type: "Document", id: "d1" })
   *   // returns ("read" | "write" | "delete")[]
   */
  permittedActions<R extends S["resources"]>(
    resource: ClientResourceRef<S, R>,
  ): S["permissionMap"][R][];
}

// ─── Usage Example ───────────────────────────────────────────────

/*
const client = new TorideClient<GeneratedSchema>(snapshot);

// ✅ Compiles — "read" is a Document permission
client.can("read", { type: "Document", id: "d1" });

// ❌ Type error — "manage" is not a Document permission
client.can("manage", { type: "Document", id: "d1" });

// ✅ Per-resource narrowing on permittedActions
const actions = client.permittedActions({ type: "Document", id: "d1" });
// type: ("read" | "write" | "delete")[]

// ✅ Backward compat — default client accepts any strings
const defaultClient = new TorideClient(snapshot);
defaultClient.can("anything", { type: "whatever", id: "x" });
*/
