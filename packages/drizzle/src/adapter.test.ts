import { describe, it, expect, vi } from "vitest";
import { createDrizzleAdapter, createDrizzleResolver } from "./index.js";

/**
 * Mock table object that simulates a Drizzle table with columns.
 * Each column is a symbol-like object used as a reference.
 */
function mockTable(name: string, columns: string[]) {
  const table: Record<string, unknown> = {
    _: { name },
  };
  for (const col of columns) {
    table[col] = { name: col, table: name };
  }
  return table;
}

describe("DrizzleConstraintAdapter", () => {
  const tasksTable = mockTable("tasks", ["id", "status", "priority", "name", "tags", "deletedAt", "projectId"]);
  const adapter = createDrizzleAdapter(tasksTable);

  it("translates field_eq", () => {
    const result = adapter.translate({ type: "field_eq", field: "status", value: "active" });
    expect(result).toEqual({ _op: "eq", field: "status", value: "active", table: tasksTable });
  });

  it("translates field_neq", () => {
    const result = adapter.translate({ type: "field_neq", field: "status", value: "archived" });
    expect(result).toEqual({ _op: "ne", field: "status", value: "archived", table: tasksTable });
  });

  it("translates field_gt", () => {
    const result = adapter.translate({ type: "field_gt", field: "priority", value: 5 });
    expect(result).toEqual({ _op: "gt", field: "priority", value: 5, table: tasksTable });
  });

  it("translates field_gte", () => {
    const result = adapter.translate({ type: "field_gte", field: "priority", value: 3 });
    expect(result).toEqual({ _op: "gte", field: "priority", value: 3, table: tasksTable });
  });

  it("translates field_lt", () => {
    const result = adapter.translate({ type: "field_lt", field: "priority", value: 10 });
    expect(result).toEqual({ _op: "lt", field: "priority", value: 10, table: tasksTable });
  });

  it("translates field_lte", () => {
    const result = adapter.translate({ type: "field_lte", field: "priority", value: 8 });
    expect(result).toEqual({ _op: "lte", field: "priority", value: 8, table: tasksTable });
  });

  it("translates field_in", () => {
    const result = adapter.translate({ type: "field_in", field: "status", values: ["a", "b"] });
    expect(result).toEqual({ _op: "inArray", field: "status", values: ["a", "b"], table: tasksTable });
  });

  it("translates field_nin", () => {
    const result = adapter.translate({ type: "field_nin", field: "status", values: ["x"] });
    expect(result).toEqual({ _op: "notInArray", field: "status", values: ["x"], table: tasksTable });
  });

  it("translates field_exists true", () => {
    const result = adapter.translate({ type: "field_exists", field: "deletedAt", exists: true });
    expect(result).toEqual({ _op: "isNotNull", field: "deletedAt", table: tasksTable });
  });

  it("translates field_exists false", () => {
    const result = adapter.translate({ type: "field_exists", field: "deletedAt", exists: false });
    expect(result).toEqual({ _op: "isNull", field: "deletedAt", table: tasksTable });
  });

  it("translates field_includes", () => {
    const result = adapter.translate({ type: "field_includes", field: "tags", value: "urgent" });
    expect(result).toEqual({ _op: "arrayContains", field: "tags", value: "urgent", table: tasksTable });
  });

  it("translates field_contains", () => {
    const result = adapter.translate({ type: "field_contains", field: "name", value: "test" });
    expect(result).toEqual({ _op: "like", field: "name", pattern: "%test%", table: tasksTable });
  });

  it("escapes LIKE metacharacters in field_contains value", () => {
    const result = adapter.translate({ type: "field_contains", field: "name", value: "100%" });
    expect(result).toEqual({ _op: "like", field: "name", pattern: "%100\\%%", table: tasksTable });
  });

  it("escapes underscore in field_contains value", () => {
    const result = adapter.translate({ type: "field_contains", field: "name", value: "foo_bar" });
    expect(result).toEqual({ _op: "like", field: "name", pattern: "%foo\\_bar%", table: tasksTable });
  });

  it("escapes backslash in field_contains value", () => {
    const result = adapter.translate({ type: "field_contains", field: "name", value: "a\\b" });
    expect(result).toEqual({ _op: "like", field: "name", pattern: "%a\\\\b%", table: tasksTable });
  });

  it("translates relation", () => {
    const childQuery = { _op: "eq", field: "status", value: "active" };
    const result = adapter.relation("project", "Project", childQuery);
    expect(result).toEqual({ _op: "relation", field: "project", resourceType: "Project", child: childQuery });
  });

  it("translates has_role", () => {
    const result = adapter.hasRole("user-1", "User", "admin");
    expect(result).toEqual({ _op: "hasRole", actorId: "user-1", actorType: "User", role: "admin" });
  });

  it("translates unknown as true literal", () => {
    const result = adapter.unknown("customCheck");
    expect(result).toEqual({ _op: "literal", value: true });
  });

  it("translates and", () => {
    const a = { _op: "eq", field: "a", value: 1 };
    const b = { _op: "eq", field: "b", value: 2 };
    expect(adapter.and([a, b])).toEqual({ _op: "and", children: [a, b] });
  });

  it("translates or", () => {
    const a = { _op: "eq", field: "a", value: 1 };
    const b = { _op: "eq", field: "b", value: 2 };
    expect(adapter.or([a, b])).toEqual({ _op: "or", children: [a, b] });
  });

  it("translates not", () => {
    const a = { _op: "eq", field: "a", value: 1 };
    expect(adapter.not(a)).toEqual({ _op: "not", child: a });
  });

  describe("createDrizzleResolver", () => {
    it("returns attributes from a Drizzle select query", async () => {
      const mockRow = { id: "doc-1", title: "Hello", owner_id: "u1" };
      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([mockRow]),
          }),
        }),
      };
      const mockTable = { id: { name: "id" } };

      const resolver = createDrizzleResolver(mockDb, mockTable);
      const result = await resolver({ type: "Document", id: "doc-1" });

      expect(result).toEqual(mockRow);
      expect(mockDb.select).toHaveBeenCalled();
    });

    it("returns empty object when row is not found", async () => {
      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      };
      const mockTable = { id: { name: "id" } };

      const resolver = createDrizzleResolver(mockDb, mockTable);
      const result = await resolver({ type: "Document", id: "nonexistent" });

      expect(result).toEqual({});
    });

    it("uses custom idColumn when specified", async () => {
      const mockRow = { uuid: "doc-1", title: "Hello" };
      const whereFn = vi.fn().mockResolvedValue([mockRow]);
      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: whereFn,
          }),
        }),
      };
      const mockTable = { uuid: { name: "uuid" } };

      const resolver = createDrizzleResolver(mockDb, mockTable, { idColumn: "uuid" });
      const result = await resolver({ type: "Document", id: "doc-1" });

      expect(result).toEqual(mockRow);
    });
  });

  describe("with custom options", () => {
    it("uses relation configuration", () => {
      const projectsTable = mockTable("projects", ["id", "status"]);
      const customAdapter = createDrizzleAdapter(tasksTable, {
        relations: {
          project: { table: projectsTable, foreignKey: "projectId" },
        },
      });
      const result = customAdapter.relation("project", "Project", { _op: "eq" });
      expect(result).toEqual({
        _op: "relation",
        field: "project",
        resourceType: "Project",
        child: { _op: "eq" },
        relatedTable: projectsTable,
        foreignKey: "projectId",
      });
    });

    it("uses custom role assignments config", () => {
      const membershipsTable = mockTable("memberships", ["memberId", "memberRole"]);
      const customAdapter = createDrizzleAdapter(tasksTable, {
        roleAssignments: {
          table: membershipsTable,
          userIdColumn: "memberId",
          roleColumn: "memberRole",
        },
      });
      const result = customAdapter.hasRole("u1", "User", "editor");
      expect(result).toEqual({
        _op: "hasRole",
        actorId: "u1",
        actorType: "User",
        role: "editor",
        roleTable: membershipsTable,
        userIdColumn: "memberId",
        roleColumn: "memberRole",
      });
    });
  });
});
