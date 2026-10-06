import { expectType, expectAssignable, expectError } from "tsd";
import type { TorideSchema, ResourceRef, ResolverData, ResourceResolver } from "toride";
import { createPrismaResolver } from "../../dist/index.js";

interface TestSchema extends TorideSchema {
  resources: "Document" | "Organization";
  resourceAttributeMap: {
    Document: { status: string; ownerId: string };
    Organization: { plan: string };
  };
  relationMap: {
    Document: { org: "Organization" };
    Organization: {};
  };
}

const client = {
  document: { findUnique: async () => ({ status: "draft" }) },
  organization: { findUnique: async () => ({ plan: "free" }) },
};
const docResolver = createPrismaResolver<TestSchema, "Document", "document">(
  client, "document", { select: { status: true } },
);
expectType<Promise<ResolverData<TestSchema, "Document"> | null>>(
  docResolver({ type: "Document", id: "doc-1" }),
);
expectAssignable<ResourceResolver<TestSchema, "Document">>(docResolver);

const orgResolver = createPrismaResolver<TestSchema, "Organization", "organization">(client, "organization");
expectType<Promise<ResolverData<TestSchema, "Organization"> | null>>(
  orgResolver({ type: "Organization", id: "org-1" }),
);

expectError(createPrismaResolver<TestSchema, "Document", "document">(
  client, "document", { select: { missing: true } },
));
expectError(createPrismaResolver<TestSchema, "Document", "document">(
  { document: { findUnique: async () => ({ status: 123 }) } }, "document",
));
expectError(createPrismaResolver<TestSchema, "Document", "document">(
  { document: { findUnique: async () => ({ org: { type: "Document", id: "bad" } }) } }, "document",
));
expectError(docResolver({ type: "Organization", id: "org-1" }));

const partialResult = await docResolver({ type: "Document", id: "doc-1" });
expectError<ResolverData<TestSchema, "Document">>(partialResult);
if (partialResult !== null) {
  expectType<string | null | undefined>(partialResult.status);
  expectType<string | null | undefined>(partialResult.ownerId);
  expectError<string>(partialResult.ownerId);
}

const logicalClient = { Document: client.document };
expectAssignable<ResourceResolver<TestSchema, "Document">>(
  createPrismaResolver<TestSchema, "Document">(logicalClient, "Document"),
);
const defaultResolver = createPrismaResolver(client, "document");
expectType<Promise<Record<string, unknown> | null>>(defaultResolver({} as ResourceRef));
