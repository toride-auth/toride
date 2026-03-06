// T044: Unit tests for rule engine with permit/forbid rules
// Covers permit/forbid evaluation, forbid-wins precedence, roles-only guard,
// custom evaluators, and fail-closed semantics.

import { describe, it, expect, beforeAll } from "vitest";
import type {
  ActorRef,
  ResourceRef,
  RelationResolver,
  ResourceBlock,
  ExplainResult,
  Policy,
  EvaluatorFn,
} from "../../../src/types.js";

describe("evaluate (rules)", () => {
  let evaluateRaw: (
    actor: ActorRef,
    action: string,
    resource: ResourceRef,
    resourceBlock: ResourceBlock,
    resolver: RelationResolver,
    policy: Policy,
    options?: {
      maxDerivedRoleDepth?: number;
      maxConditionDepth?: number;
      customEvaluators?: Record<string, EvaluatorFn>;
      env?: Record<string, unknown>;
    },
  ) => Promise<ExplainResult>;

  beforeAll(async () => {
    const mod = await import("../../../src/evaluation/rule-engine.js");
    evaluateRaw = mod.evaluate;
  });

  const actor: ActorRef = {
    type: "User",
    id: "u1",
    attributes: { department: "engineering", level: 5, active: true },
  };
  const resource: ResourceRef = { type: "Document", id: "d1" };

  function makeResolver(config: {
    roles?: string[];
    attributes?: Record<string, Record<string, unknown>>;
    related?: Record<string, ResourceRef | ResourceRef[]>;
  }): RelationResolver {
    return {
      getRoles: async () => config.roles ?? [],
      getRelated: async (res: ResourceRef, rel: string) => {
        const key = `${res.type}:${res.id}:${rel}`;
        return config.related?.[key] ?? [];
      },
      getAttributes: async (ref: ResourceRef) => {
        const key = `${ref.type}:${ref.id}`;
        return config.attributes?.[key] ?? {};
      },
    };
  }

  // ─── Permit rule grants conditional access ──────────────────────────

  describe("permit rules", () => {
    const blockWithPermitRule: ResourceBlock = {
      roles: ["editor", "viewer"],
      permissions: ["read", "write", "delete"],
      grants: {
        editor: ["read"],
        viewer: ["read"],
      },
      rules: [
        {
          effect: "permit",
          roles: ["editor"],
          permissions: ["write"],
          when: { "$resource.status": "draft" },
        },
      ],
    };

    const policy: Policy = {
      version: "1",
      actors: { User: { attributes: {} } },
      resources: { Document: blockWithPermitRule },
    };

    it("grants permission via permit rule when condition matches", async () => {
      const resolver = makeResolver({
        roles: ["editor"],
        attributes: { "Document:d1": { status: "draft" } },
      });
      const result = await evaluateRaw(actor, "write", resource, blockWithPermitRule, resolver, policy);
      expect(result.allowed).toBe(true);
      expect(result.matchedRules).toHaveLength(1);
      expect(result.matchedRules[0].effect).toBe("permit");
      expect(result.matchedRules[0].matched).toBe(true);
    });

    it("denies when permit rule condition does not match", async () => {
      const resolver = makeResolver({
        roles: ["editor"],
        attributes: { "Document:d1": { status: "published" } },
      });
      const result = await evaluateRaw(actor, "write", resource, blockWithPermitRule, resolver, policy);
      expect(result.allowed).toBe(false);
    });

    it("denies when actor does not have required role for permit rule", async () => {
      const resolver = makeResolver({
        roles: ["viewer"],
        attributes: { "Document:d1": { status: "draft" } },
      });
      const result = await evaluateRaw(actor, "write", resource, blockWithPermitRule, resolver, policy);
      expect(result.allowed).toBe(false);
    });
  });

  // ─── Forbid rule overrides grants (forbid-wins) ─────────────────────

  describe("forbid rules (forbid-wins)", () => {
    const blockWithForbid: ResourceBlock = {
      roles: ["editor", "admin"],
      permissions: ["read", "write", "delete"],
      grants: {
        editor: ["read", "write"],
        admin: ["all"],
      },
      rules: [
        {
          effect: "forbid",
          permissions: ["delete"],
          when: { "$resource.locked": true },
        },
      ],
    };

    const policy: Policy = {
      version: "1",
      actors: { User: { attributes: {} } },
      resources: { Document: blockWithForbid },
    };

    it("forbid rule overrides grant when condition matches", async () => {
      const resolver = makeResolver({
        roles: ["admin"],
        attributes: { "Document:d1": { locked: true } },
      });
      const result = await evaluateRaw(actor, "delete", resource, blockWithForbid, resolver, policy);
      expect(result.allowed).toBe(false);
      expect(result.matchedRules.some((r) => r.effect === "forbid" && r.matched)).toBe(true);
    });

    it("allows when forbid condition does not match", async () => {
      const resolver = makeResolver({
        roles: ["admin"],
        attributes: { "Document:d1": { locked: false } },
      });
      const result = await evaluateRaw(actor, "delete", resource, blockWithForbid, resolver, policy);
      expect(result.allowed).toBe(true);
    });

    it("forbid only applies to specified permissions", async () => {
      const resolver = makeResolver({
        roles: ["admin"],
        attributes: { "Document:d1": { locked: true } },
      });
      // read should still be allowed
      const result = await evaluateRaw(actor, "read", resource, blockWithForbid, resolver, policy);
      expect(result.allowed).toBe(true);
    });
  });

  // ─── Forbid-wins precedence over permit ─────────────────────────────

  describe("forbid-wins precedence", () => {
    const blockBothRules: ResourceBlock = {
      roles: ["editor"],
      permissions: ["read", "write"],
      grants: {
        editor: ["read"],
      },
      rules: [
        {
          effect: "permit",
          roles: ["editor"],
          permissions: ["write"],
          when: { "$actor.active": true },
        },
        {
          effect: "forbid",
          permissions: ["write"],
          when: { "$resource.frozen": true },
        },
      ],
    };

    const policy: Policy = {
      version: "1",
      actors: { User: { attributes: {} } },
      resources: { Document: blockBothRules },
    };

    it("forbid wins even when permit also matches", async () => {
      const resolver = makeResolver({
        roles: ["editor"],
        attributes: { "Document:d1": { frozen: true } },
      });
      const result = await evaluateRaw(actor, "write", resource, blockBothRules, resolver, policy);
      expect(result.allowed).toBe(false);
    });

    it("permit works when forbid does not match", async () => {
      const resolver = makeResolver({
        roles: ["editor"],
        attributes: { "Document:d1": { frozen: false } },
      });
      const result = await evaluateRaw(actor, "write", resource, blockBothRules, resolver, policy);
      expect(result.allowed).toBe(true);
    });
  });

  // ─── Roles-only guard (T050) ────────────────────────────────────────

  describe("roles-only guard", () => {
    const blockWithRolesGuard: ResourceBlock = {
      roles: ["editor", "viewer"],
      permissions: ["read", "write"],
      grants: {
        viewer: ["read"],
      },
      rules: [
        {
          effect: "permit",
          roles: ["editor"],
          permissions: ["write"],
          when: { "$resource.status": "draft" },
        },
      ],
    };

    const policy: Policy = {
      version: "1",
      actors: { User: { attributes: {} } },
      resources: { Document: blockWithRolesGuard },
    };

    it("skips permit rule when actor lacks required role", async () => {
      const resolver = makeResolver({
        roles: ["viewer"],
        attributes: { "Document:d1": { status: "draft" } },
      });
      const result = await evaluateRaw(actor, "write", resource, blockWithRolesGuard, resolver, policy);
      expect(result.allowed).toBe(false);
    });

    it("evaluates permit rule when actor has required role", async () => {
      const resolver = makeResolver({
        roles: ["editor"],
        attributes: { "Document:d1": { status: "draft" } },
      });
      const result = await evaluateRaw(actor, "write", resource, blockWithRolesGuard, resolver, policy);
      expect(result.allowed).toBe(true);
    });
  });

  // ─── Forbid rules without roles guard ───────────────────────────────

  describe("forbid rules without roles guard", () => {
    const blockForbidNoRoles: ResourceBlock = {
      roles: ["admin"],
      permissions: ["delete"],
      grants: {
        admin: ["delete"],
      },
      rules: [
        {
          effect: "forbid",
          // No roles: applies to all actors
          permissions: ["delete"],
          when: { "$resource.protected": true },
        },
      ],
    };

    const policy: Policy = {
      version: "1",
      actors: { User: { attributes: {} } },
      resources: { Document: blockForbidNoRoles },
    };

    it("forbid without roles guard applies to all actors", async () => {
      const resolver = makeResolver({
        roles: ["admin"],
        attributes: { "Document:d1": { protected: true } },
      });
      const result = await evaluateRaw(actor, "delete", resource, blockForbidNoRoles, resolver, policy);
      expect(result.allowed).toBe(false);
    });
  });

  // ─── Custom evaluator in rules (T051) ───────────────────────────────

  describe("custom evaluator in rules", () => {
    const blockWithCustom: ResourceBlock = {
      roles: ["editor"],
      permissions: ["write"],
      grants: {
        editor: ["write"],
      },
      rules: [
        {
          effect: "forbid",
          permissions: ["write"],
          when: { "$resource.status": { custom: "isWeekend" } },
        },
      ],
    };

    const policy: Policy = {
      version: "1",
      actors: { User: { attributes: {} } },
      resources: { Document: blockWithCustom },
    };

    it("uses custom evaluator in condition", async () => {
      const isWeekend: EvaluatorFn = async () => true;
      const resolver = makeResolver({
        roles: ["editor"],
        attributes: { "Document:d1": { status: "active" } },
      });
      const result = await evaluateRaw(actor, "write", resource, blockWithCustom, resolver, policy, {
        customEvaluators: { isWeekend },
      });
      expect(result.allowed).toBe(false); // forbid matched
    });

    it("allows when custom evaluator returns false", async () => {
      const isWeekend: EvaluatorFn = async () => false;
      const resolver = makeResolver({
        roles: ["editor"],
        attributes: { "Document:d1": { status: "active" } },
      });
      const result = await evaluateRaw(actor, "write", resource, blockWithCustom, resolver, policy, {
        customEvaluators: { isWeekend },
      });
      expect(result.allowed).toBe(true);
    });
  });

  // ─── Existing grant evaluation still works ──────────────────────────

  describe("backwards compatibility", () => {
    const blockNoRules: ResourceBlock = {
      roles: ["editor"],
      permissions: ["read", "write"],
      grants: {
        editor: ["read", "write"],
      },
    };

    const policy: Policy = {
      version: "1",
      actors: { User: { attributes: {} } },
      resources: { Document: blockNoRules },
    };

    it("grants via grants map when no rules defined", async () => {
      const resolver = makeResolver({ roles: ["editor"] });
      const result = await evaluateRaw(actor, "read", resource, blockNoRules, resolver, policy);
      expect(result.allowed).toBe(true);
    });

    it("denies via grants map when no rules defined", async () => {
      const resolver = makeResolver({ roles: [] });
      const result = await evaluateRaw(actor, "read", resource, blockNoRules, resolver, policy);
      expect(result.allowed).toBe(false);
    });
  });
});
