// T065: Unit tests for explain() output structure

import { describe, it, expect, beforeAll } from "vitest";
import type {
  ActorRef,
  ResourceRef,
  RelationResolver,
  Policy,
  TorideOptions,
  ExplainResult,
} from "../../../src/types.js";

describe("explain() output structure", () => {
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
      isSuperAdmin: boolean
resources:
  Task:
    roles: [viewer, editor, admin]
    permissions: [read, update, delete]
    grants:
      viewer: [read]
      editor: [read, update]
      admin: [all]
    derived_roles:
      - role: admin
        from_global_role: superadmin
global_roles:
  superadmin:
    actor_type: User
    when:
      "$actor.isSuperAdmin": true
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

  it("returns ExplainResult with correct shape", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolver = makeResolver({ roles: { "u1:Task:42": ["editor"] } });
    const engine = new Toride({ policy, resolver });
    const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
    const resource: ResourceRef = { type: "Task", id: "42" };

    const result = await engine.explain(actor, "update", resource);

    expect(result).toHaveProperty("allowed");
    expect(result).toHaveProperty("resolvedRoles");
    expect(result).toHaveProperty("grantedPermissions");
    expect(result).toHaveProperty("matchedRules");
    expect(result).toHaveProperty("finalDecision");
  });

  it("shows direct roles in resolvedRoles", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolver = makeResolver({ roles: { "u1:Task:42": ["editor"] } });
    const engine = new Toride({ policy, resolver });
    const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
    const resource: ResourceRef = { type: "Task", id: "42" };

    const result = await engine.explain(actor, "update", resource);

    expect(result.resolvedRoles.direct).toContain("editor");
    expect(result.resolvedRoles.derived).toEqual([]);
  });

  it("shows derived roles with derivation paths", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolver = makeResolver({});
    const engine = new Toride({ policy, resolver });
    const actor: ActorRef = {
      type: "User",
      id: "u1",
      attributes: { isSuperAdmin: true },
    };
    const resource: ResourceRef = { type: "Task", id: "42" };

    const result = await engine.explain(actor, "read", resource);

    expect(result.allowed).toBe(true);
    expect(result.resolvedRoles.derived).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "admin",
          via: expect.stringContaining("global_role:superadmin"),
        }),
      ]),
    );
  });

  it("shows grantedPermissions from role grants", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolver = makeResolver({ roles: { "u1:Task:42": ["editor"] } });
    const engine = new Toride({ policy, resolver });
    const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
    const resource: ResourceRef = { type: "Task", id: "42" };

    const result = await engine.explain(actor, "update", resource);

    expect(result.grantedPermissions).toContain("read");
    expect(result.grantedPermissions).toContain("update");
    expect(result.grantedPermissions).not.toContain("delete");
  });

  it("provides human-readable finalDecision for allowed action", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolver = makeResolver({ roles: { "u1:Task:42": ["editor"] } });
    const engine = new Toride({ policy, resolver });
    const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
    const resource: ResourceRef = { type: "Task", id: "42" };

    const result = await engine.explain(actor, "update", resource);

    expect(result.allowed).toBe(true);
    expect(result.finalDecision).toMatch(/allowed/i);
  });

  it("provides human-readable finalDecision for denied action", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolver = makeResolver({ roles: { "u1:Task:42": ["viewer"] } });
    const engine = new Toride({ policy, resolver });
    const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
    const resource: ResourceRef = { type: "Task", id: "42" };

    const result = await engine.explain(actor, "delete", resource);

    expect(result.allowed).toBe(false);
    expect(result.finalDecision).toMatch(/denied/i);
  });

  it("shows unknown resource type in finalDecision", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolver = makeResolver({});
    const engine = new Toride({ policy, resolver });
    const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
    const resource: ResourceRef = { type: "Unknown", id: "1" };

    const result = await engine.explain(actor, "read", resource);

    expect(result.allowed).toBe(false);
    expect(result.finalDecision).toMatch(/unknown resource type/i);
  });

  it("explain() and can() agree on the decision", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolver = makeResolver({ roles: { "u1:Task:42": ["editor"] } });
    const engine = new Toride({ policy, resolver });
    const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
    const resource: ResourceRef = { type: "Task", id: "42" };

    const explainResult = await engine.explain(actor, "update", resource);
    const canResult = await engine.can(actor, "update", resource);

    expect(explainResult.allowed).toBe(canResult);
  });
});
