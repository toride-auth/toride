// T092: Integration tests for field-level access scenarios

import { describe, it, expect, beforeAll } from "vitest";
import type {
  ActorRef,
  ResourceRef,
  RelationResolver,
  Policy,
  TorideOptions,
} from "../../src/types.js";

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

  // Checkpoint scenario from the plan:
  // canField(actor, "read", Employee:42, "salary") returns correct results based on role
  const POLICY_YAML = `
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
    field_access:
      salary:      { read: [hr_admin, manager], update: [hr_admin] }
      ssn:         { read: [hr_admin] }
      performance: { read: [manager, hr_admin], update: [manager, hr_admin] }
      name:        { read: [viewer, manager, hr_admin], update: [manager, hr_admin] }
`;

  function makeResolver(config: {
    roles?: Record<string, string[]>;
    attributes?: Record<string, Record<string, unknown>>;
  }): RelationResolver {
    return {
      getRoles: async (actor: ActorRef, resource: ResourceRef) => {
        const key = `${actor.id}:${resource.type}:${resource.id}`;
        return config.roles?.[key] ?? [];
      },
      getRelated: async () => [],
      getAttributes: async (ref: ResourceRef) => {
        const key = `${ref.type}:${ref.id}`;
        return config.attributes?.[key] ?? {};
      },
    };
  }

  // Checkpoint: canField(actor, "read", Employee:42, "salary") returns correct results based on role
  it("checkpoint: canField returns correct results based on role for salary field", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolver = makeResolver({
      roles: {
        "alice:Employee:42": ["hr_admin"],
        "bob:Employee:42": ["manager"],
        "charlie:Employee:42": ["viewer"],
      },
    });
    const engine = createToride({ policy, resolver });
    const employee: ResourceRef = { type: "Employee", id: "42" };

    const alice: ActorRef = { type: "User", id: "alice", attributes: {} };
    const bob: ActorRef = { type: "User", id: "bob", attributes: {} };
    const charlie: ActorRef = { type: "User", id: "charlie", attributes: {} };
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
    const resolver = makeResolver({
      roles: { "u1:Employee:42": ["viewer"] },
    });
    const engine = createToride({ policy, resolver });
    const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
    const resource: ResourceRef = { type: "Employee", id: "42" };

    // "email" not in field_access; viewer has "read" perm -> unrestricted
    expect(await engine.canField(actor, "read", resource, "email")).toBe(true);
    // viewer does NOT have "update" perm -> denied even for unlisted fields
    expect(await engine.canField(actor, "update", resource, "email")).toBe(false);
  });

  it("permittedFields returns correct fields for each role", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolver = makeResolver({
      roles: {
        "alice:Employee:42": ["hr_admin"],
        "bob:Employee:42": ["manager"],
        "charlie:Employee:42": ["viewer"],
      },
    });
    const engine = createToride({ policy, resolver });
    const employee: ResourceRef = { type: "Employee", id: "42" };

    const alice: ActorRef = { type: "User", id: "alice", attributes: {} };
    const bob: ActorRef = { type: "User", id: "bob", attributes: {} };
    const charlie: ActorRef = { type: "User", id: "charlie", attributes: {} };

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
          actor.department:
            eq: "engineering"
    field_access:
      salary:      { read: [hr_admin, manager], update: [hr_admin] }
      ssn:         { read: [hr_admin] }
      performance: { read: [manager, hr_admin], update: [manager, hr_admin] }
      name:        { read: [viewer, manager, hr_admin], update: [manager, hr_admin] }
`;
    const policy = await loadYaml(derivedRoleYaml);
    // Actor with department=engineering gets derived "manager" role (no direct roles)
    const resolver = makeResolver({ roles: {} });
    const engine = createToride({ policy, resolver });
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
    const resolver = makeResolver({});
    const engine = createToride({ policy, resolver });
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
    const resolver = makeResolver({
      roles: { "u1:Employee:42": ["viewer", "manager"] },
    });
    const engine = createToride({ policy, resolver });
    const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
    const resource: ResourceRef = { type: "Employee", id: "42" };

    // Combined viewer + manager: can read salary (via manager)
    expect(await engine.canField(actor, "read", resource, "salary")).toBe(true);
    // Can read name (via both)
    expect(await engine.canField(actor, "read", resource, "name")).toBe(true);
    // Still can't read ssn (only hr_admin)
    expect(await engine.canField(actor, "read", resource, "ssn")).toBe(false);
  });
});
