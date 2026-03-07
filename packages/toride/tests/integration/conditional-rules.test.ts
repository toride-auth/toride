// T045: Integration tests for conditional rules
// Updated for Resolvers map / AttributeCache (Phase 3)
// FR-008: roles derived via derived_roles, not getRoles

import { describe, it, expect, beforeAll } from "vitest";
import type {
  ActorRef,
  ResourceRef,
  Resolvers,
  Policy,
  TorideOptions,
  EvaluatorFn,
} from "../../src/types.js";

describe("conditional rules integration", () => {
  let createToride: (options: TorideOptions) => {
    can: (actor: ActorRef, action: string, resource: ResourceRef, options?: { env?: Record<string, unknown> }) => Promise<boolean>;
  };
  let loadYaml: (input: string) => Promise<Policy>;

  beforeAll(async () => {
    const engineMod = await import("../../src/engine.js");
    createToride = engineMod.createToride;
    const parserMod = await import("../../src/policy/parser.js");
    loadYaml = parserMod.loadYaml;
  });

  // Uses derived_roles and resolvers for resource attributes
  const POLICY_YAML = `
version: "1"
actors:
  User:
    attributes:
      department: string
      level: number
      active: boolean
      is_editor: boolean
      is_viewer: boolean
      is_admin: boolean
resources:
  Document:
    roles: [editor, viewer, admin]
    permissions: [read, write, delete, publish]
    grants:
      viewer: [read]
      editor: [read, write]
      admin: [all]
    derived_roles:
      - role: editor
        when:
          "$actor.is_editor": true
      - role: viewer
        when:
          "$actor.is_viewer": true
      - role: admin
        when:
          "$actor.is_admin": true
    rules:
      - effect: permit
        roles: [editor]
        permissions: [publish]
        when:
          "$resource.status": "review"
          "$actor.level":
            gte: 3
      - effect: forbid
        permissions: [delete]
        when:
          "$resource.locked": true
      - effect: forbid
        permissions: [write, publish]
        when:
          "$resource.archived": true
  Organization:
    roles: [admin, member]
    permissions: [manage]
    grants:
      admin: [manage]
      member: []
`;

  function makeResolvers(attrs: Record<string, Record<string, unknown>>): Resolvers {
    const typeSet = new Set<string>();
    for (const key of Object.keys(attrs)) {
      const ci = key.indexOf(":");
      if (ci > 0) typeSet.add(key.substring(0, ci));
    }
    const resolvers: Resolvers = {};
    for (const type of typeSet) {
      resolvers[type] = async (ref) => {
        const key = `${ref.type}:${ref.id}`;
        return attrs[key] ?? {};
      };
    }
    return resolvers;
  }

  // ─── Permit rule grants conditional access ──────────────────────────

  it("editor can publish when document is in review and level >= 3", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolvers = makeResolvers({ "Document:d1": { status: "review", locked: false, archived: false } });
    const engine = createToride({ policy, resolvers });
    const actor: ActorRef = { type: "User", id: "u1", attributes: { department: "eng", level: 5, active: true, is_editor: true } };
    const resource: ResourceRef = { type: "Document", id: "d1" };

    expect(await engine.can(actor, "publish", resource)).toBe(true);
  });

  it("editor cannot publish when level < 3", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolvers = makeResolvers({ "Document:d1": { status: "review", locked: false, archived: false } });
    const engine = createToride({ policy, resolvers });
    const actor: ActorRef = { type: "User", id: "u1", attributes: { department: "eng", level: 2, active: true, is_editor: true } };
    const resource: ResourceRef = { type: "Document", id: "d1" };

    expect(await engine.can(actor, "publish", resource)).toBe(false);
  });

  it("editor cannot publish when document is not in review", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolvers = makeResolvers({ "Document:d1": { status: "draft", locked: false, archived: false } });
    const engine = createToride({ policy, resolvers });
    const actor: ActorRef = { type: "User", id: "u1", attributes: { department: "eng", level: 5, active: true, is_editor: true } };
    const resource: ResourceRef = { type: "Document", id: "d1" };

    expect(await engine.can(actor, "publish", resource)).toBe(false);
  });

  // ─── Forbid rule overrides grant ────────────────────────────────────

  it("admin cannot delete locked document (forbid overrides grant)", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolvers = makeResolvers({ "Document:d1": { locked: true, archived: false } });
    const engine = createToride({ policy, resolvers });
    const actor: ActorRef = { type: "User", id: "u1", attributes: { department: "eng", level: 10, active: true, is_admin: true } };
    const resource: ResourceRef = { type: "Document", id: "d1" };

    expect(await engine.can(actor, "delete", resource)).toBe(false);
    // But read is still allowed
    expect(await engine.can(actor, "read", resource)).toBe(true);
  });

  it("admin can delete unlocked document", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolvers = makeResolvers({ "Document:d1": { locked: false, archived: false } });
    const engine = createToride({ policy, resolvers });
    const actor: ActorRef = { type: "User", id: "u1", attributes: { department: "eng", level: 10, active: true, is_admin: true } };
    const resource: ResourceRef = { type: "Document", id: "d1" };

    expect(await engine.can(actor, "delete", resource)).toBe(true);
  });

  // ─── Multiple forbid rules ──────────────────────────────────────────

  it("archived document forbids write and publish", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolvers = makeResolvers({ "Document:d1": { locked: false, archived: true, status: "review" } });
    const engine = createToride({ policy, resolvers });
    const actor: ActorRef = { type: "User", id: "u1", attributes: { department: "eng", level: 5, active: true, is_admin: true } };
    const resource: ResourceRef = { type: "Document", id: "d1" };

    expect(await engine.can(actor, "write", resource)).toBe(false);
    expect(await engine.can(actor, "publish", resource)).toBe(false);
    // read is still allowed
    expect(await engine.can(actor, "read", resource)).toBe(true);
  });

  // ─── Viewer cannot gain permissions from permit rules ───────────────

  it("viewer cannot publish even when conditions match (roles guard)", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolvers = makeResolvers({ "Document:d1": { status: "review", locked: false, archived: false } });
    const engine = createToride({ policy, resolvers });
    const actor: ActorRef = { type: "User", id: "u1", attributes: { department: "eng", level: 5, active: true, is_viewer: true } };
    const resource: ResourceRef = { type: "Document", id: "d1" };

    expect(await engine.can(actor, "publish", resource)).toBe(false);
  });

  // ─── Custom evaluator integration ──────────────────────────────────

  it("custom evaluator works in integration", async () => {
    const CUSTOM_POLICY = `
version: "1"
actors:
  User:
    attributes:
      is_editor: boolean
resources:
  Document:
    roles: [editor]
    permissions: [write]
    grants:
      editor: [write]
    derived_roles:
      - role: editor
        when:
          "$actor.is_editor": true
    rules:
      - effect: forbid
        permissions: [write]
        when:
          "$resource.status":
            custom: isMaintenanceWindow
`;
    const policy = await loadYaml(CUSTOM_POLICY);
    const isMaintenanceWindow: EvaluatorFn = async () => true;
    const resolvers = makeResolvers({ "Document:d1": { status: "active" } });
    const engine = createToride({
      policy,
      resolvers,
      customEvaluators: { isMaintenanceWindow },
    });
    const actor: ActorRef = { type: "User", id: "u1", attributes: { is_editor: true } };
    const resource: ResourceRef = { type: "Document", id: "d1" };

    expect(await engine.can(actor, "write", resource)).toBe(false);
  });

  // ─── Fail-closed: resolver errors deny access (T052) ────────────────

  it("resolver error during condition evaluation denies access (fail-closed)", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolvers: Resolvers = {
      Document: async () => { throw new Error("DB down"); },
    };
    const engine = createToride({ policy, resolvers });
    const actor: ActorRef = { type: "User", id: "u1", attributes: { department: "eng", level: 5, active: true, is_editor: true } };
    const resource: ResourceRef = { type: "Document", id: "d1" };

    // Grant-based permissions that don't depend on conditions still work
    // (editor gets write via grants, no condition needed)
    expect(await engine.can(actor, "write", resource)).toBe(true);
    // But publish needs conditions -> resolver throws -> fail-closed
    expect(await engine.can(actor, "publish", resource)).toBe(false);
  });

  // ─── Env passing through engine ─────────────────────────────────────

  it("passes env to condition evaluator via CheckOptions", async () => {
    const ENV_POLICY = `
version: "1"
actors:
  User:
    attributes:
      is_editor: boolean
resources:
  Document:
    roles: [editor]
    permissions: [write]
    grants:
      editor: []
    derived_roles:
      - role: editor
        when:
          "$actor.is_editor": true
    rules:
      - effect: permit
        roles: [editor]
        permissions: [write]
        when:
          "$env.feature_flags":
            includes: "advanced_editing"
`;
    const policy = await loadYaml(ENV_POLICY);
    const engine = createToride({ policy });
    const actor: ActorRef = { type: "User", id: "u1", attributes: { is_editor: true } };
    const resource: ResourceRef = { type: "Document", id: "d1" };

    // Without env containing the flag, should deny
    expect(await engine.can(actor, "write", resource)).toBe(false);

    // With env containing the flag, should allow
    expect(await engine.can(actor, "write", resource, {
      env: { feature_flags: ["advanced_editing", "dark_mode"] },
    })).toBe(true);

    // With env containing wrong flag, should deny
    expect(await engine.can(actor, "write", resource, {
      env: { feature_flags: ["dark_mode"] },
    })).toBe(false);
  });

  // ─── AttributeCache integration: deduplicates resolver calls ─────────

  it("caches resolver calls within a single can() check", async () => {
    const policy = await loadYaml(POLICY_YAML);
    let resolverCallCount = 0;
    const resolvers: Resolvers = {
      Document: async (ref) => {
        resolverCallCount++;
        return { locked: false, archived: false };
      },
    };
    const engine = createToride({ policy, resolvers });
    const actor: ActorRef = { type: "User", id: "u1", attributes: { department: "eng", level: 10, active: true, is_admin: true } };
    const resource: ResourceRef = { type: "Document", id: "d1" };

    // Multiple rules for "delete" will resolve attributes, but cache should deduplicate
    resolverCallCount = 0;
    await engine.can(actor, "delete", resource);
    // With cache, resolver for Document:d1 should be called at most once
    expect(resolverCallCount).toBeLessThanOrEqual(1);
  });

  // ─── Backward compatibility: policies without rules ─────────────────

  it("works with policies that have no rules (backward compat)", async () => {
    const SIMPLE_POLICY = `
version: "1"
actors:
  User:
    attributes:
      is_editor: boolean
resources:
  Task:
    roles: [editor]
    permissions: [read, write]
    grants:
      editor: [read, write]
    derived_roles:
      - role: editor
        when:
          "$actor.is_editor": true
`;
    const policy = await loadYaml(SIMPLE_POLICY);
    const engine = createToride({ policy });
    const actor: ActorRef = { type: "User", id: "u1", attributes: { is_editor: true } };
    const resource: ResourceRef = { type: "Task", id: "t1" };

    expect(await engine.can(actor, "read", resource)).toBe(true);
    expect(await engine.can(actor, "write", resource)).toBe(true);
  });
});
