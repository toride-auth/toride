/**
 * Contract: TorideSchema interface and DefaultSchema.
 *
 * This defines the shape constraint that all schema types must satisfy.
 * The core Toride class is parameterized by this interface.
 * Codegen produces a concrete type that extends TorideSchema with literal types.
 */

// ─── Schema Interface (core package) ────────────────────────────

/**
 * Shape constraint for Toride's type parameter.
 * Each property is a union or mapped type that codegen fills with literals.
 */
export interface TorideSchema {
  /** Union of all resource type names (e.g., "Document" | "Organization") */
  resources: string;
  /** Global union of all action/permission names across all resources */
  actions: string;
  /** Union of all actor type names (e.g., "User" | "ServiceAccount") */
  actorTypes: string;
  /** Per-resource permission unions: { Document: "read" | "write"; ... } */
  permissionMap: { [R in string]: string };
  /** Per-resource role unions: { Document: "admin" | "editor"; ... } */
  roleMap: { [R in string]: string };
  /** Per-resource attribute shapes: { Document: { status: string; ownerId: string }; ... } */
  resourceAttributeMap: { [R in string]: Record<string, unknown> };
  /** Per-actor attribute shapes: { User: { email: string; is_admin: boolean }; ... } */
  actorAttributeMap: { [A in string]: Record<string, unknown> };
  /** Per-resource relation maps: { Document: { org: "Organization" }; ... } */
  relationMap: { [R in string]: Record<string, string> };
}

/**
 * Default schema where everything is string / Record<string, unknown>.
 * Used when Toride is instantiated without a type parameter.
 * Provides full backward compatibility with the current untyped API.
 */
export interface DefaultSchema extends TorideSchema {
  resources: string;
  actions: string;
  actorTypes: string;
  permissionMap: Record<string, string>;
  roleMap: Record<string, string>;
  resourceAttributeMap: Record<string, Record<string, unknown>>;
  actorAttributeMap: Record<string, Record<string, unknown>>;
  relationMap: Record<string, Record<string, string>>;
}

// ─── Generic Ref Types (keep existing names, add type params) ───

/**
 * ActorRef — now generic. Discriminated union over actor types.
 * When S has concrete actor types, this becomes a union of typed variants.
 * When S is DefaultSchema, this collapses to the current untyped ActorRef.
 *
 * NOTE: Original name preserved. ActorRef (no param) = ActorRef<DefaultSchema> = current shape.
 */
export type ActorRef<S extends TorideSchema = DefaultSchema> = {
  [A in S["actorTypes"]]: {
    readonly type: A;
    readonly id: string;
    readonly attributes: S["actorAttributeMap"][A];
  };
}[S["actorTypes"]];

/**
 * ResourceRef — now generic. Parameterized by schema and resource type.
 * The `attributes` field is typed against the resource's declared attributes.
 *
 * NOTE: Original name preserved. ResourceRef (no param) = ResourceRef<DefaultSchema> = current shape.
 */
export type ResourceRef<
  S extends TorideSchema = DefaultSchema,
  R extends S["resources"] = S["resources"],
> = {
  readonly type: R;
  readonly id: string;
  readonly attributes?: S["resourceAttributeMap"][R];
};
