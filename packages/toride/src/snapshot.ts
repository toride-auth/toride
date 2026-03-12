// T081: snapshot() - Server-side permission snapshot generation

import type { TorideSchema, DefaultSchema, ActorRef, ResourceRef, CheckOptions } from "./types.js";

/**
 * A serializable map of permissions keyed by "Type:id".
 * Values are arrays of permitted action strings.
 * Suitable for JSON transport to client-side TorideClient.
 *
 * Generic over TorideSchema so that the type parameter flows through
 * to TorideClient<S> on deserialization. The runtime structure is unchanged.
 */
export type PermissionSnapshot<
  S extends TorideSchema = DefaultSchema,
> = Record<string, string[]> & { readonly __schema?: S | undefined };

/**
 * Interface for the engine methods needed by snapshot().
 * Keeps snapshot decoupled from the full Toride class.
 * Generic over TorideSchema for type safety when used with Toride<S>.
 */
export interface SnapshotEngine<S extends TorideSchema = DefaultSchema> {
  permittedActions(
    actor: ActorRef<S>,
    resource: ResourceRef<S>,
    options?: CheckOptions,
  ): Promise<string[]>;
}

/**
 * Build a PermissionSnapshot by calling permittedActions() for each resource.
 * Keys are formatted as "Type:id" for consistent lookup on the client side.
 *
 * Complexity: O(n * m) where n = resources.length and m = avg permissions per resource.
 *
 * @param engine - Engine instance with permittedActions() method
 * @param actor - The actor to check permissions for
 * @param resources - List of resources to include in the snapshot
 * @param options - Optional check options (e.g., env context)
 * @returns PermissionSnapshot map
 */
export async function snapshot<S extends TorideSchema = DefaultSchema>(
  engine: SnapshotEngine<S>,
  actor: ActorRef<S>,
  resources: ResourceRef<S>[],
  options?: CheckOptions,
): Promise<PermissionSnapshot<S>> {
  const entries = await Promise.all(
    resources.map(async (resource) => {
      const key = `${resource.type}:${resource.id}`;
      const actions = await engine.permittedActions(actor, resource, options);
      return [key, actions] as const;
    }),
  );
  return Object.fromEntries(entries) as PermissionSnapshot<S>;
}
