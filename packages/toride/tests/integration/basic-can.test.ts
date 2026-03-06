// T026: Integration tests for basic can() scenarios

import { describe, it, expect, beforeAll } from "vitest";
import type {
  ActorRef,
  ResourceRef,
  RelationResolver,
  Policy,
} from "../../src/types.js";

describe("basic can() integration", () => {
  let createToride: (options: import("../../src/types.js").TorideOptions) => {
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
      email: string
resources:
  Task:
    roles: [viewer, editor, admin]
    permissions: [read, update, delete]
    grants:
      viewer: [read]
      editor: [read, update]
      admin: [all]
`;

  function makeResolver(roleMap: Record<string, string[]>): RelationResolver {
    return {
      getRoles: async (actor: ActorRef, resource: ResourceRef) => {
        const key = `${actor.id}:${resource.type}:${resource.id}`;
        return roleMap[key] ?? [];
      },
      getRelated: async () => [],
      getAttributes: async () => ({}),
    };
  }

  // Acceptance Scenario 1: Editor with [read, update] -> can("update") = true
  it("allows update for actor with editor role", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolver = makeResolver({ "u1:Task:42": ["editor"] });
    const engine = createToride({ policy, resolver });
    const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
    const resource: ResourceRef = { type: "Task", id: "42" };

    expect(await engine.can(actor, "update", resource)).toBe(true);
    expect(await engine.can(actor, "read", resource)).toBe(true);
  });

  // Acceptance Scenario 2: Viewer with [read] -> can("update") = false
  it("denies update for actor with viewer role", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolver = makeResolver({ "u1:Task:42": ["viewer"] });
    const engine = createToride({ policy, resolver });
    const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
    const resource: ResourceRef = { type: "Task", id: "42" };

    expect(await engine.can(actor, "update", resource)).toBe(false);
    expect(await engine.can(actor, "read", resource)).toBe(true);
  });

  // Acceptance Scenario 3: No role -> can("read") = false (default deny)
  it("denies read for actor with no roles (default deny)", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolver = makeResolver({}); // no roles for anyone
    const engine = createToride({ policy, resolver });
    const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
    const resource: ResourceRef = { type: "Task", id: "42" };

    expect(await engine.can(actor, "read", resource)).toBe(false);
    expect(await engine.can(actor, "update", resource)).toBe(false);
    expect(await engine.can(actor, "delete", resource)).toBe(false);
  });

  // Acceptance Scenario 4: Role with [all] -> every declared permission = true
  it("grants all declared permissions when role has [all]", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolver = makeResolver({ "u1:Task:42": ["admin"] });
    const engine = createToride({ policy, resolver });
    const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
    const resource: ResourceRef = { type: "Task", id: "42" };

    expect(await engine.can(actor, "read", resource)).toBe(true);
    expect(await engine.can(actor, "update", resource)).toBe(true);
    expect(await engine.can(actor, "delete", resource)).toBe(true);
  });

  it("denies access when resolver throws (fail-closed)", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const failingResolver: RelationResolver = {
      getRoles: async () => { throw new Error("DB down"); },
      getRelated: async () => [],
      getAttributes: async () => ({}),
    };
    const engine = createToride({ policy, resolver: failingResolver });
    const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
    const resource: ResourceRef = { type: "Task", id: "42" };

    expect(await engine.can(actor, "read", resource)).toBe(false);
  });

  it("denies access for unknown resource type", async () => {
    const policy = await loadYaml(POLICY_YAML);
    const resolver = makeResolver({ "u1:Unknown:1": ["editor"] });
    const engine = createToride({ policy, resolver });
    const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
    const resource: ResourceRef = { type: "Unknown", id: "1" };

    expect(await engine.can(actor, "read", resource)).toBe(false);
  });

  it("works with Toride class directly", async () => {
    const { Toride } = await import("../../src/engine.js");
    const policy = await loadYaml(POLICY_YAML);
    const resolver = makeResolver({ "u1:Task:42": ["editor"] });
    const engine = new Toride({ policy, resolver });
    const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
    const resource: ResourceRef = { type: "Task", id: "42" };

    expect(await engine.can(actor, "update", resource)).toBe(true);
  });
});
