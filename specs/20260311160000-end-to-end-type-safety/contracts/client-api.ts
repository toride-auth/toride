/**
 * Contract: TorideClient API after type safety improvements.
 *
 * The client becomes generic over TorideSchema, narrowing action
 * and resource.type in its methods.
 */

type TorideSchema = import("./core-schema").TorideSchema;
type DefaultSchema = import("./core-schema").DefaultSchema;

/** Typed client resource ref (no attributes needed on client side). */
interface TypedClientResourceRef<S extends TorideSchema> {
  readonly type: S["resources"];
  readonly id: string;
}

/**
 * Client-side permission checker — generic over TorideSchema.
 *
 * Uses the same schema type as the server-side Toride instance,
 * ensuring frontend/backend permission names stay in sync.
 */
declare class TorideClient<S extends TorideSchema = DefaultSchema> {
  constructor(snapshot: PermissionSnapshot);

  /**
   * Synchronous permission check with typed action and resource.
   * Action is narrowed to the global Actions union.
   */
  can(action: S["actions"], resource: TypedClientResourceRef<S>): boolean;

  /**
   * Return permitted actions for a resource.
   * Return type is the global actions union array.
   */
  permittedActions(resource: TypedClientResourceRef<S>): S["actions"][];
}

type PermissionSnapshot = Record<string, string[]>;
