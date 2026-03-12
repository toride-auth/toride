// T082: TorideClient - Client-side synchronous permission checking
// toride/client - Zero server-side runtime dependencies

export const CLIENT_VERSION = "0.0.1";

// Import type only - no runtime dependency on server code
import type { PermissionSnapshot } from "./snapshot.js";
import type { TorideSchema, DefaultSchema } from "./types.js";

/** Minimal resource reference for client-side lookups. Generic over S and R for type narrowing. */
export interface ClientResourceRef<
  S extends TorideSchema = DefaultSchema,
  R extends S["resources"] = S["resources"],
> {
  readonly type: R;
  readonly id: string;
}

/**
 * Client-side permission checker that provides instant synchronous checks
 * against a PermissionSnapshot received from the server.
 *
 * Generic over TorideSchema so that action names and resource types
 * are validated at compile time when a concrete schema is provided.
 *
 * Default-deny: unknown resources or actions return false.
 * The snapshot is defensively copied to prevent external mutation.
 */
export class TorideClient<S extends TorideSchema = DefaultSchema> {
  private readonly permissions: Map<string, ReadonlySet<string>>;

  constructor(snapshot: PermissionSnapshot<S>) {
    this.permissions = new Map();
    const entries = snapshot as Record<string, string[]>;
    for (const [key, actions] of Object.entries(entries)) {
      this.permissions.set(key, new Set(actions));
    }
  }

  /**
   * Synchronous permission check.
   * Returns true if the action is permitted for the resource, false otherwise.
   * Unknown resources return false (default-deny).
   */
  can<R extends S["resources"]>(action: S["permissionMap"][R], resource: ClientResourceRef<S, R>): boolean {
    const key = `${resource.type}:${resource.id}`;
    const actions = this.permissions.get(key);
    if (!actions) return false;
    return actions.has(action);
  }

  /**
   * Return the list of permitted actions for a resource.
   * Returns empty array for unknown resources.
   */
  permittedActions<R extends S["resources"]>(resource: ClientResourceRef<S, R>): S["permissionMap"][R][] {
    const key = `${resource.type}:${resource.id}`;
    const actions = this.permissions.get(key);
    if (!actions) return [];
    return [...actions] as S["permissionMap"][R][];
  }
}

// Re-export PermissionSnapshot type for client consumers
export type { PermissionSnapshot } from "./snapshot.js";
