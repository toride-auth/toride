// T092: Integration tests for field-level access scenarios
// Updated for Resolvers map / AttributeCache (Phase 3)
// FR-008: roles derived via derived_roles, not getRoles

import { describe, it, expect, beforeAll } from "vitest";
import type {
  ActorRef,
  ResourceRef,
  Policy,
  TorideOptions,
} from "../types.js";

describe("field-level access integration", () => {
  let createToride: (options: TorideOptions) => {
    canField: (
      actor: ActorRef,
      operation: "read" | "update",
      resource: ResourceRef,
      field: string,
    ) => Promise<boolean>;
    permittedFields: (
      actor: ActorRef,
      operation: "read" | "update",
      resource: ResourceRef,
    ) => Promise<string[]>;
    can: (
      actor: ActorRef,
      action: string,
      resource: ResourceRef,
    ) => Promise<boolean>;
  };
  let loadYaml: (input: string) => Promise<Policy>;

  beforeAll(async () => {
    const engineMod = await import("../../src/engine.js");
    createToride = engineMod.createToride as typeof createToride;
    const parserMod = await import("../../src/policy/parser.js");
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

  // Checkpoint: canField(actor, "read", Employee:42, "salary") returns correct results based on role
  it("checkpoint: canField returns correct results based on role for salary field", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const engine = createToride({ policy });
    const employee: ResourceRef = { type: "Employee", id: "42" };

    const alice: ActorRef = { type: "User", id: "alice", attributes: { is_hr_admin: true } };
    const bob: ActorRef = { type: "User", id: "bob", attributes: { is_manager: true } };
    const charlie: ActorRef = { type: "User", id: "charlie", attributes: { is_viewer: true } };
    const nobody: ActorRef = { type: "User", id: "nobody", attributes: {} };

    // hr_admin can read salary
    expect(await engine.canField(alice, "read", employee, "salary")).toBe(true);
    // manager can read salary
    expect(await engine.canField(bob, "read", employee, "salary")).toBe(true);
    // viewer cannot read salary
    expect(await engine.canField(charlie, "read", employee, "salary")).toBe(false);
    // no roles -> cannot read salary
    expect(await engine.canField(nobody, "read", employee, "salary")).toBe(false);
  });

  // Checkpoint: Unlisted fields are unrestricted
  it("checkpoint: unlisted fields are unrestricted for actors with resource-level permission", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const engine = createToride({ policy });
    const actor: ActorRef = { type: "User", id: "u1", attributes: { is_viewer: true } };
    const resource: ResourceRef = { type: "Employee", id: "42" };

    // "email" not in field_access; viewer has "read" perm -> unrestricted
    expect(await engine.canField(actor, "read", resource, "email")).toBe(true);
    // viewer does NOT have "update" perm -> denied even for unlisted fields
    expect(await engine.canField(actor, "update", resource, "email")).toBe(false);
  });

  it("permittedFields returns correct fields for each role", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const engine = createToride({ policy });
    const employee: ResourceRef = { type: "Employee", id: "42" };

    const alice: ActorRef = { type: "User", id: "alice", attributes: { is_hr_admin: true } };
    const bob: ActorRef = { type: "User", id: "bob", attributes: { is_manager: true } };
    const charlie: ActorRef = { type: "User", id: "charlie", attributes: { is_viewer: true } };

    // hr_admin can read all declared fields
    const aliceFields = await engine.permittedFields(alice, "read", employee);
    expect(aliceFields.sort()).toEqual(["name", "performance", "salary", "ssn"]);

    // manager can read salary, performance, name (not ssn)
    const bobFields = await engine.permittedFields(bob, "read", employee);
    expect(bobFields.sort()).toEqual(["name", "performance", "salary"]);

    // viewer can only read name
    const charlieFields = await engine.permittedFields(charlie, "read", employee);
    expect(charlieFields).toEqual(["name"]);
  });

  it("field access works with derived roles", async () => {
    const derivedRoleYaml = `
version: "1"
actors:
  User:
    attributes:
      department: string
resources:
  Employee:
    roles: [viewer, manager, hr_admin]
    permissions: [read, update, delete]
    grants:
      viewer:   [read]
      manager:  [read, update]
      hr_admin: [all]
    derived_roles:
      - role: manager
        actor_type: User
        when:
          "$actor.department": "engineering"
    field_access:
      salary:      { read: [hr_admin, manager], update: [hr_admin] }
      ssn:         { read: [hr_admin] }
      performance: { read: [manager, hr_admin], update: [manager, hr_admin] }
      name:        { read: [viewer, manager, hr_admin], update: [manager, hr_admin] }
`;
    const policy = await loadYaml(derivedRoleYaml);
    // Actor with department=engineering gets derived "manager" role (no direct roles)
    const engine = createToride({ policy });
    const actor: ActorRef = {
      type: "User",
      id: "u1",
      attributes: { department: "engineering" },
    };
    const resource: ResourceRef = { type: "Employee", id: "42" };

    // Derived manager role should grant salary read
    expect(await engine.canField(actor, "read", resource, "salary")).toBe(true);
    // Derived manager role should NOT grant salary update
    expect(await engine.canField(actor, "update", resource, "salary")).toBe(false);
    // Derived manager should get manager's permitted read fields
    const fields = await engine.permittedFields(actor, "read", resource);
    expect(fields.sort()).toEqual(["name", "performance", "salary"]);
  });

  it("canField and can are consistent: no field access without resource permission", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const engine = createToride({ policy });
    const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
    const resource: ResourceRef = { type: "Employee", id: "42" };

    // No roles -> no resource-level permission
    expect(await engine.can(actor, "read", resource)).toBe(false);
    // Therefore no field access either
    expect(await engine.canField(actor, "read", resource, "name")).toBe(false);
    expect(await engine.canField(actor, "read", resource, "email")).toBe(false);
  });

  it("handles multiple roles on the same actor", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const engine = createToride({ policy });
    const actor: ActorRef = { type: "User", id: "u1", attributes: { is_viewer: true, is_manager: true } };
    const resource: ResourceRef = { type: "Employee", id: "42" };

    // Combined viewer + manager: can read salary (via manager)
    expect(await engine.canField(actor, "read", resource, "salary")).toBe(true);
    // Can read name (via both)
    expect(await engine.canField(actor, "read", resource, "name")).toBe(true);
    // Still can't read ssn (only hr_admin)
    expect(await engine.canField(actor, "read", resource, "ssn")).toBe(false);
  });
});
