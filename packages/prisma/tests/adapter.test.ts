import { describe, it, expect, vi } from "vitest";
import { createPrismaAdapter, createPrismaResolver } from "../src/index.js";

describe("PrismaConstraintAdapter", () => {
  describe("createPrismaAdapter with defaults", () => {
    const adapter = createPrismaAdapter();

    it("translates field_eq", () => {
      expect(adapter.translate({ type: "field_eq", field: "status", value: "active" }))
        .toEqual({ status: "active" });
    });

    it("translates field_neq", () => {
      expect(adapter.translate({ type: "field_neq", field: "status", value: "archived" }))
        .toEqual({ status: { not: "archived" } });
    });

    it("translates field_gt", () => {
      expect(adapter.translate({ type: "field_gt", field: "priority", value: 5 }))
        .toEqual({ priority: { gt: 5 } });
    });

    it("translates field_gte", () => {
      expect(adapter.translate({ type: "field_gte", field: "priority", value: 3 }))
        .toEqual({ priority: { gte: 3 } });
    });

    it("translates field_lt", () => {
      expect(adapter.translate({ type: "field_lt", field: "priority", value: 10 }))
        .toEqual({ priority: { lt: 10 } });
    });

    it("translates field_lte", () => {
      expect(adapter.translate({ type: "field_lte", field: "priority", value: 8 }))
        .toEqual({ priority: { lte: 8 } });
    });

    it("translates field_in", () => {
      expect(adapter.translate({ type: "field_in", field: "status", values: ["a", "b"] }))
        .toEqual({ status: { in: ["a", "b"] } });
    });

    it("translates field_nin", () => {
      expect(adapter.translate({ type: "field_nin", field: "status", values: ["x"] }))
        .toEqual({ status: { notIn: ["x"] } });
    });

    it("translates field_exists true", () => {
      expect(adapter.translate({ type: "field_exists", field: "deletedAt", exists: true }))
        .toEqual({ deletedAt: { not: null } });
    });

    it("translates field_exists false", () => {
      expect(adapter.translate({ type: "field_exists", field: "deletedAt", exists: false }))
        .toEqual({ deletedAt: null });
    });

    it("translates field_includes", () => {
      expect(adapter.translate({ type: "field_includes", field: "tags", value: "urgent" }))
        .toEqual({ tags: { has: "urgent" } });
    });

    it("translates field_contains", () => {
      expect(adapter.translate({ type: "field_contains", field: "name", value: "test" }))
        .toEqual({ name: { contains: "test" } });
    });

    it("translates relation", () => {
      const childQuery = { status: "active" };
      expect(adapter.relation("project", "Project", childQuery))
        .toEqual({ project: childQuery });
    });

    it("translates has_role with default table and fields", () => {
      expect(adapter.hasRole("user-1", "User", "admin"))
        .toEqual({ roleAssignments: { some: { userId: "user-1", role: "admin" } } });
    });

    it("translates unknown as no-op", () => {
      expect(adapter.unknown("customCheck")).toEqual({});
    });

    it("translates and", () => {
      expect(adapter.and([{ a: 1 }, { b: 2 }]))
        .toEqual({ AND: [{ a: 1 }, { b: 2 }] });
    });

    it("translates or", () => {
      expect(adapter.or([{ a: 1 }, { b: 2 }]))
        .toEqual({ OR: [{ a: 1 }, { b: 2 }] });
    });

    it("translates not", () => {
      expect(adapter.not({ a: 1 }))
        .toEqual({ NOT: { a: 1 } });
    });
  });

  describe("createPrismaResolver", () => {
    it("returns attributes from a Prisma findUnique query", async () => {
      const mockRow = { id: "doc-1", title: "Hello", owner_id: "u1" };
      const mockClient = {
        document: {
          findUnique: vi.fn().mockResolvedValue(mockRow),
        },
      };

      const resolver = createPrismaResolver(mockClient, "document");
      const result = await resolver({ type: "Document", id: "doc-1" });

      expect(result).toEqual(mockRow);
      expect(mockClient.document.findUnique).toHaveBeenCalledWith({
        where: { id: "doc-1" },
      });
    });

    it("returns empty object when record is not found", async () => {
      const mockClient = {
        document: {
          findUnique: vi.fn().mockResolvedValue(null),
        },
      };

      const resolver = createPrismaResolver(mockClient, "document");
      const result = await resolver({ type: "Document", id: "nonexistent" });

      expect(result).toEqual({});
    });

    it("passes select option to Prisma findUnique", async () => {
      const mockRow = { id: "doc-1", title: "Hello" };
      const mockClient = {
        document: {
          findUnique: vi.fn().mockResolvedValue(mockRow),
        },
      };

      const resolver = createPrismaResolver(mockClient, "document", {
        select: { id: true, title: true },
      });
      const result = await resolver({ type: "Document", id: "doc-1" });

      expect(result).toEqual(mockRow);
      expect(mockClient.document.findUnique).toHaveBeenCalledWith({
        where: { id: "doc-1" },
        select: { id: true, title: true },
      });
    });
  });

  describe("createPrismaAdapter with custom options", () => {
    it("uses custom relation mapping", () => {
      const adapter = createPrismaAdapter({
        relationMapping: { projectId: "project" },
      });
      expect(adapter.relation("projectId", "Project", { status: "active" }))
        .toEqual({ project: { status: "active" } });
    });

    it("uses custom role assignment table and fields", () => {
      const adapter = createPrismaAdapter({
        roleAssignmentTable: "memberships",
        roleAssignmentFields: {
          userId: "memberId",
          role: "memberRole",
        },
      });
      expect(adapter.hasRole("u1", "User", "editor"))
        .toEqual({ memberships: { some: { memberId: "u1", memberRole: "editor" } } });
    });
  });
});
