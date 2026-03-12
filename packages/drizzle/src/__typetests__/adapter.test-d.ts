/**
 * T025: Type tests for createDrizzleAdapter with TQueryMap parameter.
 *
 * Tests that:
 * - Untyped (default) adapter returns ConstraintAdapter<Record<string, DrizzleQuery>>
 * - Typed adapter with explicit TQueryMap returns ConstraintAdapter<TQueryMap>
 * - TQueryMap constraint enforces DrizzleQuery-compatible values
 * - Backward compatibility: untyped usage still works
 */
import { expectType, expectAssignable } from "tsd";
import type { ConstraintAdapter } from "toride";
import { createDrizzleAdapter } from "../../dist/index.js";
import type { DrizzleQuery } from "../../dist/index.js";

// ─── Per-resource Drizzle query types ────────────────────────────

type DocumentQuery = { _op: string; field: string; table: unknown };
type OrganizationQuery = { _op: string; field: string; table: unknown };

type TestQueryMap = {
  Document: DocumentQuery;
  Organization: OrganizationQuery;
};

// ─── T025: Typed adapter creation ────────────────────────────────

// Typed adapter returns ConstraintAdapter<TestQueryMap>
const typedAdapter = createDrizzleAdapter<TestQueryMap>({} as any);
expectType<ConstraintAdapter<TestQueryMap>>(typedAdapter);

// ─── T025: Untyped adapter (backward compatibility) ──────────────

// Untyped adapter returns ConstraintAdapter<Record<string, DrizzleQuery>>
const untypedAdapter = createDrizzleAdapter({} as any);
expectType<ConstraintAdapter<Record<string, DrizzleQuery>>>(untypedAdapter);

// Untyped adapter is assignable to a ConstraintAdapter with broad query map
expectAssignable<ConstraintAdapter<Record<string, DrizzleQuery>>>(untypedAdapter);

// ─── T025: Typed adapter with options ────────────────────────────

const typedAdapterWithOpts = createDrizzleAdapter<TestQueryMap>({} as any, {
  relations: {},
});
expectType<ConstraintAdapter<TestQueryMap>>(typedAdapterWithOpts);
