// T079: Unit tests for snapshot()

import { describe, it, expect, beforeAll } from "vitest";
import type {
  ActorRef,
  ResourceRef,
  RelationResolver,
  Policy,
  TorideOptions,
} from "../../../src/types.js";
import type { PermissionSnapshot } from "../../../src/snapshot.js";

describe("snapshot()", () => {
  let Toride: new (options: TorideOptions) => {
    snapshot: (
      actor: ActorRef,
      resources: ResourceRef[],
    ) => Promise<PermissionSnapshot>;
    permittedActions: (
      actor: ActorRef,
      resource: ResourceRef,
    ) => Promise<string[]>;
  };
  let loadYaml: (input: string) => Promise<Policy>;

  beforeAll(async () => {
    const engineMod = await import("../../../src/engine.js");
    Toride = engineMod.Toride as typeof Toride;
    const parserMod = await import("../../../src/policy/parser.js");
    loadYaml = parserMod.loadYaml;
  });

  const POLICY_YAML = `
version: "1"
actors:
  User:
    attributes:
      department: string
resources:
  Document:
    roles: [viewer, editor, admin]
    permissions: [read, update, delete]
    grants:
      viewer: [read]
      editor: [read, update]
      admin: [all]
  Project:
    roles: [member, owner]
    permissions: [view, edit, archive]
    grants:
      member: [view]
      owner: [all]
`;

  function makeResolver(config: {
    roles?: Record<string, string[]>;
  }): RelationResolver {
    return {
      getRoles: async (actor: ActorRef, resource: ResourceRef) => {
        const key = `${actor.id}:${resource.type}:${resource.id}`;
        return config.roles?.[key] ?? [];
      },
      getRelated: async () => [],
      getAttributes: async () => ({}),
    };
  }

  it("returns PermissionSnapshot with correct keys (Type:id format)", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolver = makeResolver({ roles: { "u1:Document:doc1": ["viewer"] } });
    const engine = new Toride({ policy, resolver });
    const actor: ActorRef = { type: "User", id: "u1", attributes: {} };

    const snap = await engine.snapshot(actor, [
      { type: "Document", id: "doc1" },
    ]);

    expect(snap).toHaveProperty("Document:doc1");
    expect(snap["Document:doc1"]).toEqual(["read"]);
  });

  it("returns correct actions for multiple resources", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolver = makeResolver({
      roles: {
        "u1:Document:doc1": ["editor"],
        "u1:Project:p1": ["owner"],
      },
    });
    const engine = new Toride({ policy, resolver });
    const actor: ActorRef = { type: "User", id: "u1", attributes: {} };

    const snap = await engine.snapshot(actor, [
      { type: "Document", id: "doc1" },
      { type: "Project", id: "p1" },
    ]);

    expect(snap["Document:doc1"]).toEqual(
      expect.arrayContaining(["read", "update"]),
    );
    expect(snap["Project:p1"]).toEqual(
      expect.arrayContaining(["view", "edit", "archive"]),
    );
  });

  it("returns empty array for resources with no permissions", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolver = makeResolver({});
    const engine = new Toride({ policy, resolver });
    const actor: ActorRef = { type: "User", id: "u1", attributes: {} };

    const snap = await engine.snapshot(actor, [
      { type: "Document", id: "doc1" },
    ]);

    expect(snap["Document:doc1"]).toEqual([]);
  });

  it("returns empty snapshot for empty resource list", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolver = makeResolver({});
    const engine = new Toride({ policy, resolver });
    const actor: ActorRef = { type: "User", id: "u1", attributes: {} };

    const snap = await engine.snapshot(actor, []);

    expect(snap).toEqual({});
  });

  it("returns empty array for unknown resource types", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolver = makeResolver({});
    const engine = new Toride({ policy, resolver });
    const actor: ActorRef = { type: "User", id: "u1", attributes: {} };

    const snap = await engine.snapshot(actor, [
      { type: "Unknown", id: "x1" },
    ]);

    expect(snap["Unknown:x1"]).toEqual([]);
  });

  it("handles mixed known and unknown resource types", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolver = makeResolver({
      roles: { "u1:Document:doc1": ["viewer"] },
    });
    const engine = new Toride({ policy, resolver });
    const actor: ActorRef = { type: "User", id: "u1", attributes: {} };

    const snap = await engine.snapshot(actor, [
      { type: "Document", id: "doc1" },
      { type: "Nonexistent", id: "n1" },
    ]);

    expect(snap["Document:doc1"]).toEqual(["read"]);
    expect(snap["Nonexistent:n1"]).toEqual([]);
  });
});
