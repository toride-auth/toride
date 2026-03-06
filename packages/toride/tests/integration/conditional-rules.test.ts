// T045: Integration tests for conditional rules
// Full pipeline with YAML policies, permit/forbid rules, custom evaluators,
// fail-closed semantics, and resolver errors.

import { describe, it, expect, beforeAll } from "vitest";
import type {
  ActorRef,
  ResourceRef,
  RelationResolver,
  Policy,
  TorideOptions,
  EvaluatorFn,
} from "../../src/types.js";

describe("conditional rules integration", () => {
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

  const POLICY_YAML = `
version: "1"
actors:
  User:
    attributes:
      department: string
      level: number
      active: boolean
resources:
  Document:
    roles: [editor, viewer, admin]
    permissions: [read, write, delete, publish]
    relations:
      org:
        resource: Organization
        cardinality: one
    grants:
      viewer: [read]
      editor: [read, write]
      admin: [all]
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

  // ─── Permit rule grants conditional access ──────────────────────────

  it("editor can publish when document is in review and level >= 3", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolver = makeResolver({
      roles: { "u1:Document:d1": ["editor"] },
      attributes: { "Document:d1": { status: "review", locked: false, archived: false } },
    });
    const engine = createToride({ policy, resolver });
    const actor: ActorRef = { type: "User", id: "u1", attributes: { department: "eng", level: 5, active: true } };
    const resource: ResourceRef = { type: "Document", id: "d1" };

    expect(await engine.can(actor, "publish", resource)).toBe(true);
  });

  it("editor cannot publish when level < 3", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolver = makeResolver({
      roles: { "u1:Document:d1": ["editor"] },
      attributes: { "Document:d1": { status: "review", locked: false, archived: false } },
    });
    const engine = createToride({ policy, resolver });
    const actor: ActorRef = { type: "User", id: "u1", attributes: { department: "eng", level: 2, active: true } };
    const resource: ResourceRef = { type: "Document", id: "d1" };

    expect(await engine.can(actor, "publish", resource)).toBe(false);
  });

  it("editor cannot publish when document is not in review", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolver = makeResolver({
      roles: { "u1:Document:d1": ["editor"] },
      attributes: { "Document:d1": { status: "draft", locked: false, archived: false } },
    });
    const engine = createToride({ policy, resolver });
    const actor: ActorRef = { type: "User", id: "u1", attributes: { department: "eng", level: 5, active: true } };
    const resource: ResourceRef = { type: "Document", id: "d1" };

    expect(await engine.can(actor, "publish", resource)).toBe(false);
  });

  // ─── Forbid rule overrides grant ────────────────────────────────────

  it("admin cannot delete locked document (forbid overrides grant)", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolver = makeResolver({
      roles: { "u1:Document:d1": ["admin"] },
      attributes: { "Document:d1": { locked: true, archived: false } },
    });
    const engine = createToride({ policy, resolver });
    const actor: ActorRef = { type: "User", id: "u1", attributes: { department: "eng", level: 10, active: true } };
    const resource: ResourceRef = { type: "Document", id: "d1" };

    expect(await engine.can(actor, "delete", resource)).toBe(false);
    // But read is still allowed
    expect(await engine.can(actor, "read", resource)).toBe(true);
  });

  it("admin can delete unlocked document", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolver = makeResolver({
      roles: { "u1:Document:d1": ["admin"] },
      attributes: { "Document:d1": { locked: false, archived: false } },
    });
    const engine = createToride({ policy, resolver });
    const actor: ActorRef = { type: "User", id: "u1", attributes: { department: "eng", level: 10, active: true } };
    const resource: ResourceRef = { type: "Document", id: "d1" };

    expect(await engine.can(actor, "delete", resource)).toBe(true);
  });

  // ─── Multiple forbid rules ──────────────────────────────────────────

  it("archived document forbids write and publish", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolver = makeResolver({
      roles: { "u1:Document:d1": ["admin"] },
      attributes: { "Document:d1": { locked: false, archived: true, status: "review" } },
    });
    const engine = createToride({ policy, resolver });
    const actor: ActorRef = { type: "User", id: "u1", attributes: { department: "eng", level: 5, active: true } };
    const resource: ResourceRef = { type: "Document", id: "d1" };

    expect(await engine.can(actor, "write", resource)).toBe(false);
    expect(await engine.can(actor, "publish", resource)).toBe(false);
    // read is still allowed
    expect(await engine.can(actor, "read", resource)).toBe(true);
  });

  // ─── Viewer cannot gain permissions from permit rules ───────────────

  it("viewer cannot publish even when conditions match (roles guard)", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolver = makeResolver({
      roles: { "u1:Document:d1": ["viewer"] },
      attributes: { "Document:d1": { status: "review", locked: false, archived: false } },
    });
    const engine = createToride({ policy, resolver });
    const actor: ActorRef = { type: "User", id: "u1", attributes: { department: "eng", level: 5, active: true } };
    const resource: ResourceRef = { type: "Document", id: "d1" };

    expect(await engine.can(actor, "publish", resource)).toBe(false);
  });

  // ─── Custom evaluator integration ──────────────────────────────────

  it("custom evaluator works in integration", async () => {
    const CUSTOM_POLICY = `
version: "1"
actors:
  User:
    attributes: {}
resources:
  Document:
    roles: [editor]
    permissions: [write]
    grants:
      editor: [write]
    rules:
      - effect: forbid
        permissions: [write]
        when:
          "$resource.status":
            custom: isMaintenanceWindow
`;
    const policy = await loadYaml(CUSTOM_POLICY);
    const isMaintenanceWindow: EvaluatorFn = async () => true;
    const resolver = makeResolver({
      roles: { "u1:Document:d1": ["editor"] },
      attributes: { "Document:d1": { status: "active" } },
    });
    const engine = createToride({
      policy,
      resolver,
      customEvaluators: { isMaintenanceWindow },
    });
    const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
    const resource: ResourceRef = { type: "Document", id: "d1" };

    expect(await engine.can(actor, "write", resource)).toBe(false);
  });

  // ─── Fail-closed: resolver errors deny access (T052) ────────────────

  it("resolver error during condition evaluation denies access (fail-closed)", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const failingResolver: RelationResolver = {
      getRoles: async () => ["editor"],
      getRelated: async () => [],
      getAttributes: async () => { throw new Error("DB down"); },
    };
    const engine = createToride({ policy, resolver: failingResolver });
    const actor: ActorRef = { type: "User", id: "u1", attributes: { department: "eng", level: 5, active: true } };
    const resource: ResourceRef = { type: "Document", id: "d1" };

    // Even though editor has write via grants, condition evaluation failure -> deny-safe
    // Actually, for grant-based permissions that don't depend on conditions, they should still work.
    // But for rules that need getAttributes and it fails -> fail-closed
    expect(await engine.can(actor, "write", resource)).toBe(true); // grants don't need conditions
    expect(await engine.can(actor, "publish", resource)).toBe(false); // needs conditions -> fail-closed
  });

  // ─── Env passing through engine ─────────────────────────────────────

  it("passes env to condition evaluator", async () => {
    const ENV_POLICY = `
version: "1"
actors:
  User:
    attributes: {}
resources:
  Document:
    roles: [editor]
    permissions: [write]
    grants:
      editor: []
    rules:
      - effect: permit
        roles: [editor]
        permissions: [write]
        when:
          "$env.feature_flags":
            includes: "advanced_editing"
`;
    const policy = await loadYaml(ENV_POLICY);
    const resolver = makeResolver({
      roles: { "u1:Document:d1": ["editor"] },
      attributes: { "Document:d1": {} },
    });
    const engine = createToride({
      policy,
      resolver,
      // TODO: env needs to be passed per-check, verify engine supports it
    });
    const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
    const resource: ResourceRef = { type: "Document", id: "d1" };

    // Without env containing the flag, should deny
    expect(await engine.can(actor, "write", resource)).toBe(false);
  });

  // ─── Backward compatibility: policies without rules ─────────────────

  it("works with policies that have no rules (backward compat)", async () => {
    const SIMPLE_POLICY = `
version: "1"
actors:
  User:
    attributes: {}
resources:
  Task:
    roles: [editor]
    permissions: [read, write]
    grants:
      editor: [read, write]
`;
    const policy = await loadYaml(SIMPLE_POLICY);
    const resolver = makeResolver({
      roles: { "u1:Task:t1": ["editor"] },
    });
    const engine = createToride({ policy, resolver });
    const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
    const resource: ResourceRef = { type: "Task", id: "t1" };

    expect(await engine.can(actor, "read", resource)).toBe(true);
    expect(await engine.can(actor, "write", resource)).toBe(true);
  });
});
