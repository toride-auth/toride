// T035: Integration tests for role derivation through relations
// Updated for Resolvers map / AttributeCache (Phase 3)
// FR-008: roles derived via derived_roles, not getRoles
// FR-009: relations expressed as ResourceRef values in resource attributes

import { describe, it, expect, beforeAll } from "vitest";
import type {
  ActorRef,
  ResourceRef,
  Resolvers,
  Policy,
  TorideOptions,
} from "../../src/types.js";
import { CycleError, DepthLimitError } from "../../src/types.js";

describe("derived roles integration", () => {
  let createToride: (options: TorideOptions) => {
    can: (actor: ActorRef, action: string, resource: ResourceRef) => Promise<boolean>;
  };
  let loadYaml: (input: string) => Promise<Policy>;

  beforeAll(async () => {
    const engineMod = await import("../../src/engine.js");
    createToride = engineMod.createToride;
    const parserMod = await import("../../src/policy/parser.js");
    loadYaml = parserMod.loadYaml;
  });

  // ─── Full policy with multiple resources and derived roles ─────────
  // Relations are now simple strings (resource type name)
  // Relation targets are resolved from resource attributes (ResourceRef values)

  const POLICY_YAML = `
version: "1"
actors:
  User:
    attributes:
      isSuperAdmin: boolean
      department: string
  ServiceAccount:
    attributes: {}
global_roles:
  superadmin:
    actor_type: User
    when:
      "$actor.isSuperAdmin": true
resources:
  Organization:
    roles: [admin, member]
    permissions: [read, manage, delete]
    grants:
      admin: [all]
      member: [read]
  Project:
    roles: [owner, admin, viewer]
    permissions: [read, write, delete]
    relations:
      org: Organization
    grants:
      owner: [all]
      admin: [read, write, delete]
      viewer: [read]
    derived_roles:
      - role: owner
        from_global_role: superadmin
      - role: admin
        from_role: admin
        on_relation: org
  Task:
    roles: [editor, viewer]
    permissions: [read, update, close]
    relations:
      assignee: User
      project: Project
    grants:
      editor: [read, update, close]
      viewer: [read]
    derived_roles:
      - role: editor
        from_relation: assignee
      - role: viewer
        from_role: viewer
        on_relation: project
  User:
    roles: []
    permissions: []
`;

  // ─── Acceptance Scenario 1: Org admin -> Project admin via relation ──
  // Relation target is expressed as a ResourceRef attribute on the resource

  it("derives Project admin from Organization admin via org relation", async () => {
    const policy = await loadYaml(POLICY_YAML);
    // Project:p1 has org attribute pointing to Organization:org1
    // Actor has admin role on Organization:org1 (derived via derived_roles)
    // We need Organization:org1 to have a derived_role that grants admin based on actor attributes
    // But the original test used direct roles. Since FR-008 removes getRoles,
    // we'll add a derived_role on Organization that grants admin via actor attribute.
    const orgAdminPolicy = `
version: "1"
actors:
  User:
    attributes:
      isSuperAdmin: boolean
      department: string
      is_org_admin: boolean
  ServiceAccount:
    attributes:
      is_org_admin: boolean
global_roles:
  superadmin:
    actor_type: User
    when:
      "$actor.isSuperAdmin": true
resources:
  Organization:
    roles: [admin, member]
    permissions: [read, manage, delete]
    grants:
      admin: [all]
      member: [read]
    derived_roles:
      - role: admin
        when:
          "$actor.is_org_admin": true
  Project:
    roles: [owner, admin, viewer]
    permissions: [read, write, delete]
    relations:
      org: Organization
    grants:
      owner: [all]
      admin: [read, write, delete]
      viewer: [read]
    derived_roles:
      - role: owner
        from_global_role: superadmin
      - role: admin
        from_role: admin
        on_relation: org
  Task:
    roles: [editor, viewer]
    permissions: [read, update, close]
    relations:
      assignee: User
      project: Project
    grants:
      editor: [read, update, close]
      viewer: [read]
    derived_roles:
      - role: editor
        from_relation: assignee
      - role: viewer
        from_role: viewer
        on_relation: project
  User:
    roles: []
    permissions: []
`;
    const policy2 = await loadYaml(orgAdminPolicy);
    const resolvers: Resolvers = {
      Project: async () => ({ org: { type: "Organization", id: "org1" } }),
    };
    const engine = createToride({ policy: policy2, resolvers });
    const actor: ActorRef = { type: "User", id: "u1", attributes: { is_org_admin: true } };
    const project: ResourceRef = { type: "Project", id: "p1" };

    expect(await engine.can(actor, "delete", project)).toBe(true);
    expect(await engine.can(actor, "read", project)).toBe(true);
    expect(await engine.can(actor, "write", project)).toBe(true);
  });

  // ─── Acceptance Scenario 2: Superadmin global role -> Project owner ──

  it("derives Project owner from superadmin global role", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolvers: Resolvers = {
      Project: async () => ({ org: { type: "Organization", id: "org1" } }),
    };
    const engine = createToride({ policy, resolvers });
    const actor: ActorRef = {
      type: "User",
      id: "u1",
      attributes: { isSuperAdmin: true },
    };
    const project: ResourceRef = { type: "Project", id: "p1" };

    // Superadmin -> owner -> all permissions
    expect(await engine.can(actor, "read", project)).toBe(true);
    expect(await engine.can(actor, "write", project)).toBe(true);
    expect(await engine.can(actor, "delete", project)).toBe(true);
  });

  it("does not derive superadmin role for non-matching actor", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolvers: Resolvers = {
      Project: async () => ({ org: { type: "Organization", id: "org1" } }),
    };
    const engine = createToride({ policy, resolvers });
    const actor: ActorRef = {
      type: "User",
      id: "u1",
      attributes: { isSuperAdmin: false },
    };
    const project: ResourceRef = { type: "Project", id: "p1" };

    expect(await engine.can(actor, "read", project)).toBe(false);
  });

  // ─── Acceptance Scenario 3: Assignee identity -> Task editor ──────
  // Relation target is expressed as a ResourceRef attribute on the resource

  it("derives Task editor from assignee identity relation", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolvers: Resolvers = {
      Task: async () => ({
        assignee: { type: "User", id: "u1" },
        project: { type: "Project", id: "p1" },
      }),
      Project: async () => ({ org: { type: "Organization", id: "org1" } }),
    };
    const engine = createToride({ policy, resolvers });
    const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
    const task: ResourceRef = { type: "Task", id: "t1" };

    expect(await engine.can(actor, "update", task)).toBe(true);
    expect(await engine.can(actor, "close", task)).toBe(true);
    expect(await engine.can(actor, "read", task)).toBe(true);
  });

  it("does not derive Task editor when assignee is different user", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolvers: Resolvers = {
      Task: async () => ({
        assignee: { type: "User", id: "u999" },
        project: { type: "Project", id: "p1" },
      }),
      Project: async () => ({ org: { type: "Organization", id: "org1" } }),
    };
    const engine = createToride({ policy, resolvers });
    const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
    const task: ResourceRef = { type: "Task", id: "t1" };

    expect(await engine.can(actor, "update", task)).toBe(false);
  });

  // ─── Acceptance Scenario 4: ServiceAccount skips User-only derived roles ──

  it("skips derived roles when actor type does not match", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolvers: Resolvers = {
      Task: async () => ({
        assignee: { type: "User", id: "sa1" },
      }),
    };
    const engine = createToride({ policy, resolvers });
    // ServiceAccount has same ID as assignee target ID, but type differs
    const actor: ActorRef = { type: "ServiceAccount", id: "sa1", attributes: {} };
    const task: ResourceRef = { type: "Task", id: "t1" };

    // The assignee relation target is type "User", actor is ServiceAccount
    expect(await engine.can(actor, "update", task)).toBe(false);
  });

  // ─── Transitive derivation: Task viewer via Project viewer ──────

  it("derives Task viewer transitively via Project viewer", async () => {
    // Need a policy where Project has a derived_role for viewer
    const viewerPolicy = `
version: "1"
actors:
  User:
    attributes:
      isSuperAdmin: boolean
      department: string
      is_project_viewer: boolean
  ServiceAccount:
    attributes:
      is_project_viewer: boolean
global_roles:
  superadmin:
    actor_type: User
    when:
      "$actor.isSuperAdmin": true
resources:
  Organization:
    roles: [admin, member]
    permissions: [read, manage, delete]
    grants:
      admin: [all]
      member: [read]
  Project:
    roles: [owner, admin, viewer]
    permissions: [read, write, delete]
    relations:
      org: Organization
    grants:
      owner: [all]
      admin: [read, write, delete]
      viewer: [read]
    derived_roles:
      - role: owner
        from_global_role: superadmin
      - role: viewer
        when:
          "$actor.is_project_viewer": true
  Task:
    roles: [editor, viewer]
    permissions: [read, update, close]
    relations:
      assignee: User
      project: Project
    grants:
      editor: [read, update, close]
      viewer: [read]
    derived_roles:
      - role: editor
        from_relation: assignee
      - role: viewer
        from_role: viewer
        on_relation: project
  User:
    roles: []
    permissions: []
`;
    const policy = await loadYaml(viewerPolicy);
    const resolvers: Resolvers = {
      Task: async () => ({
        project: { type: "Project", id: "p1" },
        assignee: { type: "User", id: "other" },
      }),
      Project: async () => ({ org: { type: "Organization", id: "org1" } }),
    };
    const engine = createToride({ policy, resolvers });
    const actor: ActorRef = { type: "User", id: "u1", attributes: { is_project_viewer: true } };
    const task: ResourceRef = { type: "Task", id: "t1" };

    expect(await engine.can(actor, "read", task)).toBe(true);
    expect(await engine.can(actor, "update", task)).toBe(false);
  });

  // ─── Default deny with derived roles ───────────────────────────────

  it("denies access when no direct or derived roles match", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolvers: Resolvers = {
      Project: async () => ({ org: { type: "Organization", id: "org1" } }),
    };
    const engine = createToride({ policy, resolvers });
    const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
    const project: ResourceRef = { type: "Project", id: "p1" };

    expect(await engine.can(actor, "read", project)).toBe(false);
  });

  // ─── Existing basic can() tests still work ─────────────────────────

  it("still supports derived roles alongside global roles", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolvers: Resolvers = {
      Project: async () => ({ org: { type: "Organization", id: "org1" } }),
    };
    const engine = createToride({ policy, resolvers });
    // Superadmin gets owner via global role
    const actor: ActorRef = { type: "User", id: "u1", attributes: { isSuperAdmin: true } };
    const project: ResourceRef = { type: "Project", id: "p1" };

    expect(await engine.can(actor, "read", project)).toBe(true);
    expect(await engine.can(actor, "write", project)).toBe(true);
  });
});
