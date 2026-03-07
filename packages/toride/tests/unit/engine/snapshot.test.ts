// T079: Unit tests for snapshot()
// Updated for Resolvers map / AttributeCache (Phase 3)

import { describe, it, expect, beforeAll } from "vitest";
import type {
  ActorRef,
  ResourceRef,
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

  // Uses derived_roles to assign roles from actor attributes
  const POLICY_YAML = `
version: "1"
actors:
  User:
    attributes:
      department: string
      is_viewer: boolean
      is_editor: boolean
      is_admin: boolean
      is_member: boolean
      is_owner: boolean
resources:
  Document:
    roles: [viewer, editor, admin]
    permissions: [read, update, delete]
    grants:
      viewer: [read]
      editor: [read, update]
      admin: [all]
    derived_roles:
      - role: viewer
        when:
          "$actor.is_viewer": true
      - role: editor
        when:
          "$actor.is_editor": true
      - role: admin
        when:
          "$actor.is_admin": true
  Project:
    roles: [member, owner]
    permissions: [view, edit, archive]
    grants:
      member: [view]
      owner: [all]
    derived_roles:
      - role: member
        when:
          "$actor.is_member": true
      - role: owner
        when:
          "$actor.is_owner": true
`;

  it("returns PermissionSnapshot with correct keys (Type:id format)", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const engine = new Toride({ policy });
    const actor: ActorRef = { type: "User", id: "u1", attributes: { is_viewer: true } };

    const snap = await engine.snapshot(actor, [
      { type: "Document", id: "doc1" },
    ]);

    expect(snap).toHaveProperty("Document:doc1");
    expect(snap["Document:doc1"]).toEqual(["read"]);
  });

  it("returns correct actions for multiple resources", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const engine = new Toride({ policy });
    const actor: ActorRef = { type: "User", id: "u1", attributes: { is_editor: true, is_owner: true } };

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
    const engine = new Toride({ policy });
    const actor: ActorRef = { type: "User", id: "u1", attributes: {} };

    const snap = await engine.snapshot(actor, [
      { type: "Document", id: "doc1" },
    ]);

    expect(snap["Document:doc1"]).toEqual([]);
  });

  it("returns empty snapshot for empty resource list", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const engine = new Toride({ policy });
    const actor: ActorRef = { type: "User", id: "u1", attributes: {} };

    const snap = await engine.snapshot(actor, []);

    expect(snap).toEqual({});
  });

  it("returns empty array for unknown resource types", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const engine = new Toride({ policy });
    const actor: ActorRef = { type: "User", id: "u1", attributes: {} };

    const snap = await engine.snapshot(actor, [
      { type: "Unknown", id: "x1" },
    ]);

    expect(snap["Unknown:x1"]).toEqual([]);
  });

  it("handles mixed known and unknown resource types", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const engine = new Toride({ policy });
    const actor: ActorRef = { type: "User", id: "u1", attributes: { is_viewer: true } };

    const snap = await engine.snapshot(actor, [
      { type: "Document", id: "doc1" },
      { type: "Nonexistent", id: "n1" },
    ]);

    expect(snap["Document:doc1"]).toEqual(["read"]);
    expect(snap["Nonexistent:n1"]).toEqual([]);
  });
});
