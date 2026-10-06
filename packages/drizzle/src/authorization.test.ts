import { describe, expect, it } from "vitest";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createDrizzleAdapter } from "./index.js";

const documents = sqliteTable("Document", {
  id: text("id").primaryKey(),
  status: text("status"),
  projectId: text("projectId"),
});
const projects = sqliteTable("Project", {
  id: text("id").primaryKey(),
  status: text("status"),
});
const root = { resourceType: "Document" };
const child = { resourceType: "Project" };
const options = {
  resourceType: "Document",
  resources: { Project: projects },
  relations: {
    Document: {
      project: { resourceType: "Project", cardinality: "one" as const, sourceColumn: "projectId", targetColumn: "id" },
    },
  },
};

describe("scoped Drizzle authorization descriptions", () => {
  it("binds related leaf fields to the related table", () => {
    const adapter = createDrizzleAdapter(documents, options);
    expect(adapter.translate({ type: "field_eq", field: "status", value: "public" }, child)).toMatchObject({
      _op: "eq", table: projects, resourceType: "Project", nullBehavior: "false",
    });
  });

  it("keeps exact string operations distinct", () => {
    const adapter = createDrizzleAdapter(documents, { ...options, stringComparison: "binary" });
    for (const [type, op] of [["field_contains", "contains"], ["field_starts_with", "startsWith"], ["field_ends_with", "endsWith"]] as const) {
      expect(adapter.translate({ type, field: "status", value: "A%_\\" }, root)).toMatchObject({
        _op: op, value: "A%_\\", nullBehavior: "false", stringComparison: "binary",
      });
    }
  });

  it("rejects unmapped relations and unsupported physical operations", () => {
    const adapter = createDrizzleAdapter(documents, options);
    expect(() => adapter.relation("missing", "Project", { _op: "literal", value: true }, root)).toThrow(/Unsupported/);
    expect(() => adapter.translate({ type: "field_eq", field: "missing", value: "public" }, root)).toThrow(/Unsupported/);
    expect(() => adapter.translate({ type: "field_includes", field: "status", value: "public" }, root)).toThrow(/Unsupported/);
    expect(() => adapter.translate({ type: "field_contains", field: "status", value: "public" }, root)).toThrow(/Unsupported/);
  });

  it("retains relation existence when the child is always true", () => {
    const adapter = createDrizzleAdapter(documents, options);
    expect(adapter.relation("project", "Project", adapter.always(child), root)).toMatchObject({
      _op: "relation", table: documents, relatedTable: projects, cardinality: "one", quantifier: "any",
      sourceColumn: "projectId", targetColumn: "id", child: { _op: "literal", value: true },
    });
  });

  it("allows the same virtual field name in independent resource scopes", () => {
    expect(() => createDrizzleAdapter(documents, {
      ...options,
      virtualFields: {
        Document: { labels: { relation: "project", matchField: "status" } },
        Project: { labels: { relation: "parent", matchField: "status" } },
      },
    })).not.toThrow();
    const adapter = createDrizzleAdapter(documents, {
      ...options,
      virtualFields: { Document: { labels: { relation: "project", matchField: "status" } } },
    });
    expect(adapter.translate({ type: "field_includes", field: "labels", value: "public" }, root)).toMatchObject({
      _op: "relation", resourceType: "Project", relatedTable: projects,
      child: { _op: "eq", field: "status", value: "public", table: projects, nullBehavior: "false" },
    });
  });
});
