import { expectAssignable, expectError, expectType } from "tsd";
import type { ConstraintAdapter, DefaultSchema } from "toride";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createDrizzleAdapter } from "../../dist/index.js";
import type { DrizzleQuery } from "../../dist/index.js";

interface TestSchema extends DefaultSchema {
  resources: "Document" | "Organization";
  actorTypes: "User";
  resourceAttributeMap: {
    Document: { status: string; labels: string[] };
    Organization: { plan: string; labels: string[] };
  };
  relationMap: { Document: { org: "Organization" }; Organization: {} };
}

type DocumentQuery = DrizzleQuery & { resourceType: "Document" };
type OrganizationQuery = DrizzleQuery & { resourceType: "Organization" };
type TestQueryMap = { Document: DocumentQuery; Organization: OrganizationQuery };
const documents = sqliteTable("Document", { id: text("id").primaryKey() });

const typedAdapter = createDrizzleAdapter<TestSchema, never, TestQueryMap>(documents, { resourceType: "Document" });
expectType<ConstraintAdapter<TestQueryMap>>(typedAdapter);

const untypedAdapter = createDrizzleAdapter(documents, { resourceType: "Document" });
expectType<ConstraintAdapter<Record<string, DrizzleQuery>>>(untypedAdapter);
expectAssignable<ConstraintAdapter<Record<string, DrizzleQuery>>>(untypedAdapter);

const typedAdapterWithOpts = createDrizzleAdapter<TestSchema, never, TestQueryMap>(documents, {
  resourceType: "Document", relations: {},
  virtualFields: {
    Document: { labels: { relation: "org", matchField: "plan" } },
    Organization: { labels: { relation: "parent", matchField: "plan" } },
  },
});
expectType<ConstraintAdapter<TestQueryMap>>(typedAdapterWithOpts);
expectError(createDrizzleAdapter<TestSchema>(documents, { resourceType: "Other" }));
expectError(createDrizzleAdapter<TestSchema, never, { Document: number }>(documents, { resourceType: "Document" }));
expectError(createDrizzleAdapter(documents));
expectError(typedAdapter.translate({ type: "field_eq", field: "status", value: "active" }));

const users = sqliteTable("User", { userId: text("id").primaryKey() });
const actorRelationAdapter = createDrizzleAdapter<TestSchema>(documents, {
  resourceType: "Document", resources: { User: users }, fields: { User: { id: "userId" } },
  relations: { Document: { owner: { resourceType: "User", cardinality: "one", sourceColumn: "id", targetColumn: "userId" } } },
});
expectType<ConstraintAdapter<Record<string, DrizzleQuery>>>(actorRelationAdapter);
expectError(createDrizzleAdapter<TestSchema>(documents, { resourceType: "User" }));
expectError(createDrizzleAdapter<TestSchema>(documents, { resourceType: "Document", resources: { Other: users } }));
