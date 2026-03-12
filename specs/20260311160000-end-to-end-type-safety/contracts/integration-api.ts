/**
 * Contract: Integration package APIs after type safety improvements.
 *
 * Shows target signatures for @toride/drizzle and @toride/prisma
 * resolver factories and adapter factories.
 */

type TorideSchema = import("./core-schema").TorideSchema;
type DefaultSchema = import("./core-schema").DefaultSchema;
type TypedResourceRef<S extends TorideSchema, R extends S["resources"]> =
  import("./core-schema").TypedResourceRef<S, R>;

// ─── @toride/drizzle ────────────────────────────────────────────

/**
 * Typed Drizzle resolver factory.
 * The resource type parameter R narrows the return type to match
 * the resource's declared attributes.
 */
declare function createDrizzleResolver<
  S extends TorideSchema = DefaultSchema,
  R extends S["resources"] = S["resources"],
>(
  db: unknown,
  table: unknown,
  options?: { idColumn?: string },
): (ref: TypedResourceRef<S, R>) => Promise<S["resourceAttributeMap"][R]>;

/**
 * Typed Drizzle adapter factory.
 * Resource type narrows the adapter's context.
 */
declare function createDrizzleAdapter<S extends TorideSchema = DefaultSchema>(
  table: unknown,
  options?: DrizzleAdapterOptions,
): ConstraintAdapter<DrizzleQuery>;

// ─── @toride/prisma ─────────────────────────────────────────────

/**
 * Typed Prisma resolver factory.
 * Same pattern as Drizzle — resource type narrows return type.
 */
declare function createPrismaResolver<
  S extends TorideSchema = DefaultSchema,
  R extends S["resources"] = S["resources"],
>(
  client: unknown,
  modelName: R,
  options?: { select?: Record<string, boolean> },
): (ref: TypedResourceRef<S, R>) => Promise<S["resourceAttributeMap"][R]>;

/**
 * Typed Prisma adapter factory.
 */
declare function createPrismaAdapter<S extends TorideSchema = DefaultSchema>(
  options?: PrismaAdapterOptions,
): ConstraintAdapter<PrismaWhere>;

// Placeholder types
type DrizzleAdapterOptions = unknown;
type PrismaAdapterOptions = unknown;
type DrizzleQuery = Record<string, unknown>;
type PrismaWhere = Record<string, unknown>;
type ConstraintAdapter<T> = unknown;
