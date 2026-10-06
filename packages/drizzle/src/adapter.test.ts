import { describe, expect, it, vi } from "vitest";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { UnsupportedConstraintError } from "toride";
import type { LeafConstraint } from "toride";
import { createDrizzleAdapter, createDrizzleResolver } from "./index.js";

const tasks = sqliteTable("Task", {
  id: text("id").primaryKey(), status: text("status"), priority: integer("priority"),
  name: text("name"), tags: text("tags", { mode: "json" }).$type<string[]>(),
  deletedAt: text("deletedAt"), projectId: text("projectId"),
});
const projects = sqliteTable("Project", { id: text("id").primaryKey(), status: text("status"), name: text("name") });
const context = { resourceType: "Task" };
const projectContext = { resourceType: "Project" };
const options = {
  resourceType: "Task", resources: { Project: projects },
  relations: { Task: { project: { resourceType: "Project", cardinality: "one" as const, sourceColumn: "projectId", targetColumn: "id" } } },
};

function comparison(op: string, field: string, payload: Record<string, unknown>) {
  return { _op: op, field, ...payload, table: tasks, resourceType: "Task", nullable: true, nullBehavior: "false", ...(field === "status" || field === "name" ? { stringComparison: "binary" } : {}) };
}

describe("DrizzleConstraintAdapter", () => {
  const adapter = createDrizzleAdapter(tasks, options);

  it.each([
    ["field_eq", "eq", "status", "active"], ["field_neq", "ne", "status", "archived"],
    ["field_gt", "gt", "priority", 5], ["field_gte", "gte", "priority", 3],
    ["field_lt", "lt", "priority", 10], ["field_lte", "lte", "priority", 8],
  ] as const)("translates %s with total comparison semantics", (type, op, field, value) => {
    expect(adapter.translate({ type, field, value }, context)).toEqual(comparison(op, field, { value }));
  });

  it.each([["field_in", "inArray", ["a", "b"]], ["field_nin", "notInArray", ["x"]]] as const)("translates %s", (type, op, values) => {
    expect(adapter.translate({ type, field: "status", values: [...values] }, context)).toEqual(comparison(op, "status", { values }));
  });

  it.each([[true, "isNotNull"], [false, "isNull"]] as const)("translates presence %s", (exists, op) => {
    expect(adapter.translate({ type: "field_exists", field: "deletedAt", exists }, context)).toEqual({
      _op: op, field: "deletedAt", table: tasks, resourceType: "Task", nullable: true, nullBehavior: "total",
    });
  });

  it("rejects JSON presence whose decoded null differs from SQL NULL", () => {
    expect(() => adapter.translate({ type: "field_exists", field: "tags", exists: true }, context)).toThrow(UnsupportedConstraintError);
    expect(adapter.translate({ type: "field_exists", field: "status", exists: true }, context)).toMatchObject({ _op: "isNotNull", field: "status", table: tasks });
  });

  it("rejects physical array membership without a proven lowering", () => {
    expect(() => adapter.translate({ type: "field_includes", field: "tags", value: "urgent" }, context)).toThrow(UnsupportedConstraintError);
    expect(adapter.translate({ type: "field_eq", field: "status", value: "active" }, context)).toEqual(comparison("eq", "status", { value: "active" }));
  });

  it.each(["test", "100%", "foo_bar", "a\\b"])("retains literal contains value %s", value => {
    expect(adapter.translate({ type: "field_contains", field: "name", value }, context)).toEqual(comparison("contains", "name", { value }));
  });

  it("translates a physically bound relation", () => {
    const child = adapter.translate({ type: "field_eq", field: "status", value: "active" }, projectContext);
    expect(adapter.relation("project", "Project", child, context)).toEqual({
      _op: "relation", field: "project", table: tasks, sourceResourceType: "Task", resourceType: "Project", child,
      relatedTable: projects, sourceColumn: "projectId", targetColumn: "id", cardinality: "one", quantifier: "any", stringComparison: "binary",
    });
  });

  it.each(["unknown", "has_role"])("rejects unsafe legacy %s descriptions", type => {
    const malformed = { type, name: "customCheck", actorId: "u1", actorType: "User", role: "admin" } as unknown as LeafConstraint;
    expect(() => adapter.translate(malformed, context)).toThrow(UnsupportedConstraintError);
    expect(adapter.always(context)).toEqual({ _op: "literal", value: true, table: tasks, resourceType: "Task" });
  });

  it.each(["and", "or"] as const)("translates %s", op => {
    const children = [adapter.always(context), adapter.never(context)];
    expect(adapter[op](children, context)).toEqual({ _op: op, children, table: tasks, resourceType: "Task" });
  });

  it("complements a total child predicate", () => {
    const child = adapter.translate({ type: "field_eq", field: "priority", value: 1 }, context);
    expect(adapter.not(child, context)).toEqual({ _op: "not", child, table: tasks, resourceType: "Task" });
  });

  describe("createDrizzleResolver", () => {
    it("returns attributes from a native-column query", async () => {
      const row = { id: "doc-1", status: "active" };
      const db = { select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([row]) }) }) };
      await expect(createDrizzleResolver(db, tasks)({ type: "Task", id: "doc-1" })).resolves.toEqual(row);
    });

    it("returns null when a row is not found", async () => {
      const db = { select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) }) };
      await expect(createDrizzleResolver(db, tasks)({ type: "Task", id: "missing" })).resolves.toBeNull();
    });

    it("uses a custom physical ID column", async () => {
      const table = sqliteTable("UuidDocument", { uuid: text("uuid").primaryKey() });
      const db = { select: vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ uuid: "doc-1" }]) }) }) };
      await expect(createDrizzleResolver(db, table, { idColumn: "uuid" })({ type: "Document", id: "doc-1" })).resolves.toEqual({ uuid: "doc-1" });
    });
  });

  describe("scoped virtual fields", () => {
    it("translates membership with all filters inside one related row", () => {
      const virtualAdapter = createDrizzleAdapter(tasks, {
        ...options, virtualFields: { Task: { projectTags: { relation: "project", matchField: "name", filter: { status: "active" } } } },
      });
      const query = virtualAdapter.translate({ type: "field_includes", field: "projectTags", value: "urgent" }, context);
      expect(query).toMatchObject({
        _op: "relation", field: "project", relatedTable: projects, resourceType: "Project",
        child: { _op: "and", resourceType: "Project", children: [
          { _op: "eq", field: "name", value: "urgent", table: projects },
          { _op: "eq", field: "status", value: "active", table: projects },
        ] },
      });
    });

    it("rejects non-virtual physical array membership", () => {
      const virtualAdapter = createDrizzleAdapter(tasks, {
        ...options, virtualFields: { Task: { projectTags: { relation: "project", matchField: "name" } } },
      });
      expect(() => virtualAdapter.translate({ type: "field_includes", field: "tags", value: "urgent" }, context)).toThrow(UnsupportedConstraintError);
      expect(virtualAdapter.translate({ type: "field_includes", field: "projectTags", value: "urgent" }, context)).toMatchObject({ _op: "relation", child: { _op: "eq", field: "name", value: "urgent" } });
    });

    it("translates virtual membership without a filter", () => {
      const virtualAdapter = createDrizzleAdapter(tasks, {
        ...options, virtualFields: { Task: { projectTags: { relation: "project", matchField: "name" } } },
      });
      expect(virtualAdapter.translate({ type: "field_includes", field: "projectTags", value: "urgent" }, context)).toMatchObject({
        _op: "relation", field: "project", child: { _op: "eq", field: "name", value: "urgent", table: projects },
      });
    });
  });
});
