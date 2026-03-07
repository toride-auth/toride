// T091: Unit tests for canField() and permittedFields()
// Updated for Resolvers map / AttributeCache (Phase 3)

import { describe, it, expect, beforeAll } from "vitest";
import type {
  ActorRef,
  ResourceRef,
  Policy,
  TorideOptions,
} from "../../../src/types.js";

describe("canField()", () => {
  let Toride: new (options: TorideOptions) => {
    canField: (
      actor: ActorRef,
      operation: "read" | "update",
      resource: ResourceRef,
      field: string,
    ) => Promise<boolean>;
    can: (
      actor: ActorRef,
      action: string,
      resource: ResourceRef,
    ) => Promise<boolean>;
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
      is_manager: boolean
      is_hr_admin: boolean
resources:
  Employee:
    roles: [viewer, manager, hr_admin]
    permissions: [read, update, delete]
    grants:
      viewer:   [read]
      manager:  [read, update]
      hr_admin: [all]
    derived_roles:
      - role: viewer
        when:
          "$actor.is_viewer": true
      - role: manager
        when:
          "$actor.is_manager": true
      - role: hr_admin
        when:
          "$actor.is_hr_admin": true
    field_access:
      salary:      { read: [hr_admin, manager], update: [hr_admin] }
      ssn:         { read: [hr_admin] }
      performance: { read: [manager, hr_admin], update: [manager, hr_admin] }
      name:        { read: [viewer, manager, hr_admin], update: [manager, hr_admin] }
`;

  it("grants read access to a restricted field for an authorized role", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const engine = new Toride({ policy });
    const actor: ActorRef = { type: "User", id: "u1", attributes: { is_hr_admin: true } };
    const resource: ResourceRef = { type: "Employee", id: "42" };

    expect(await engine.canField(actor, "read", resource, "salary")).toBe(true);
  });

  it("denies read access to a restricted field for an unauthorized role", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const engine = new Toride({ policy });
    const actor: ActorRef = { type: "User", id: "u1", attributes: { is_viewer: true } };
    const resource: ResourceRef = { type: "Employee", id: "42" };

    expect(await engine.canField(actor, "read", resource, "salary")).toBe(false);
  });

  it("grants update access to a restricted field for an authorized role", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const engine = new Toride({ policy });
    const actor: ActorRef = { type: "User", id: "u1", attributes: { is_hr_admin: true } };
    const resource: ResourceRef = { type: "Employee", id: "42" };

    expect(await engine.canField(actor, "update", resource, "salary")).toBe(true);
  });

  it("denies update access when role only has read access to the field", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const engine = new Toride({ policy });
    const actor: ActorRef = { type: "User", id: "u1", attributes: { is_manager: true } };
    const resource: ResourceRef = { type: "Employee", id: "42" };

    // manager can read salary but not update it
    expect(await engine.canField(actor, "read", resource, "salary")).toBe(true);
    expect(await engine.canField(actor, "update", resource, "salary")).toBe(false);
  });

  it("allows access to unlisted fields (unrestricted) if actor has resource-level permission", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const engine = new Toride({ policy });
    const actor: ActorRef = { type: "User", id: "u1", attributes: { is_viewer: true } };
    const resource: ResourceRef = { type: "Employee", id: "42" };

    // "email" is not in field_access, viewer has "read" permission
    expect(await engine.canField(actor, "read", resource, "email")).toBe(true);
  });

  it("denies access to unlisted fields if actor lacks resource-level permission", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const engine = new Toride({ policy });
    const actor: ActorRef = { type: "User", id: "u1", attributes: { is_viewer: true } };
    const resource: ResourceRef = { type: "Employee", id: "42" };

    // viewer has no "update" permission, so unlisted fields for update are denied
    expect(await engine.canField(actor, "update", resource, "email")).toBe(false);
  });

  it("denies access for unknown resource type", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const engine = new Toride({ policy });
    const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
    const resource: ResourceRef = { type: "Unknown", id: "1" };

    expect(await engine.canField(actor, "read", resource, "anything")).toBe(false);
  });

  it("denies access when actor has no roles at all", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const engine = new Toride({ policy });
    const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
    const resource: ResourceRef = { type: "Employee", id: "42" };

    expect(await engine.canField(actor, "read", resource, "salary")).toBe(false);
    expect(await engine.canField(actor, "read", resource, "email")).toBe(false);
  });

  it("handles resource with no field_access defined (all fields unrestricted)", async () => {
    const noFieldAccessYaml = `
version: "1"
actors:
  User:
    attributes:
      email: string
      is_viewer: boolean
resources:
  Task:
    roles: [viewer, editor]
    permissions: [read, update]
    grants:
      viewer: [read]
      editor: [read, update]
    derived_roles:
      - role: viewer
        when:
          "$actor.is_viewer": true
`;
    const policy = await loadYaml(noFieldAccessYaml);
    const engine = new Toride({ policy });
    const actor: ActorRef = { type: "User", id: "u1", attributes: { is_viewer: true } };
    const resource: ResourceRef = { type: "Task", id: "1" };

    // No field_access section, so all fields unrestricted, governed by resource-level permission
    expect(await engine.canField(actor, "read", resource, "title")).toBe(true);
    expect(await engine.canField(actor, "update", resource, "title")).toBe(false);
  });

  it("handles field_access entry with only read defined (no update)", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const engine = new Toride({ policy });
    const actor: ActorRef = { type: "User", id: "u1", attributes: { is_hr_admin: true } };
    const resource: ResourceRef = { type: "Employee", id: "42" };

    // ssn only has read defined; update is not in field_access for ssn
    expect(await engine.canField(actor, "read", resource, "ssn")).toBe(true);
    // hr_admin has update permission on Employee, and ssn has no update restriction
    expect(await engine.canField(actor, "update", resource, "ssn")).toBe(true);
  });
});

describe("permittedFields()", () => {
  let Toride: new (options: TorideOptions) => {
    permittedFields: (
      actor: ActorRef,
      operation: "read" | "update",
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
      is_viewer: boolean
      is_manager: boolean
      is_hr_admin: boolean
resources:
  Employee:
    roles: [viewer, manager, hr_admin]
    permissions: [read, update, delete]
    grants:
      viewer:   [read]
      manager:  [read, update]
      hr_admin: [all]
    derived_roles:
      - role: viewer
        when:
          "$actor.is_viewer": true
      - role: manager
        when:
          "$actor.is_manager": true
      - role: hr_admin
        when:
          "$actor.is_hr_admin": true
    field_access:
      salary:      { read: [hr_admin, manager], update: [hr_admin] }
      ssn:         { read: [hr_admin] }
      performance: { read: [manager, hr_admin], update: [manager, hr_admin] }
      name:        { read: [viewer, manager, hr_admin], update: [manager, hr_admin] }
`;

  it("returns all readable fields for hr_admin", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const engine = new Toride({ policy });
    const actor: ActorRef = { type: "User", id: "u1", attributes: { is_hr_admin: true } };
    const resource: ResourceRef = { type: "Employee", id: "42" };

    const fields = await engine.permittedFields(actor, "read", resource);
    expect(fields).toEqual(
      expect.arrayContaining(["salary", "ssn", "performance", "name"]),
    );
    expect(fields).toHaveLength(4);
  });

  it("returns only permitted readable fields for manager", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const engine = new Toride({ policy });
    const actor: ActorRef = { type: "User", id: "u1", attributes: { is_manager: true } };
    const resource: ResourceRef = { type: "Employee", id: "42" };

    const fields = await engine.permittedFields(actor, "read", resource);
    expect(fields).toEqual(
      expect.arrayContaining(["salary", "performance", "name"]),
    );
    expect(fields).not.toContain("ssn");
    expect(fields).toHaveLength(3);
  });

  it("returns only permitted readable fields for viewer", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const engine = new Toride({ policy });
    const actor: ActorRef = { type: "User", id: "u1", attributes: { is_viewer: true } };
    const resource: ResourceRef = { type: "Employee", id: "42" };

    const fields = await engine.permittedFields(actor, "read", resource);
    expect(fields).toEqual(["name"]);
  });

  it("returns permitted updatable fields for manager", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const engine = new Toride({ policy });
    const actor: ActorRef = { type: "User", id: "u1", attributes: { is_manager: true } };
    const resource: ResourceRef = { type: "Employee", id: "42" };

    const fields = await engine.permittedFields(actor, "update", resource);
    // manager can update: performance, name (explicitly listed)
    // ssn has no update restriction -> unrestricted, manager has update perm -> included
    // salary has update: [hr_admin] -> manager not listed -> excluded
    expect(fields).toEqual(
      expect.arrayContaining(["performance", "name", "ssn"]),
    );
    expect(fields).not.toContain("salary");
    expect(fields).toHaveLength(3);
  });

  it("returns empty array for actor with no roles", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const engine = new Toride({ policy });
    const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
    const resource: ResourceRef = { type: "Employee", id: "42" };

    const fields = await engine.permittedFields(actor, "read", resource);
    expect(fields).toEqual([]);
  });

  it("returns empty array for unknown resource type", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const engine = new Toride({ policy });
    const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
    const resource: ResourceRef = { type: "Unknown", id: "1" };

    const fields = await engine.permittedFields(actor, "read", resource);
    expect(fields).toEqual([]);
  });

  it("returns empty array when resource has no field_access", async () => {
    const noFieldAccessYaml = `
version: "1"
actors:
  User:
    attributes:
      email: string
      is_viewer: boolean
resources:
  Task:
    roles: [viewer]
    permissions: [read]
    grants:
      viewer: [read]
    derived_roles:
      - role: viewer
        when:
          "$actor.is_viewer": true
`;
    const policy = await loadYaml(noFieldAccessYaml);
    const engine = new Toride({ policy });
    const actor: ActorRef = { type: "User", id: "u1", attributes: { is_viewer: true } };
    const resource: ResourceRef = { type: "Task", id: "1" };

    // No field_access means no declared fields to return
    const fields = await engine.permittedFields(actor, "read", resource);
    expect(fields).toEqual([]);
  });

  it("returns empty array for update when viewer has no update permission", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const engine = new Toride({ policy });
    const actor: ActorRef = { type: "User", id: "u1", attributes: { is_viewer: true } };
    const resource: ResourceRef = { type: "Employee", id: "42" };

    const fields = await engine.permittedFields(actor, "update", resource);
    expect(fields).toEqual([]);
  });
});
