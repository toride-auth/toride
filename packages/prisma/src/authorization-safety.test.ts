import { describe, expect, it } from "vitest";
import { Toride, UnsupportedConstraintError } from "toride";
import { createPrismaAdapter, createPrismaResolver } from "./index.js";

const document = { resourceType: "Document" };
const project = { resourceType: "Project" };

const options = {
  fields: {
    Document: {
      status: { field: "status", type: "string", nullable: true, stringComparison: "binary" },
      priority: { field: "priority", type: "number", nullable: false },
    },
  },
  relations: {
    Document: {
      project: { field: "project", resourceType: "Project", cardinality: "one" },
      members: { field: "members", resourceType: "User", cardinality: "many" },
    },
  },
} as const;

describe("Prisma exact translation boundary", () => {
  it("requires an explicit scalar binding beside a mapped positive control", () => {
    const adapter = createPrismaAdapter(options);
    expect(adapter.translate({ type: "field_gt", field: "priority", value: 5 }, document))
      .toEqual({ priority: { gt: 5 } });
    expect(() => adapter.translate({ type: "field_eq", field: "secret", value: true }, document))
      .toThrow(/unmapped|binding/i);
  });

  it("guards nullable equality so its complement includes known absence", () => {
    const adapter = createPrismaAdapter(options);
    expect(adapter.translate({ type: "field_eq", field: "status", value: "blocked" }, document))
      .toEqual({ AND: [{ status: { not: null } }, { status: "blocked" }] });
  });

  it("uses declared physical relation cardinality", () => {
    const adapter = createPrismaAdapter(options);
    expect(adapter.relation("project", "Project", { public: true }, document))
      .toEqual({ project: { is: { public: true } } });
    expect(adapter.relation("members", "User", { id: "u1" }, document))
      .toEqual({ members: { some: { id: "u1" } } });
    expect(() => adapter.relation("project", "User", { id: "u1" }, document))
      .toThrow(/target|resource/i);
  });

  it("keeps equal virtual names scoped to their current resources", () => {
    const adapter = createPrismaAdapter({
      virtualFields: {
        Document: { viewer_ids: { relation: "documentMembers", matchField: "userId", cardinality: "many", valueType: "string", stringComparison: "binary" } },
        Project: { viewer_ids: { relation: "projectMembers", matchField: "userId", cardinality: "many", valueType: "string", stringComparison: "binary" } },
      },
    });
    expect(adapter.translate({ type: "field_includes", field: "viewer_ids", value: "u1" }, document))
      .toEqual({ documentMembers: { some: { userId: "u1" } } });
    expect(adapter.translate({ type: "field_includes", field: "viewer_ids", value: "u1" }, project))
      .toEqual({ projectMembers: { some: { userId: "u1" } } });
  });

  it("preserves Boolean constants under composition", () => {
    const adapter = createPrismaAdapter(options);
    const yes = adapter.always(document);
    const no = adapter.never(document);
    expect(adapter.not(yes, document)).toEqual({ OR: [] });
    expect(adapter.not(no, document)).toEqual({});
    expect(adapter.not(adapter.not(yes, document), document)).toEqual({});
    expect(adapter.not(adapter.not(no, document), document)).toEqual({ OR: [] });
    expect(adapter.or([yes, no], document)).toEqual({});
    expect(adapter.and([yes, no], document)).toEqual({ OR: [] });
  });

  it("rejects uncertified string matching", () => {
    const adapter = createPrismaAdapter(options);
    expect(() => adapter.translate({ type: "field_contains", field: "status", value: "blocked" }, document))
      .toThrow(/string|semantics|unsupported/i);
  });
  it("rejects legacy unknown and role-storage nodes through the public pipeline", () => {
    const engine = new Toride({ policy: {
      version: "1", actors: { User: { attributes: {} } },
      resources: { Document: { roles: [], permissions: ["read"] } },
    } });
    const adapter = createPrismaAdapter(options);
    expect(engine.translateConstraints({ type: "field_gt", field: "priority", value: 5, rootResourceType: "Document" }, adapter))
      .toEqual({ priority: { gt: 5 } });
    expect(() => engine.translateConstraints({ type: "unknown", name: "custom", rootResourceType: "Document" }, adapter))
      .toThrow(UnsupportedConstraintError);
    expect(() => engine.translateConstraints({ type: "has_role", actorId: "u1", actorType: "OtherActor", role: "viewer", rootResourceType: "Document" }, adapter))
      .toThrow(UnsupportedConstraintError);
  });

});

describe("Prisma resolver absence", () => {
  it("returns the actual selected row or null", async () => {
    const resolver = createPrismaResolver({
      document: {
        findUnique: async ({ where }: { where: { id: string } }) =>
          where.id === "found" ? { status: "draft" } : null,
      },
    }, "document", { select: { status: true } });
    expect(await resolver({ type: "Document", id: "found" })).toEqual({ status: "draft" });
    expect(await resolver({ type: "Document", id: "missing" })).toBeNull();
  });
});
