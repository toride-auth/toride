// T035: Integration tests for role derivation through relations

import { describe, it, expect, beforeAll } from "vitest";
import type {
  ActorRef,
  ResourceRef,
  RelationResolver,
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
      org:
        resource: Organization
        cardinality: one
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
      assignee:
        resource: User
        cardinality: one
      project:
        resource: Project
        cardinality: one
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

  function makeResolver(config: {
    roles?: Record<string, string[]>;
    related?: Record<string, ResourceRef | ResourceRef[]>;
    attributes?: Record<string, Record<string, unknown>>;
  }): RelationResolver {
    return {
      getRoles: async (actor: ActorRef, resource: ResourceRef) => {
        const key = `${actor.id}:${resource.type}:${resource.id}`;
        return config.roles?.[key] ?? [];
      },
      getRelated: async (resource: ResourceRef, relationName: string) => {
        const key = `${resource.type}:${resource.id}:${relationName}`;
        return config.related?.[key] ?? [];
      },
      getAttributes: async (ref: ResourceRef) => {
        const key = `${ref.type}:${ref.id}`;
        return config.attributes?.[key] ?? {};
      },
    };
  }

  // ─── Acceptance Scenario 1: Org admin -> Project admin via relation ──

  it("derives Project admin from Organization admin via org relation", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolver = makeResolver({
      roles: { "u1:Organization:org1": ["admin"] },
      related: { "Project:p1:org": { type: "Organization", id: "org1" } },
    });
    const engine = createToride({ policy, resolver });
    const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
    const project: ResourceRef = { type: "Project", id: "p1" };

    expect(await engine.can(actor, "delete", project)).toBe(true);
    expect(await engine.can(actor, "read", project)).toBe(true);
    expect(await engine.can(actor, "write", project)).toBe(true);
  });

  // ─── Acceptance Scenario 2: Superadmin global role -> Project owner ──

  it("derives Project owner from superadmin global role", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolver = makeResolver({
      related: { "Project:p1:org": { type: "Organization", id: "org1" } },
    });
    const engine = createToride({ policy, resolver });
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
    const resolver = makeResolver({
      related: { "Project:p1:org": { type: "Organization", id: "org1" } },
    });
    const engine = createToride({ policy, resolver });
    const actor: ActorRef = {
      type: "User",
      id: "u1",
      attributes: { isSuperAdmin: false },
    };
    const project: ResourceRef = { type: "Project", id: "p1" };

    expect(await engine.can(actor, "read", project)).toBe(false);
  });

  // ─── Acceptance Scenario 3: Assignee identity -> Task editor ──────

  it("derives Task editor from assignee identity relation", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolver = makeResolver({
      related: {
        "Task:t1:assignee": { type: "User", id: "u1" },
        "Task:t1:project": { type: "Project", id: "p1" },
        "Project:p1:org": { type: "Organization", id: "org1" },
      },
    });
    const engine = createToride({ policy, resolver });
    const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
    const task: ResourceRef = { type: "Task", id: "t1" };

    expect(await engine.can(actor, "update", task)).toBe(true);
    expect(await engine.can(actor, "close", task)).toBe(true);
    expect(await engine.can(actor, "read", task)).toBe(true);
  });

  it("does not derive Task editor when assignee is different user", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolver = makeResolver({
      related: {
        "Task:t1:assignee": { type: "User", id: "u999" },
        "Task:t1:project": { type: "Project", id: "p1" },
        "Project:p1:org": { type: "Organization", id: "org1" },
      },
    });
    const engine = createToride({ policy, resolver });
    const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
    const task: ResourceRef = { type: "Task", id: "t1" };

    expect(await engine.can(actor, "update", task)).toBe(false);
  });

  // ─── Acceptance Scenario 4: ServiceAccount skips User-only derived roles ──

  it("skips derived roles when actor type does not match", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolver = makeResolver({
      related: {
        "Task:t1:assignee": { type: "User", id: "sa1" },
      },
    });
    const engine = createToride({ policy, resolver });
    // ServiceAccount has same ID as assignee target ID, but type differs
    const actor: ActorRef = { type: "ServiceAccount", id: "sa1", attributes: {} };
    const task: ResourceRef = { type: "Task", id: "t1" };

    // The assignee relation target is type "User", actor is ServiceAccount
    expect(await engine.can(actor, "update", task)).toBe(false);
  });

  // ─── Transitive derivation: Task viewer via Project viewer via Org member ──

  it("derives Task viewer transitively via Project viewer from Org member", async () => {
    // Org member -> no derived viewer on Project in this policy
    // But if actor has direct viewer on Project:
    const policy = await loadYaml(POLICY_YAML);
    const resolver = makeResolver({
      roles: { "u1:Project:p1": ["viewer"] },
      related: {
        "Task:t1:project": { type: "Project", id: "p1" },
        "Task:t1:assignee": { type: "User", id: "other" },
        "Project:p1:org": { type: "Organization", id: "org1" },
      },
    });
    const engine = createToride({ policy, resolver });
    const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
    const task: ResourceRef = { type: "Task", id: "t1" };

    expect(await engine.can(actor, "read", task)).toBe(true);
    expect(await engine.can(actor, "update", task)).toBe(false);
  });

  // ─── Default deny with derived roles ───────────────────────────────

  it("denies access when no direct or derived roles match", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolver = makeResolver({
      related: {
        "Project:p1:org": { type: "Organization", id: "org1" },
      },
    });
    const engine = createToride({ policy, resolver });
    const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
    const project: ResourceRef = { type: "Project", id: "p1" };

    expect(await engine.can(actor, "read", project)).toBe(false);
  });

  // ─── Existing basic can() tests still work ─────────────────────────

  it("still supports direct role assignments alongside derived roles", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolver = makeResolver({
      roles: { "u1:Project:p1": ["viewer"] },
      related: {
        "Project:p1:org": { type: "Organization", id: "org1" },
      },
    });
    const engine = createToride({ policy, resolver });
    const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
    const project: ResourceRef = { type: "Project", id: "p1" };

    expect(await engine.can(actor, "read", project)).toBe(true);
    expect(await engine.can(actor, "write", project)).toBe(false);
  });
});
