/**
 * Contract: Adapter Package Type Signatures (Post Deep Type Safety)
 *
 * Shows the target signatures for @toride/prisma and @toride/drizzle
 * with per-resource query type mapping. NOT executable code — contract only.
 */

// ─── @toride/prisma ──────────────────────────────────────────────

type PrismaWhere = Record<string, unknown>;

/**
 * createPrismaAdapter gains a TQueryMap type parameter.
 * Default: Record<string, PrismaWhere> (all resources → PrismaWhere).
 * Users can provide a specific map for per-resource typing.
 */
declare function createPrismaAdapter<
  TQueryMap extends Record<string, PrismaWhere> = Record<string, PrismaWhere>,
>(options?: PrismaAdapterOptions): ConstraintAdapter<TQueryMap>;

/*
Usage:

// Untyped (backward compat) — all resources return PrismaWhere
const adapter = createPrismaAdapter();

// Typed — per-resource Prisma WHERE types
const typedAdapter = createPrismaAdapter<{
  Document: Prisma.DocumentWhereInput;
  Organization: Prisma.OrganizationWhereInput;
}>();

const result = await engine.buildConstraints(actor, "read", "Document");
if ("constraints" in result) {
  const where = engine.translateConstraints(result, typedAdapter);
  // where: Prisma.DocumentWhereInput
}
*/

// ─── @toride/drizzle ─────────────────────────────────────────────

type DrizzleQuery = Record<string, unknown>;

/**
 * createDrizzleAdapter gains a TQueryMap type parameter.
 * Default: Record<string, DrizzleQuery> (all resources → DrizzleQuery).
 */
declare function createDrizzleAdapter<
  TQueryMap extends Record<string, DrizzleQuery> = Record<string, DrizzleQuery>,
>(
  table: AnyTable,
  options?: DrizzleAdapterOptions,
): ConstraintAdapter<TQueryMap>;

/*
Usage:

// Untyped — all resources return DrizzleQuery
const adapter = createDrizzleAdapter(documentsTable);

// Typed — per-resource Drizzle query types
const typedAdapter = createDrizzleAdapter<{
  Document: SQL<DocumentRow>;
  Organization: SQL<OrganizationRow>;
}>(documentsTable);
*/
