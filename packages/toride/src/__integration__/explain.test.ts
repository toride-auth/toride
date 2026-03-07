// T067: Integration tests for debug scenarios
// Updated for Resolvers map / AttributeCache (Phase 3)
// FR-008: roles derived via derived_roles, not getRoles

import { describe, it, expect, beforeAll } from "vitest";
import type {
  ActorRef,
  ResourceRef,
  Resolvers,
  Policy,
  TorideOptions,
  ExplainResult,
  BatchCheckItem,
} from "../types.js";

describe("explain() integration - debug scenarios", () => {
  let Toride: new (options: TorideOptions) => {
    explain: (
      actor: ActorRef,
      action: string,
      resource: ResourceRef,
    ) => Promise<ExplainResult>;
    can: (
      actor: ActorRef,
      action: string,
      resource: ResourceRef,
    ) => Promise<boolean>;
    permittedActions: (
      actor: ActorRef,
      resource: ResourceRef,
    ) => Promise<string[]>;
    resolvedRoles: (
      actor: ActorRef,
      resource: ResourceRef,
    ) => Promise<string[]>;
    canBatch: (
      actor: ActorRef,
      checks: BatchCheckItem[],
    ) => Promise<boolean[]>;
  };
  let loadYaml: (input: string) => Promise<Policy>;

  beforeAll(async () => {
    const engineMod = await import("../../src/engine.js");
    Toride = engineMod.Toride as typeof Toride;
    const parserMod = await import("../../src/policy/parser.js");
    loadYaml = parserMod.loadYaml;
  });

  // Multi-resource policy with derived roles and conditional rules
  // Relations are now simple strings; relation targets come from resource attributes
  const POLICY_YAML = `
version: "1"
actors:
  User:
    attributes:
      isSuperAdmin: boolean
      department: string
      is_org_admin: boolean
      is_org_member: boolean
      is_project_viewer: boolean
      is_project_editor: boolean
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
      - role: member
        when:
          "$actor.is_org_member": true
  Project:
    roles: [owner, editor, viewer]
    permissions: [read, write, delete, archive]
    relations:
      org: Organization
    grants:
      owner: [all]
      editor: [read, write]
      viewer: [read]
    derived_roles:
      - role: owner
        from_global_role: superadmin
      - role: editor
        from_role: admin
        on_relation: org
      - role: viewer
        when:
          "$actor.is_project_viewer": true
      - role: editor
        when:
          "$actor.is_project_editor": true
    rules:
      - effect: forbid
        permissions: [archive]
        when:
          "$resource.archived": true
      - effect: permit
        roles: [editor]
        permissions: [archive]
        when:
          "$resource.archived": false
global_roles:
  superadmin:
    actor_type: User
    when:
      "$actor.isSuperAdmin": true
`;

  // ─── Scenario 1: Explain derived role via global role ──────────────

  it("explains derivation path through global role", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolvers: Resolvers = {
      Project: async () => ({ org: { type: "Organization", id: "org1" } }),
    };
    const engine = new Toride({ policy, resolvers });
    const actor: ActorRef = {
      type: "User",
      id: "u1",
      attributes: { isSuperAdmin: true },
    };
    const project: ResourceRef = { type: "Project", id: "p1" };

    const result = await engine.explain(actor, "read", project);

    expect(result.allowed).toBe(true);
    expect(result.resolvedRoles.derived).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "owner",
          via: expect.stringContaining("global_role:superadmin"),
        }),
      ]),
    );
    expect(result.grantedPermissions).toContain("read");
    expect(result.grantedPermissions).toContain("write");
    expect(result.grantedPermissions).toContain("delete");
    expect(result.grantedPermissions).toContain("archive");
  });

  // ─── Scenario 2: Explain derived role via relation ─────────────────

  it("explains derivation path through relation-based role", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolvers: Resolvers = {
      Project: async () => ({ org: { type: "Organization", id: "org1" } }),
    };
    const engine = new Toride({ policy, resolvers });
    const actor: ActorRef = { type: "User", id: "u1", attributes: { is_org_admin: true } };
    const project: ResourceRef = { type: "Project", id: "p1" };

    const result = await engine.explain(actor, "write", project);

    expect(result.allowed).toBe(true);
    expect(result.resolvedRoles.derived).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "editor",
          via: expect.stringContaining("from_role:admin"),
        }),
      ]),
    );
  });

  // ─── Scenario 3: Explain forbid rule blocking access ──────────────

  it("explains forbid rule blocking access", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolvers: Resolvers = {
      Project: async () => ({ org: { type: "Organization", id: "org1" }, archived: true }),
    };
    const engine = new Toride({ policy, resolvers });
    const actor: ActorRef = { type: "User", id: "u1", attributes: { is_org_admin: true } };
    const project: ResourceRef = { type: "Project", id: "p1" };

    const result = await engine.explain(actor, "archive", project);

    expect(result.allowed).toBe(false);
    expect(result.matchedRules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          effect: "forbid",
          matched: true,
        }),
      ]),
    );
    expect(result.finalDecision).toMatch(/forbidden|denied/i);
  });

  // ─── Scenario 4: Explain default deny (no roles) ──────────────────

  it("explains default deny when no roles match", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolvers: Resolvers = {
      Project: async () => ({ org: { type: "Organization", id: "org1" } }),
    };
    const engine = new Toride({ policy, resolvers });
    const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
    const project: ResourceRef = { type: "Project", id: "p1" };

    const result = await engine.explain(actor, "write", project);

    expect(result.allowed).toBe(false);
    expect(result.resolvedRoles.direct).toEqual([]);
    expect(result.resolvedRoles.derived).toEqual([]);
    expect(result.grantedPermissions).toEqual([]);
    expect(result.finalDecision).toMatch(/denied/i);
  });

  // ─── Scenario 5: permittedActions with derived roles ──────────────

  it("permittedActions returns all actions for superadmin via derived owner", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolvers: Resolvers = {
      Project: async () => ({ org: { type: "Organization", id: "org1" } }),
    };
    const engine = new Toride({ policy, resolvers });
    const actor: ActorRef = {
      type: "User",
      id: "u1",
      attributes: { isSuperAdmin: true },
    };
    const project: ResourceRef = { type: "Project", id: "p1" };

    const actions = await engine.permittedActions(actor, project);

    expect(actions).toContain("read");
    expect(actions).toContain("write");
    expect(actions).toContain("delete");
    expect(actions).toContain("archive");
  });

  // ─── Scenario 6: resolvedRoles with multiple derivation paths ──────

  it("resolvedRoles includes derived roles from multiple paths", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolvers: Resolvers = {
      Project: async () => ({ org: { type: "Organization", id: "org1" } }),
    };
    const engine = new Toride({ policy, resolvers });
    // Actor gets viewer from is_project_viewer and editor from is_org_admin via relation
    const actor: ActorRef = { type: "User", id: "u1", attributes: { is_project_viewer: true, is_org_admin: true } };
    const project: ResourceRef = { type: "Project", id: "p1" };

    const roles = await engine.resolvedRoles(actor, project);

    expect(roles).toContain("viewer");
    expect(roles).toContain("editor");
  });

  // ─── Scenario 7: canBatch across multiple resources ────────────────

  it("canBatch correctly evaluates checks across different resources", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolvers: Resolvers = {
      Project: async () => ({ org: { type: "Organization", id: "org1" } }),
    };
    const engine = new Toride({ policy, resolvers });
    const actor: ActorRef = { type: "User", id: "u1", attributes: { is_org_member: true, is_project_editor: true } };

    const results = await engine.canBatch(actor, [
      { action: "read", resource: { type: "Organization", id: "org1" } },
      { action: "manage", resource: { type: "Organization", id: "org1" } },
      { action: "read", resource: { type: "Project", id: "p1" } },
      { action: "write", resource: { type: "Project", id: "p1" } },
      { action: "delete", resource: { type: "Project", id: "p1" } },
    ]);

    expect(results).toEqual([
      true,  // member can read org
      false, // member cannot manage org
      true,  // editor can read project
      true,  // editor can write project
      false, // editor cannot delete project
    ]);
  });

  // ─── Scenario 8: Explain with permit rule ──────────────────────────

  it("explains permit rule granting access", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolvers: Resolvers = {
      Project: async () => ({ org: { type: "Organization", id: "org1" }, archived: false }),
    };
    const engine = new Toride({ policy, resolvers });
    const actor: ActorRef = { type: "User", id: "u1", attributes: { is_org_admin: true } };
    const project: ResourceRef = { type: "Project", id: "p1" };

    const result = await engine.explain(actor, "archive", project);

    // Editor (derived from org admin) has permit rule for archive when not archived
    expect(result.allowed).toBe(true);
    expect(result.matchedRules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          effect: "permit",
          matched: true,
        }),
      ]),
    );
  });
});
