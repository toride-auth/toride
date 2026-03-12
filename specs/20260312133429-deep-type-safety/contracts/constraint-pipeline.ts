/**
 * Contract: Constraint Pipeline Type Signatures
 *
 * This file defines the target type signatures for the constraint pipeline
 * after the deep type safety changes. It is NOT executable code — it is a
 * contract document showing the expected public API surface.
 */

// ─── ConstraintResult<R> ──────────────────────────────────────────

/**
 * Result of partial evaluation, tagged with resource type R.
 * R is a phantom type parameter — no runtime field changes.
 */
type ConstraintResult<R extends string = string> =
  | { readonly unrestricted: true; readonly __resource?: R }
  | { readonly forbidden: true; readonly __resource?: R }
  | { readonly constraints: Constraint; readonly __resource?: R };

// ─── ConstraintAdapter<TQueryMap> ─────────────────────────────────

/**
 * User-provided adapter for translating constraint ASTs to queries.
 * TQueryMap maps resource type names to their query output types.
 *
 * BREAKING CHANGE from ConstraintAdapter<TQuery>.
 */
interface ConstraintAdapter<
  TQueryMap extends Record<string, unknown> = Record<string, unknown>,
> {
  translate(constraint: LeafConstraint): TQueryMap[string];
  relation(
    field: string,
    resourceType: string,
    childQuery: TQueryMap[string],
  ): TQueryMap[string];
  hasRole(
    actorId: string,
    actorType: string,
    role: string,
  ): TQueryMap[string];
  unknown(name: string): TQueryMap[string];
  and(queries: TQueryMap[string][]): TQueryMap[string];
  or(queries: TQueryMap[string][]): TQueryMap[string];
  not(query: TQueryMap[string]): TQueryMap[string];
}

// ─── Engine: buildConstraints ─────────────────────────────────────

/**
 * buildConstraints now returns ConstraintResult<R> where R is the
 * resource type string literal.
 */
declare class Toride<S extends TorideSchema = DefaultSchema> {
  buildConstraints<R extends S["resources"]>(
    actor: ActorRef<S>,
    action: S["permissionMap"][R],
    resourceType: R,
    options?: CheckOptions,
  ): Promise<ConstraintResult<R>>;

  /**
   * translateConstraints infers R from ConstraintResult<R> and
   * returns TQueryMap[R] from the adapter's type map.
   */
  translateConstraints<
    R extends string,
    TQueryMap extends Record<string, unknown>,
  >(
    constraints: ConstraintResult<R>,
    adapter: ConstraintAdapter<TQueryMap>,
  ): TQueryMap[R];
}

// ─── Usage Example ───────────────────────────────────────────────

/*
type PrismaQueryMap = {
  Document: Prisma.DocumentWhereInput;
  Organization: Prisma.OrganizationWhereInput;
};

const adapter = createPrismaAdapter<PrismaQueryMap>();

const result = await engine.buildConstraints(actor, "read", "Document");
// result: ConstraintResult<"Document">

if ("constraints" in result) {
  const where = engine.translateConstraints(result, adapter);
  // where: Prisma.DocumentWhereInput  ← inferred from R="Document" + PrismaQueryMap
}
*/
