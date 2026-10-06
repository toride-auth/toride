import { expectType, expectAssignable, expectError, expectNotAssignable } from "tsd";
import type { TorideSchema, ResourceRef, ResolverData } from "toride";
import { createDrizzleResolver } from "../../dist/index.js";

interface TestSchema extends TorideSchema {
  resources: "Document" | "Organization";
  actions: "read" | "write" | "delete" | "manage";
  actorTypes: "User";
  permissionMap: {
    Document: "read" | "write" | "delete";
    Organization: "manage" | "read";
  };
  roleMap: {
    Document: "editor" | "viewer";
    Organization: "admin" | "member";
  };
  resourceAttributeMap: {
    Document: { status: string; ownerId: string };
    Organization: { plan: string };
  };
  actorAttributeMap: {
    User: { email: string };
  };
  relationMap: {
    Document: { org: "Organization" };
    Organization: {};
  };
}

const docResolver = createDrizzleResolver<TestSchema, "Document">(
  {} as any,
  {} as any,
);
const docResult = docResolver({} as ResourceRef<TestSchema, "Document">);
expectType<Promise<ResolverData<TestSchema, "Document"> | null>>(docResult);

const orgResolver = createDrizzleResolver<TestSchema, "Organization">(
  {} as any,
  {} as any,
);
const orgResult = orgResolver({} as ResourceRef<TestSchema, "Organization">);
expectType<Promise<ResolverData<TestSchema, "Organization"> | null>>(orgResult);

const resolverWithOpts = createDrizzleResolver<TestSchema, "Document">(
  {} as any,
  {} as any,
  { idColumn: "docId" },
);
expectType<
  (ref: ResourceRef<TestSchema, "Document">) => Promise<ResolverData<TestSchema, "Document"> | null>
>(resolverWithOpts);

const defaultResolver = createDrizzleResolver({} as any, {} as any);
const defaultResult = defaultResolver({} as ResourceRef);
expectType<Promise<Record<string, unknown> | null>>(defaultResult);

expectAssignable<(ref: ResourceRef) => Promise<Record<string, unknown> | null>>(defaultResolver);

expectNotAssignable<Promise<{ status: string; ownerId: string }>>(docResult);
expectNotAssignable<Promise<{ plan: string }>>(orgResult);
expectError(docResolver({ type: "Organization", id: "org1" }));
expectAssignable<ResolverData<TestSchema, "Document">>({});
expectAssignable<ResolverData<TestSchema, "Document">>({ org: { type: "Organization", id: "org1" } });
expectNotAssignable<ResolverData<TestSchema, "Document">>({ org: { type: "Document", id: "doc1" } });
expectNotAssignable<ResolverData<TestSchema, "Document">>({ status: 123 });

import { drizzle } from "drizzle-orm/sqlite-proxy";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
const nativeTable = sqliteTable("Document", { id: text("id").primaryKey(), status: text("status") });
const nativeDb = drizzle(async () => ({ rows: [] }));
const nativeResolver = createDrizzleResolver<TestSchema, "Document">(nativeDb, nativeTable);
expectType<Promise<ResolverData<TestSchema, "Document"> | null>>(nativeResolver({ type: "Document", id: "d1" }));

interface CountSchema extends TestSchema {
  resourceAttributeMap: { Document: { status: string; ownerId: string; count: number }; Organization: { plan: string } };
}
const wrongCountTable = sqliteTable("WrongCountDocument", { id: text("id").primaryKey(), count: text("count") });
const countTable = sqliteTable("CountDocument", { id: text("id").primaryKey(), count: integer("count") });
expectError(createDrizzleResolver<CountSchema, "Document">(nativeDb, wrongCountTable));
const countResolver = createDrizzleResolver<CountSchema, "Document">(nativeDb, countTable);
expectType<Promise<ResolverData<CountSchema, "Document"> | null>>(countResolver({ type: "Document", id: "d1" }));
expectNotAssignable<Promise<{ count: number }>>(countResolver({ type: "Document", id: "d1" }));
