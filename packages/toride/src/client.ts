// T082: TorideClient - Client-side synchronous permission checking
// toride/client - Zero server-side runtime dependencies

export const CLIENT_VERSION = "0.0.1";

// Import type only - no runtime dependency on server code
import type { PermissionSnapshot } from "./snapshot.js";

/** Minimal resource reference for client-side lookups. */
export interface ClientResourceRef {
  readonly type: string;
  readonly id: string;
}

/**
 * Client-side permission checker that provides instant synchronous checks
 * against a PermissionSnapshot received from the server.
 *
 * Default-deny: unknown resources or actions return false.
 * The snapshot is defensively copied to prevent external mutation.
 */
export class TorideClient {
  private readonly permissions: Map<string, ReadonlySet<string>>;

  constructor(snapshot: PermissionSnapshot) {
    this.permissions = new Map();
    for (const [key, actions] of Object.entries(snapshot)) {
      this.permissions.set(key, new Set(actions));
    }
  }

  /**
   * Synchronous permission check.
   * Returns true if the action is permitted for the resource, false otherwise.
   * Unknown resources return false (default-deny).
   */
  can(action: string, resource: ClientResourceRef): boolean {
    const key = `${resource.type}:${resource.id}`;
    const actions = this.permissions.get(key);
    if (!actions) return false;
    return actions.has(action);
  }

  /**
   * Return the list of permitted actions for a resource.
   * Returns empty array for unknown resources.
   */
  permittedActions(resource: ClientResourceRef): string[] {
    const key = `${resource.type}:${resource.id}`;
    const actions = this.permissions.get(key);
    if (!actions) return [];
    return [...actions];
  }
}

// Re-export PermissionSnapshot type for client consumers
export type { PermissionSnapshot } from "./snapshot.js";
