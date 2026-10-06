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
const typedAdapter = createPrismaAdapter<DefaultSchema, never, TestQueryMap>();
expectType<ConstraintAdapter<TestQueryMap>>(typedAdapter);

// ─── T024: Untyped adapter (backward compatibility) ──────────────

// Untyped adapter returns ConstraintAdapter<Record<string, PrismaWhere>>
const untypedAdapter = createPrismaAdapter();
expectType<ConstraintAdapter<Record<string, PrismaWhere>>>(untypedAdapter);

// Untyped adapter is assignable to a ConstraintAdapter with broad query map
expectAssignable<ConstraintAdapter<Record<string, PrismaWhere>>>(untypedAdapter);

// ─── T024: Typed adapter with options ───────────────────────────

const typedAdapterWithOpts = createPrismaAdapter<DefaultSchema, never, TestQueryMap>({
  relations: { Document: { org: { field: "organization", resourceType: "Organization", cardinality: "one" } } },
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
      viewer_ids: { relation: "roleAssignments", matchField: "userId", cardinality: "many", valueType: "string", stringComparison: "binary" },
    },
  },
});

// Schema-aware virtualFields with filter containing valid role
createPrismaAdapter<TestSchema>({
  virtualFields: {
    Document: {
      viewer_ids: {
        relation: "roleAssignments",
        matchField: "userId", cardinality: "many", valueType: "string", stringComparison: "binary",
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
      viewer_ids: { relation: "roleAssignments", matchField: "userId", cardinality: "many", valueType: "string", stringComparison: "binary" },
    },
  },
});

// Invalid field name - "viwer_ids" is not an array attribute in Document
createPrismaAdapter<TestSchema>({
  virtualFields: {
    Document: {
      // @ts-expect-error - "viwer_ids" is not a valid array field
      viwer_ids: { relation: "roleAssignments", matchField: "userId", cardinality: "many", valueType: "string", stringComparison: "binary" },
    },
  },
});

// Non-array field cannot be used as virtual field key
createPrismaAdapter<TestSchema>({
  virtualFields: {
    Document: {
      // @ts-expect-error - "status" is not an array type
      status: { relation: "roleAssignments", matchField: "userId", cardinality: "many", valueType: "string", stringComparison: "binary" },
    },
  },
});

// Valid: array field "tag_ids" (number[]) can be used as virtual field key
createPrismaAdapter<TestSchema>({
  virtualFields: {
    Document: {
      tag_ids: { relation: "tags", matchField: "id", cardinality: "many", valueType: "number" },
    },
  },
});

// Valid: Organization member_ids can be used
createPrismaAdapter<TestSchema>({
  virtualFields: {
    Organization: {
      member_ids: { relation: "memberships", matchField: "userId", cardinality: "many", valueType: "string", stringComparison: "binary" },
    },
  },
});

// ─── TModelMap-aware virtualFields type tests ────────────────────

// Model map that defines actual database model fields
type TestModelMap = {
  Document: {
    status: string;
    ownerId: string;
    createdAt: Date;
  };
  Organization: {
    name: string;
    plan: string;
  };
};

// With TModelMap, only virtual fields (not in model) are accepted
createPrismaAdapter<TestSchema, TestModelMap>({
  virtualFields: {
    Document: {
      viewer_ids: { relation: "roleAssignments", matchField: "userId", cardinality: "many", valueType: "string", stringComparison: "binary" },
    },
  },
});

// TModelMap: non-model field tag_ids is accepted
createPrismaAdapter<TestSchema, TestModelMap>({
  virtualFields: {
    Document: {
      tag_ids: { relation: "tags", matchField: "id", cardinality: "many", valueType: "number" },
    },
  },
});

// TModelMap: model field "status" should be rejected
createPrismaAdapter<TestSchema, TestModelMap>({
  virtualFields: {
    Document: {
      // @ts-expect-error - "status" is a model field, not a virtual field
      status: { relation: "roleAssignments", matchField: "userId", cardinality: "many", valueType: "string", stringComparison: "binary" },
    },
  },
});

// TModelMap: model field "ownerId" should be rejected
createPrismaAdapter<TestSchema, TestModelMap>({
  virtualFields: {
    Document: {
      // @ts-expect-error - "ownerId" is a model field, not a virtual field
      ownerId: { relation: "roleAssignments", matchField: "userId", cardinality: "many", valueType: "string", stringComparison: "binary" },
    },
  },
});

// TModelMap: Organization model field "name" should be rejected
createPrismaAdapter<TestSchema, TestModelMap>({
  virtualFields: {
    Organization: {
      // @ts-expect-error - "name" is a model field, not a virtual field
      name: { relation: "memberships", matchField: "userId", cardinality: "many", valueType: "string", stringComparison: "binary" },
    },
  },
});

// Generic filter (Record<string, unknown>) is accepted
createPrismaAdapter<TestSchema, TestModelMap>({
  virtualFields: {
    Document: {
      viewer_ids: {
        relation: "roleAssignments",
        matchField: "userId", cardinality: "many", valueType: "string", stringComparison: "binary",
        filter: { role: "viewer", customField: "anyValue" },
      },
    },
  },
});

// ─── Payload-typed VirtualFieldsConfig type tests ────────────────────

// Mock payload types matching TestSchema's relation names
type MockRoleAssignmentPayload = { scalars: { userId: string; role: string }; objects: {} };
type MockTagPayload = { scalars: { id: number; name: string }; objects: {} };
type MockDocumentPayload = {
  scalars: { status: string; ownerId: string; createdAt: Date };
  objects: { roleAssignments: MockRoleAssignmentPayload[]; tags: MockTagPayload[] };
};
type MockMembershipPayload = { scalars: { userId: string; orgId: string }; objects: {} };
type MockOrganizationPayload = {
  scalars: { name: string; plan: string };
  objects: { memberships: MockMembershipPayload[] };
};
type PayloadModelMap = { Document: MockDocumentPayload; Organization: MockOrganizationPayload };

// Payload-typed: valid relation compiles (roleAssignments is a key in Document.objects)
createPrismaAdapter<TestSchema, PayloadModelMap>({
  virtualFields: {
    Document: {
      viewer_ids: { relation: "roleAssignments", matchField: "userId", cardinality: "many", valueType: "string", stringComparison: "binary" },
    },
  },
});

// Payload-typed: invalid relation is rejected (nonExistent not in Document.objects)
createPrismaAdapter<TestSchema, PayloadModelMap>({
  virtualFields: {
    Document: {
      viewer_ids: {
        // @ts-expect-error - "nonExistent" is not a valid relation in Document.objects
        relation: "nonExistent",
        matchField: "userId", cardinality: "many", valueType: "string", stringComparison: "binary",
      },
    },
  },
});

// Payload-typed: valid matchField compiles (userId is a scalar in MockRoleAssignmentPayload)
createPrismaAdapter<TestSchema, PayloadModelMap>({
  virtualFields: {
    Document: {
      viewer_ids: { relation: "roleAssignments", matchField: "userId", cardinality: "many", valueType: "string", stringComparison: "binary" },
    },
  },
});

// Payload-typed: invalid matchField is rejected (badField not in MockRoleAssignmentPayload.scalars)
createPrismaAdapter<TestSchema, PayloadModelMap>({
  virtualFields: {
    Document: {
      viewer_ids: {
        relation: "roleAssignments",
        // @ts-expect-error - "badField" is not a scalar in MockRoleAssignmentPayload
        matchField: "badField", cardinality: "many", valueType: "string", stringComparison: "binary",
      },
    },
  },
});

// Payload-typed: valid filter compiles (role is a scalar in MockRoleAssignmentPayload)
createPrismaAdapter<TestSchema, PayloadModelMap>({
  virtualFields: {
    Document: {
      viewer_ids: {
        relation: "roleAssignments",
        matchField: "userId", cardinality: "many", valueType: "string", stringComparison: "binary",
        filter: { role: "viewer" },
      },
    },
  },
});

// Payload-typed: invalid filter key is rejected (badKey not in MockRoleAssignmentPayload.scalars)
createPrismaAdapter<TestSchema, PayloadModelMap>({
  virtualFields: {
    Document: {
      viewer_ids: {
        relation: "roleAssignments",
        matchField: "userId", cardinality: "many", valueType: "string", stringComparison: "binary",
        // @ts-expect-error - "badKey" is not a scalar in MockRoleAssignmentPayload
        filter: { badKey: "x" },
      },
    },
  },
});

// Payload-typed: tags relation uses id (number) as matchField
createPrismaAdapter<TestSchema, PayloadModelMap>({
  virtualFields: {
    Document: {
      tag_ids: { relation: "tags", matchField: "id", cardinality: "many", valueType: "number" },
    },
  },
});

// Payload-typed: Organization memberships relation
createPrismaAdapter<TestSchema, PayloadModelMap>({
  virtualFields: {
    Organization: {
      member_ids: { relation: "memberships", matchField: "userId", cardinality: "many", valueType: "string", stringComparison: "binary" },
    },
  },
});

// Payload-typed: filter with correct scalar type
createPrismaAdapter<TestSchema, PayloadModelMap>({
  virtualFields: {
    Document: {
      viewer_ids: {
        relation: "roleAssignments",
        matchField: "userId", cardinality: "many", valueType: "string", stringComparison: "binary",
        filter: { role: "editor", userId: "user123" },
      },
    },
  },
});

// Backward compat: plain model TModelMap (no objects property) still accepts arbitrary strings
// This uses VirtualFieldMapping (untyped) which accepts any string for relation/matchField
createPrismaAdapter<TestSchema, TestModelMap>({
  virtualFields: {
    Document: {
      viewer_ids: {
        relation: "anyString",
        matchField: "anyField", cardinality: "many", valueType: "string", stringComparison: "binary",
        filter: { anyKey: "anyValue" },
      },
    },
  },
});

interface BindingSchema extends TorideSchema {
  resources: "Document" | "Organization";
  actorTypes: "User";
  actorAttributeMap: { User: { email: string } };
  resourceAttributeMap: {
    Document: { title: string | null; rank: number; viewer_ids: string[] };
    Organization: { name: string };
  };
  relationMap: {
    Document: { org: "Organization"; owner: "User" };
    Organization: {};
  };
}
type BindingPayloads = {
  Document: {
    scalars: { id: string; title: string | null; rank: number };
    objects: { organization: { scalars: { id: string; name: string }; objects: {} } | null; owner: { scalars: { id: string }; objects: {} } | null };
  };
  Organization: { scalars: { id: string; name: string }; objects: {} };
  User: { scalars: { id: string; email: string }; objects: {} };
};

createPrismaAdapter<BindingSchema, BindingPayloads>({
  fields: {
    Document: {
      id: { field: "id", type: "string", nullable: false, stringComparison: "binary" },
      title: { field: "title", type: "string", nullable: true, stringComparison: "binary" },
      rank: { field: "rank", type: "number", nullable: false },
    },
    User: { id: { field: "id", type: "string", nullable: false, stringComparison: "binary" } },
  },
  relations: {
    Document: {
      org: { field: "organization", resourceType: "Organization", cardinality: "one" },
      owner: { field: "owner", resourceType: "User", cardinality: "one" },
    },
  },
});
expectError(createPrismaAdapter<BindingSchema>({ fields: { Document: { missing: { field: "title", type: "string", nullable: true } } } }));
expectError(createPrismaAdapter<BindingSchema, BindingPayloads>({ fields: { Document: { title: { field: "missing", type: "string", nullable: true } } } }));
expectError(createPrismaAdapter<BindingSchema, BindingPayloads>({ fields: { Document: { title: { field: "rank", type: "string", nullable: false } } } }));
expectError(createPrismaAdapter<BindingSchema, BindingPayloads>({ fields: { Document: { title: { field: "title", type: "string", nullable: false } } } }));
expectError(createPrismaAdapter<BindingSchema>({ relations: { Document: { missing: { field: "organization", resourceType: "Organization", cardinality: "one" } } } }));
expectError(createPrismaAdapter<BindingSchema>({ relations: { Document: { org: { field: "organization", resourceType: "Document", cardinality: "one" } } } }));
expectError(createPrismaAdapter<BindingSchema, BindingPayloads>({ relations: { Document: { org: { field: "missing", resourceType: "Organization", cardinality: "one" } } } }));
expectError(createPrismaAdapter<BindingSchema, BindingPayloads>({ relations: { Document: { org: { field: "organization", resourceType: "Organization", cardinality: "many" } } } }));
expectError(createPrismaAdapter<BindingSchema>({ virtualFields: { Document: { viewer_ids: { relation: "reviewers", matchField: "id", cardinality: "many", valueType: "number" } } } }));
