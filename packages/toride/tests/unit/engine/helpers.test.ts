// T066: Unit tests for permittedActions(), resolvedRoles(), canBatch()

import { describe, it, expect, beforeAll, vi } from "vitest";
import type {
  ActorRef,
  ResourceRef,
  RelationResolver,
  Policy,
  TorideOptions,
  ExplainResult,
  BatchCheckItem,
  DecisionEvent,
  QueryEvent,
} from "../../../src/types.js";

describe("permittedActions(), resolvedRoles(), canBatch()", () => {
  let Toride: new (options: TorideOptions) => {
    can: (
      actor: ActorRef,
      action: string,
      resource: ResourceRef,
    ) => Promise<boolean>;
    explain: (
      actor: ActorRef,
      action: string,
      resource: ResourceRef,
    ) => Promise<ExplainResult>;
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

  // ─── permittedActions() ─────────────────────────────────────────────

  describe("permittedActions()", () => {
    it("returns all permitted actions for a role", async () => {
      const policy = await loadYaml(POLICY_YAML);
      const resolver = makeResolver({ roles: { "u1:Task:42": ["editor"] } });
      const engine = new Toride({ policy, resolver });
      const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
      const resource: ResourceRef = { type: "Task", id: "42" };

      const actions = await engine.permittedActions(actor, resource);

      expect(actions).toContain("read");
      expect(actions).toContain("update");
      expect(actions).not.toContain("delete");
    });

    it("returns all permissions for admin with [all] grant", async () => {
      const policy = await loadYaml(POLICY_YAML);
      const resolver = makeResolver({ roles: { "u1:Task:42": ["admin"] } });
      const engine = new Toride({ policy, resolver });
      const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
      const resource: ResourceRef = { type: "Task", id: "42" };

      const actions = await engine.permittedActions(actor, resource);

      expect(actions).toContain("read");
      expect(actions).toContain("update");
      expect(actions).toContain("delete");
    });

    it("returns empty array when no roles match", async () => {
      const policy = await loadYaml(POLICY_YAML);
      const resolver = makeResolver({});
      const engine = new Toride({ policy, resolver });
      const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
      const resource: ResourceRef = { type: "Task", id: "42" };

      const actions = await engine.permittedActions(actor, resource);

      expect(actions).toEqual([]);
    });

    it("returns empty array for unknown resource type", async () => {
      const policy = await loadYaml(POLICY_YAML);
      const resolver = makeResolver({});
      const engine = new Toride({ policy, resolver });
      const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
      const resource: ResourceRef = { type: "Unknown", id: "1" };

      const actions = await engine.permittedActions(actor, resource);

      expect(actions).toEqual([]);
    });
  });

  // ─── resolvedRoles() ───────────────────────────────────────────────

  describe("resolvedRoles()", () => {
    it("returns flat list of direct roles", async () => {
      const policy = await loadYaml(POLICY_YAML);
      const resolver = makeResolver({ roles: { "u1:Task:42": ["editor"] } });
      const engine = new Toride({ policy, resolver });
      const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
      const resource: ResourceRef = { type: "Task", id: "42" };

      const roles = await engine.resolvedRoles(actor, resource);

      expect(roles).toContain("editor");
      expect(Array.isArray(roles)).toBe(true);
    });

    it("includes derived roles in flat list", async () => {
      const policy = await loadYaml(POLICY_YAML);
      const resolver = makeResolver({});
      const engine = new Toride({ policy, resolver });
      const actor: ActorRef = {
        type: "User",
        id: "u1",
        attributes: { isSuperAdmin: true },
      };
      const resource: ResourceRef = { type: "Task", id: "42" };

      const roles = await engine.resolvedRoles(actor, resource);

      expect(roles).toContain("admin");
    });

    it("returns deduplicated roles", async () => {
      const policy = await loadYaml(POLICY_YAML);
      const resolver = makeResolver({ roles: { "u1:Task:42": ["admin"] } });
      const engine = new Toride({ policy, resolver });
      const actor: ActorRef = {
        type: "User",
        id: "u1",
        attributes: { isSuperAdmin: true },
      };
      const resource: ResourceRef = { type: "Task", id: "42" };

      const roles = await engine.resolvedRoles(actor, resource);

      // admin appears as both direct and derived, but should be deduplicated
      const adminCount = roles.filter((r: string) => r === "admin").length;
      expect(adminCount).toBe(1);
    });

    it("returns empty array for unknown resource type", async () => {
      const policy = await loadYaml(POLICY_YAML);
      const resolver = makeResolver({});
      const engine = new Toride({ policy, resolver });
      const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
      const resource: ResourceRef = { type: "Unknown", id: "1" };

      const roles = await engine.resolvedRoles(actor, resource);

      expect(roles).toEqual([]);
    });
  });

  // ─── canBatch() ────────────────────────────────────────────────────

  describe("canBatch()", () => {
    it("returns boolean array matching check order", async () => {
      const policy = await loadYaml(POLICY_YAML);
      const resolver = makeResolver({ roles: { "u1:Task:42": ["editor"] } });
      const engine = new Toride({ policy, resolver });
      const actor: ActorRef = { type: "User", id: "u1", attributes: {} };

      const results = await engine.canBatch(actor, [
        { action: "read", resource: { type: "Task", id: "42" } },
        { action: "update", resource: { type: "Task", id: "42" } },
        { action: "delete", resource: { type: "Task", id: "42" } },
      ]);

      expect(results).toEqual([true, true, false]);
    });

    it("returns empty array for empty checks", async () => {
      const policy = await loadYaml(POLICY_YAML);
      const resolver = makeResolver({});
      const engine = new Toride({ policy, resolver });
      const actor: ActorRef = { type: "User", id: "u1", attributes: {} };

      const results = await engine.canBatch(actor, []);

      expect(results).toEqual([]);
    });

    it("shares resolver cache across batch checks", async () => {
      const policy = await loadYaml(POLICY_YAML);
      const getRolesSpy = vi.fn(
        async (actor: ActorRef, resource: ResourceRef) => {
          const key = `${actor.id}:${resource.type}:${resource.id}`;
          if (key === "u1:Task:42") return ["editor"];
          return [];
        },
      );
      const resolver: RelationResolver = {
        getRoles: getRolesSpy,
        getRelated: async () => [],
        getAttributes: async () => ({}),
      };
      const engine = new Toride({ policy, resolver });
      const actor: ActorRef = { type: "User", id: "u1", attributes: {} };

      await engine.canBatch(actor, [
        { action: "read", resource: { type: "Task", id: "42" } },
        { action: "update", resource: { type: "Task", id: "42" } },
        { action: "delete", resource: { type: "Task", id: "42" } },
      ]);

      // With cache sharing, getRoles should only be called once per unique resource
      // (the cache deduplicates calls to the same resource)
      expect(getRolesSpy).toHaveBeenCalledTimes(1);
    });

    it("handles mixed resource types in batch", async () => {
      const policy = await loadYaml(POLICY_YAML);
      const resolver = makeResolver({ roles: { "u1:Task:42": ["editor"] } });
      const engine = new Toride({ policy, resolver });
      const actor: ActorRef = { type: "User", id: "u1", attributes: {} };

      const results = await engine.canBatch(actor, [
        { action: "read", resource: { type: "Task", id: "42" } },
        { action: "read", resource: { type: "Unknown", id: "1" } },
      ]);

      expect(results).toEqual([true, false]);
    });
  });

  // ─── onDecision audit callback ─────────────────────────────────────

  describe("onDecision audit callback", () => {
    it("fires onDecision callback after can() call", async () => {
      const policy = await loadYaml(POLICY_YAML);
      const resolver = makeResolver({ roles: { "u1:Task:42": ["editor"] } });
      const decisions: DecisionEvent[] = [];
      const engine = new Toride({
        policy,
        resolver,
        onDecision: (event) => decisions.push(event),
      });
      const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
      const resource: ResourceRef = { type: "Task", id: "42" };

      await engine.can(actor, "update", resource);
      // Wait for microtask to fire
      await new Promise((resolve) => queueMicrotask(resolve));

      expect(decisions).toHaveLength(1);
      expect(decisions[0].actor).toBe(actor);
      expect(decisions[0].action).toBe("update");
      expect(decisions[0].resource).toBe(resource);
      expect(decisions[0].allowed).toBe(true);
      expect(decisions[0].timestamp).toBeInstanceOf(Date);
      expect(decisions[0].resolvedRoles).toContain("editor");
    });

    it("fires onDecision callback after explain() call", async () => {
      const policy = await loadYaml(POLICY_YAML);
      const resolver = makeResolver({ roles: { "u1:Task:42": ["editor"] } });
      const decisions: DecisionEvent[] = [];
      const engine = new Toride({
        policy,
        resolver,
        onDecision: (event) => decisions.push(event),
      });
      const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
      const resource: ResourceRef = { type: "Task", id: "42" };

      await engine.explain(actor, "update", resource);
      await new Promise((resolve) => queueMicrotask(resolve));

      expect(decisions).toHaveLength(1);
      expect(decisions[0].allowed).toBe(true);
    });

    it("does not block on callback errors", async () => {
      const policy = await loadYaml(POLICY_YAML);
      const resolver = makeResolver({ roles: { "u1:Task:42": ["editor"] } });
      const engine = new Toride({
        policy,
        resolver,
        onDecision: () => {
          throw new Error("audit failure");
        },
      });
      const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
      const resource: ResourceRef = { type: "Task", id: "42" };

      // Should not throw even though callback throws
      const result = await engine.can(actor, "update", resource);
      expect(result).toBe(true);
    });

    it("fires onDecision for each check in canBatch()", async () => {
      const policy = await loadYaml(POLICY_YAML);
      const resolver = makeResolver({ roles: { "u1:Task:42": ["editor"] } });
      const decisions: DecisionEvent[] = [];
      const engine = new Toride({
        policy,
        resolver,
        onDecision: (event) => decisions.push(event),
      });
      const actor: ActorRef = { type: "User", id: "u1", attributes: {} };

      await engine.canBatch(actor, [
        { action: "read", resource: { type: "Task", id: "42" } },
        { action: "delete", resource: { type: "Task", id: "42" } },
      ]);
      await new Promise((resolve) => queueMicrotask(resolve));

      expect(decisions).toHaveLength(2);
    });
  });

  // ─── onQuery audit callback ────────────────────────────────────────

  describe("onQuery audit callback", () => {
    it("fires onQuery callback after buildConstraints() call", async () => {
      const policy = await loadYaml(POLICY_YAML);
      const resolver = makeResolver({ roles: { "u1:Task:42": ["editor"] } });
      const queries: QueryEvent[] = [];
      const engine = new Toride({
        policy,
        resolver,
        onQuery: (event) => queries.push(event),
      });
      const actor: ActorRef = { type: "User", id: "u1", attributes: {} };

      await engine.buildConstraints(actor, "read", "Task");
      await new Promise((resolve) => queueMicrotask(resolve));

      expect(queries).toHaveLength(1);
      expect(queries[0].actor).toBe(actor);
      expect(queries[0].action).toBe("read");
      expect(queries[0].resourceType).toBe("Task");
      expect(queries[0].timestamp).toBeInstanceOf(Date);
    });

    it("does not block on callback errors", async () => {
      const policy = await loadYaml(POLICY_YAML);
      const resolver = makeResolver({ roles: { "u1:Task:42": ["editor"] } });
      const engine = new Toride({
        policy,
        resolver,
        onQuery: () => {
          throw new Error("audit failure");
        },
      });
      const actor: ActorRef = { type: "User", id: "u1", attributes: {} };

      // Should not throw
      const result = await engine.buildConstraints(actor, "read", "Task");
      expect(result).toBeDefined();
    });
  });
});
