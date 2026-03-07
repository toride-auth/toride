// T066: Unit tests for permittedActions(), resolvedRoles(), canBatch()
// Updated for Resolvers map / AttributeCache (Phase 3)

import { describe, it, expect, beforeAll, vi } from "vitest";
import type {
  ActorRef,
  ResourceRef,
  Resolvers,
  Policy,
  TorideOptions,
  ExplainResult,
  BatchCheckItem,
  DecisionEvent,
  QueryEvent,
} from "./types.js";

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
    const engineMod = await import("./engine.js");
    Toride = engineMod.Toride as typeof Toride;
    const parserMod = await import("./policy/parser.js");
    loadYaml = parserMod.loadYaml;
  });

  // Policy uses derived_roles to assign roles from actor attributes
  const POLICY_YAML = `
version: "1"
actors:
  User:
    attributes:
      isSuperAdmin: boolean
      is_editor: boolean
      is_viewer: boolean
      is_admin: boolean
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
      - role: editor
        when:
          "$actor.is_editor": true
      - role: viewer
        when:
          "$actor.is_viewer": true
      - role: admin
        when:
          "$actor.is_admin": true
global_roles:
  superadmin:
    actor_type: User
    when:
      "$actor.isSuperAdmin": true
`;

  // ─── permittedActions() ─────────────────────────────────────────────

  describe("permittedActions()", () => {
    it("returns all permitted actions for a role", async () => {
      const policy = await loadYaml(POLICY_YAML);
      const engine = new Toride({ policy });
      const actor: ActorRef = { type: "User", id: "u1", attributes: { is_editor: true } };
      const resource: ResourceRef = { type: "Task", id: "42" };

      const actions = await engine.permittedActions(actor, resource);

      expect(actions).toContain("read");
      expect(actions).toContain("update");
      expect(actions).not.toContain("delete");
    });

    it("returns all permissions for admin with [all] grant", async () => {
      const policy = await loadYaml(POLICY_YAML);
      const engine = new Toride({ policy });
      const actor: ActorRef = { type: "User", id: "u1", attributes: { is_admin: true } };
      const resource: ResourceRef = { type: "Task", id: "42" };

      const actions = await engine.permittedActions(actor, resource);

      expect(actions).toContain("read");
      expect(actions).toContain("update");
      expect(actions).toContain("delete");
    });

    it("returns empty array when no roles match", async () => {
      const policy = await loadYaml(POLICY_YAML);
      const engine = new Toride({ policy });
      const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
      const resource: ResourceRef = { type: "Task", id: "42" };

      const actions = await engine.permittedActions(actor, resource);

      expect(actions).toEqual([]);
    });

    it("returns empty array for unknown resource type", async () => {
      const policy = await loadYaml(POLICY_YAML);
      const engine = new Toride({ policy });
      const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
      const resource: ResourceRef = { type: "Unknown", id: "1" };

      const actions = await engine.permittedActions(actor, resource);

      expect(actions).toEqual([]);
    });
  });

  // ─── resolvedRoles() ───────────────────────────────────────────────

  describe("resolvedRoles()", () => {
    it("returns derived roles in flat list", async () => {
      const policy = await loadYaml(POLICY_YAML);
      const engine = new Toride({ policy });
      const actor: ActorRef = { type: "User", id: "u1", attributes: { is_editor: true } };
      const resource: ResourceRef = { type: "Task", id: "42" };

      const roles = await engine.resolvedRoles(actor, resource);

      expect(roles).toContain("editor");
      expect(Array.isArray(roles)).toBe(true);
    });

    it("includes derived roles from global role", async () => {
      const policy = await loadYaml(POLICY_YAML);
      const engine = new Toride({ policy });
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
      const engine = new Toride({ policy });
      const actor: ActorRef = {
        type: "User",
        id: "u1",
        attributes: { isSuperAdmin: true, is_admin: true },
      };
      const resource: ResourceRef = { type: "Task", id: "42" };

      const roles = await engine.resolvedRoles(actor, resource);

      // admin appears from both global_role and when condition, but should be deduplicated
      const adminCount = roles.filter((r: string) => r === "admin").length;
      expect(adminCount).toBe(1);
    });

    it("returns empty array for unknown resource type", async () => {
      const policy = await loadYaml(POLICY_YAML);
      const engine = new Toride({ policy });
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
      const engine = new Toride({ policy });
      const actor: ActorRef = { type: "User", id: "u1", attributes: { is_editor: true } };

      const results = await engine.canBatch(actor, [
        { action: "read", resource: { type: "Task", id: "42" } },
        { action: "update", resource: { type: "Task", id: "42" } },
        { action: "delete", resource: { type: "Task", id: "42" } },
      ]);

      expect(results).toEqual([true, true, false]);
    });

    it("returns empty array for empty checks", async () => {
      const policy = await loadYaml(POLICY_YAML);
      const engine = new Toride({ policy });
      const actor: ActorRef = { type: "User", id: "u1", attributes: {} };

      const results = await engine.canBatch(actor, []);

      expect(results).toEqual([]);
    });

    it("shares resolver cache across batch checks", async () => {
      // Use a policy with a $resource condition rule so the resolver is actually invoked
      const policyWithResourceRule = await loadYaml(`
version: "1"
actors:
  User:
    attributes:
      is_editor: boolean
resources:
  Task:
    roles: [editor]
    permissions: [read, update, delete]
    grants:
      editor: [read, update]
    derived_roles:
      - role: editor
        when:
          "$actor.is_editor": true
    rules:
      - effect: forbid
        permissions: [update]
        when:
          "$resource.status": "archived"
`);
      const taskResolverSpy = vi.fn(async () => ({ status: "active" }));
      const resolvers: Resolvers = {
        Task: taskResolverSpy,
      };
      const engine = new Toride({ policy: policyWithResourceRule, resolvers });
      const actor: ActorRef = { type: "User", id: "u1", attributes: { is_editor: true } };

      await engine.canBatch(actor, [
        { action: "read", resource: { type: "Task", id: "42" } },
        { action: "update", resource: { type: "Task", id: "42" } },
        { action: "delete", resource: { type: "Task", id: "42" } },
      ]);

      // With cache sharing, Task resolver for id=42 should be called at most once
      expect(taskResolverSpy).toHaveBeenCalledTimes(1);
    });

    it("handles mixed resource types in batch", async () => {
      const policy = await loadYaml(POLICY_YAML);
      const engine = new Toride({ policy });
      const actor: ActorRef = { type: "User", id: "u1", attributes: { is_editor: true } };

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
      const decisions: DecisionEvent[] = [];
      const engine = new Toride({
        policy,
        onDecision: (event) => decisions.push(event),
      });
      const actor: ActorRef = { type: "User", id: "u1", attributes: { is_editor: true } };
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
      const decisions: DecisionEvent[] = [];
      const engine = new Toride({
        policy,
        onDecision: (event) => decisions.push(event),
      });
      const actor: ActorRef = { type: "User", id: "u1", attributes: { is_editor: true } };
      const resource: ResourceRef = { type: "Task", id: "42" };

      await engine.explain(actor, "update", resource);
      await new Promise((resolve) => queueMicrotask(resolve));

      expect(decisions).toHaveLength(1);
      expect(decisions[0].allowed).toBe(true);
    });

    it("does not block on callback errors", async () => {
      const policy = await loadYaml(POLICY_YAML);
      const engine = new Toride({
        policy,
        onDecision: () => {
          throw new Error("audit failure");
        },
      });
      const actor: ActorRef = { type: "User", id: "u1", attributes: { is_editor: true } };
      const resource: ResourceRef = { type: "Task", id: "42" };

      // Should not throw even though callback throws
      const result = await engine.can(actor, "update", resource);
      expect(result).toBe(true);
    });

    it("fires onDecision for each check in canBatch()", async () => {
      const policy = await loadYaml(POLICY_YAML);
      const decisions: DecisionEvent[] = [];
      const engine = new Toride({
        policy,
        onDecision: (event) => decisions.push(event),
      });
      const actor: ActorRef = { type: "User", id: "u1", attributes: { is_editor: true } };

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
      const queries: QueryEvent[] = [];
      const engine = new Toride({
        policy,
        onQuery: (event) => queries.push(event),
      });
      const actor: ActorRef = { type: "User", id: "u1", attributes: { is_editor: true } };

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
      const engine = new Toride({
        policy,
        onQuery: () => {
          throw new Error("audit failure");
        },
      });
      const actor: ActorRef = { type: "User", id: "u1", attributes: { is_editor: true } };

      // Should not throw
      const result = await engine.buildConstraints(actor, "read", "Task");
      expect(result).toBeDefined();
    });
  });
});
