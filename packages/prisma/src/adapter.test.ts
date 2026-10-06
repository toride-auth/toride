import { describe, it, expect, vi } from "vitest";
import { UnsupportedConstraintError } from "toride";
import type { ConstraintContext } from "toride";
import { createPrismaAdapter, createPrismaResolver } from "./index.js";

const document: ConstraintContext = { resourceType: "Document" };
const fields = {
  Document: {
    status: { field: "status", type: "string", nullable: false, stringComparison: "binary" },
    priority: { field: "priority", type: "number", nullable: false },
    deletedAt: { field: "deletedAt", type: "number", nullable: true },
    name: { field: "name", type: "string", nullable: false, stringComparison: "binary", stringFilters: "javascript" },
  },
} as const;

const virtualFields = {
  Document: {
    viewer_ids: { relation: "roleAssignments", matchField: "userId", cardinality: "many", valueType: "string", stringComparison: "binary" },
  },
} as const;

describe("PrismaConstraintAdapter", () => {
  const adapter = createPrismaAdapter({ fields, virtualFields });

  it.each([
    [{ type: "field_eq", field: "status", value: "active" }, { status: "active" }],
    [{ type: "field_neq", field: "status", value: "archived" }, { status: { not: "archived" } }],
    [{ type: "field_gt", field: "priority", value: 5 }, { priority: { gt: 5 } }],
    [{ type: "field_gte", field: "priority", value: 3 }, { priority: { gte: 3 } }],
    [{ type: "field_lt", field: "priority", value: 10 }, { priority: { lt: 10 } }],
    [{ type: "field_lte", field: "priority", value: 8 }, { priority: { lte: 8 } }],
    [{ type: "field_in", field: "status", values: ["a", "b"] }, { status: { in: ["a", "b"] } }],
    [{ type: "field_nin", field: "status", values: ["x"] }, { status: { notIn: ["x"] } }],
    [{ type: "field_exists", field: "deletedAt", exists: true }, { deletedAt: { not: null } }],
    [{ type: "field_exists", field: "deletedAt", exists: false }, { deletedAt: null }],
    [{ type: "field_exists", field: "priority", exists: true }, {}],
    [{ type: "field_exists", field: "priority", exists: false }, { OR: [] }],
    [{ type: "field_in", field: "status", values: [] }, { OR: [] }],
    [{ type: "field_nin", field: "status", values: [] }, {}],
    [{ type: "field_contains", field: "name", value: "test" }, { name: { contains: "test" } }],
    [{ type: "field_starts_with", field: "name", value: "test" }, { name: { startsWith: "test" } }],
    [{ type: "field_ends_with", field: "name", value: "test" }, { name: { endsWith: "test" } }],
  ] as const)("translates %j exactly", (node, expected) => {
    expect(adapter.translate(node as Parameters<typeof adapter.translate>[0], document)).toEqual(expected);
  });

  it("keeps nullable negative comparisons false at null", () => {
    expect(adapter.translate({ type: "field_neq", field: "deletedAt", value: 3 }, document))
      .toEqual({ AND: [{ deletedAt: { not: null } }, { deletedAt: { not: 3 } }] });
    expect(adapter.translate({ type: "field_nin", field: "deletedAt", values: [] }, document))
      .toEqual({ deletedAt: { not: null } });
  });

  it("composes Boolean predicates and explicit constants", () => {
    expect(adapter.and([{ a: 1 }, { b: 2 }], document)).toEqual({ AND: [{ a: 1 }, { b: 2 }] });
    expect(adapter.or([{ a: 1 }, { b: 2 }], document)).toEqual({ OR: [{ a: 1 }, { b: 2 }] });
    expect(adapter.not({ a: 1 }, document)).toEqual({ NOT: { a: 1 } });
    expect(adapter.always(document)).toEqual({});
    expect(adapter.never(document)).toEqual({ OR: [] });
    expect(adapter.and([], document)).toEqual({});
    expect(adapter.or([], document)).toEqual({ OR: [] });
  });

  it("rejects unbound relations and fields instead of guessing storage", () => {
    expect(() => adapter.relation("project", "Project", { status: "active" }, document))
      .toThrow(UnsupportedConstraintError);
    expect(() => adapter.translate({ type: "field_includes", field: "tags", value: "urgent" }, document))
      .toThrow(UnsupportedConstraintError);
    expect(adapter.translate({ type: "field_includes", field: "viewer_ids", value: "u1" }, document))
      .toEqual({ roleAssignments: { some: { userId: "u1" } } });
  });

  it("keeps virtual membership filters conjunctive when keys collide", () => {
    const filtered = createPrismaAdapter({
      virtualFields: {
        Document: {
          viewer_ids: { ...virtualFields.Document.viewer_ids, filter: { userId: "other", role: "viewer" } },
        },
      },
    });
    expect(filtered.translate({ type: "field_includes", field: "viewer_ids", value: "u1" }, document))
      .toEqual({ roleAssignments: { some: { AND: [{ userId: "u1" }, { userId: "other", role: "viewer" }] } } });
  });

  it.each(["a%b", "a_b", "a\\b"])("rejects SQL pattern metacharacters in %s", value => {
    expect(() => adapter.translate({ type: "field_contains", field: "name", value }, document))
      .toThrow(UnsupportedConstraintError);
    expect(adapter.translate({ type: "field_eq", field: "name", value }, document)).toEqual({ name: value });
  });

  it("rejects incompatible scalar values and unproven string ordering", () => {
    expect(() => adapter.translate({ type: "field_eq", field: "priority", value: "5" }, document))
      .toThrow(UnsupportedConstraintError);
    expect(() => adapter.translate({ type: "field_gt", field: "name", value: "a" }, document))
      .toThrow(UnsupportedConstraintError);
    expect(() => adapter.translate({ type: "field_eq", field: "priority", value: Infinity }, document))
      .toThrow(UnsupportedConstraintError);
    expect(() => adapter.translate({ type: "field_eq", field: "name", value: "\ud800" }, document))
      .toThrow(UnsupportedConstraintError);
    expect(adapter.translate({ type: "field_eq", field: "priority", value: 5 }, document)).toEqual({ priority: 5 });
  });
});

describe("createPrismaResolver", () => {
  it("returns attributes from a Prisma findUnique query", async () => {
    const row = { id: "doc-1", title: "Hello", owner_id: "u1" };
    const client = { document: { findUnique: vi.fn().mockResolvedValue(row) } };
    const resolver = createPrismaResolver(client, "document");
    expect(await resolver({ type: "Document", id: "doc-1" })).toEqual(row);
    expect(client.document.findUnique).toHaveBeenCalledWith({ where: { id: "doc-1" } });
  });

  it("preserves missing rows and the actual partial selection", async () => {
    const client = {
      document: { findUnique: vi.fn().mockResolvedValueOnce({ title: "Hello" }).mockResolvedValueOnce(null) },
    };
    const resolver = createPrismaResolver(client, "document", { select: { title: true } });
    expect(await resolver({ type: "Document", id: "doc-1" })).toEqual({ title: "Hello" });
    expect(await resolver({ type: "Document", id: "missing" })).toBeNull();
    expect(client.document.findUnique).toHaveBeenCalledWith({ where: { id: "doc-1" }, select: { title: true } });
  });
});
