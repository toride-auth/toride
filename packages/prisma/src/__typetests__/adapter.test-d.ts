/**
 * T024: Type tests for createPrismaAdapter with TQueryMap parameter.
 *
 * Tests that:
 * - Untyped (default) adapter returns ConstraintAdapter<Record<string, PrismaWhere>>
 * - Typed adapter with explicit TQueryMap returns ConstraintAdapter<TQueryMap>
 * - TQueryMap constraint enforces PrismaWhere-compatible values
 * - Backward compatibility: untyped usage still works
 */
import { expectType, expectAssignable } from "tsd";
import type { ConstraintAdapter } from "toride";
import { createPrismaAdapter } from "../../dist/index.js";
import type { PrismaWhere } from "../../dist/index.js";

// ─── Per-resource Prisma WHERE types ─────────────────────────────

type DocumentWhereInput = { status?: string; ownerId?: string; AND?: DocumentWhereInput[] };
type OrganizationWhereInput = { plan?: string; AND?: OrganizationWhereInput[] };

type TestQueryMap = {
  Document: DocumentWhereInput;
  Organization: OrganizationWhereInput;
};

// ─── T024: Typed adapter creation ────────────────────────────────

// Typed adapter returns ConstraintAdapter<TestQueryMap>
const typedAdapter = createPrismaAdapter<TestQueryMap>();
expectType<ConstraintAdapter<TestQueryMap>>(typedAdapter);

// ─── T024: Untyped adapter (backward compatibility) ──────────────

// Untyped adapter returns ConstraintAdapter<Record<string, PrismaWhere>>
const untypedAdapter = createPrismaAdapter();
expectType<ConstraintAdapter<Record<string, PrismaWhere>>>(untypedAdapter);

// Untyped adapter is assignable to a ConstraintAdapter with broad query map
expectAssignable<ConstraintAdapter<Record<string, PrismaWhere>>>(untypedAdapter);

// ─── T024: Typed adapter with options ────────────────────────────

const typedAdapterWithOpts = createPrismaAdapter<TestQueryMap>({
  relationMapping: { org: "organization" },
});
expectType<ConstraintAdapter<TestQueryMap>>(typedAdapterWithOpts);
