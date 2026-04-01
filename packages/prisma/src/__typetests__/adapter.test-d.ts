/**
 * T024: Type tests for createPrismaAdapter with TQueryMap parameter.
 *
 * Tests that:
 * - Untyped (default) adapter returns ConstraintAdapter<Record<string, PrismaWhere>>
 * - Typed adapter with explicit TQueryMap returns ConstraintAdapter<TQueryMap>
 * - TQueryMap constraint enforces PrismaWhere-compatible values
 * - Backward compatibility: untyped usage still works
 * - Schema-aware virtualFields type safety
 */
import { expectType, expectAssignable, expectError } from "tsd";
import type { ConstraintAdapter, TorideSchema, DefaultSchema } from "toride";
import { createPrismaAdapter } from "../../dist/index.js";
import type { PrismaWhere } from "../../dist/index.js";

// ─── Per-resource Prisma WHERE types ─────────────────────────────

type DocumentWhereInput = { status?: string; ownerId?: string; AND?: DocumentWhereInput[] };
type OrganizationWhereInput = { plan?: string; AND?: OrganizationWhereInput[] };

type TestQueryMap = {
  Document: DocumentWhereInput;
  Organization: OrganizationWhereInput;
};

// ─── T024: Typed adapter creation ───────────────────────────────

// Typed adapter returns ConstraintAdapter<TestQueryMap>
const typedAdapter = createPrismaAdapter<DefaultSchema, TestQueryMap>();
expectType<ConstraintAdapter<TestQueryMap>>(typedAdapter);

// ─── T024: Untyped adapter (backward compatibility) ──────────────

// Untyped adapter returns ConstraintAdapter<Record<string, PrismaWhere>>
const untypedAdapter = createPrismaAdapter();
expectType<ConstraintAdapter<Record<string, PrismaWhere>>>(untypedAdapter);

// Untyped adapter is assignable to a ConstraintAdapter with broad query map
expectAssignable<ConstraintAdapter<Record<string, PrismaWhere>>>(untypedAdapter);

// ─── T024: Typed adapter with options ───────────────────────────

const typedAdapterWithOpts = createPrismaAdapter<DefaultSchema, TestQueryMap>({
  relationMapping: { org: "organization" },
});
expectType<ConstraintAdapter<TestQueryMap>>(typedAdapterWithOpts);

// ─── Schema-aware virtualFields type tests ───────────────────────

interface TestSchema extends TorideSchema {
  resources: "Document" | "Organization";
  roleMap: {
    Document: "admin" | "editor" | "viewer";
    Organization: "owner" | "member";
  };
  resourceAttributeMap: {
    Document: {
      status: string;
      ownerId: string;
      viewer_ids: string[];
      tag_ids: number[];
      createdAt: Date;
    };
    Organization: {
      name: string;
      plan: string;
      member_ids: string[];
    };
  };
}

// Schema-aware virtualFields with valid resource, field, and role
createPrismaAdapter<TestSchema>({
  virtualFields: {
    Document: {
      viewer_ids: { relation: "roleAssignments", matchField: "userId" },
    },
  },
});

// Schema-aware virtualFields with filter containing valid role
createPrismaAdapter<TestSchema>({
  virtualFields: {
    Document: {
      viewer_ids: {
        relation: "roleAssignments",
        matchField: "userId",
        filter: { role: "viewer" },
      },
    },
  },
});

// Invalid resource name - "Projet" is not in TestSchema resources
createPrismaAdapter<TestSchema>({
  virtualFields: {
    // @ts-expect-error - "Projet" is not a valid resource
    Projet: {
      viewer_ids: { relation: "roleAssignments", matchField: "userId" },
    },
  },
});

// Invalid field name - "viwer_ids" is not an array attribute in Document
createPrismaAdapter<TestSchema>({
  virtualFields: {
    Document: {
      // @ts-expect-error - "viwer_ids" is not a valid array field
      viwer_ids: { relation: "roleAssignments", matchField: "userId" },
    },
  },
});

// Non-array field cannot be used as virtual field key
createPrismaAdapter<TestSchema>({
  virtualFields: {
    Document: {
      // @ts-expect-error - "status" is not an array type
      status: { relation: "roleAssignments", matchField: "userId" },
    },
  },
});

// Invalid role string in filter
createPrismaAdapter<TestSchema>({
  virtualFields: {
    Document: {
      viewer_ids: {
        relation: "roleAssignments",
        matchField: "userId",
        // @ts-expect-error - "veiwer" is not a valid role
        filter: { role: "veiwer" },
      },
    },
  },
});

// Valid: array field "tag_ids" (number[]) can be used as virtual field key
createPrismaAdapter<TestSchema>({
  virtualFields: {
    Document: {
      tag_ids: { relation: "tags", matchField: "id" },
    },
  },
});

// Valid: Organization member_ids can be used
createPrismaAdapter<TestSchema>({
  virtualFields: {
    Organization: {
      member_ids: { relation: "memberships", matchField: "userId" },
    },
  },
});
