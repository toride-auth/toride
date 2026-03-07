// T044: Unit tests for rule engine with permit/forbid rules
// Updated for AttributeCache (Phase 3)
// Covers permit/forbid evaluation, forbid-wins precedence, roles-only guard,
// custom evaluators, and fail-closed semantics.
// FR-008: roles are derived via derived_roles, not getRoles.

import { describe, it, expect, beforeAll } from "vitest";
import type {
  ActorRef,
  ResourceRef,
  ResourceBlock,
  ExplainResult,
  Policy,
  EvaluatorFn,
  Resolvers,
} from "../types.js";
import { AttributeCache } from "./cache.js";

describe("evaluate (rules)", () => {
  let evaluateRaw: (
    actor: ActorRef,
    action: string,
    resource: ResourceRef,
    resourceBlock: ResourceBlock,
    cache: AttributeCache,
    policy: Policy,
    options?: {
      maxDerivedRoleDepth?: number;
      maxConditionDepth?: number;
      customEvaluators?: Record<string, EvaluatorFn>;
      env?: Record<string, unknown>;
    },
  ) => Promise<ExplainResult>;

  beforeAll(async () => {
    const mod = await import("./rule-engine.js");
    evaluateRaw = mod.evaluate;
  });

  const actor: ActorRef = {
    type: "User",
    id: "u1",
    attributes: { department: "engineering", level: 5, active: true, is_editor: true, is_admin: true, is_viewer: true },
  };
  const resource: ResourceRef = { type: "Document", id: "d1" };

  function makeCache(attrMap: Record<string, Record<string, unknown>>): AttributeCache {
    const typeSet = new Set<string>();
    for (const key of Object.keys(attrMap)) {
      const ci = key.indexOf(":");
      if (ci > 0) typeSet.add(key.substring(0, ci));
    }
    const resolvers: Resolvers = {};
    for (const type of typeSet) {
      resolvers[type] = async (ref) => attrMap[`${ref.type}:${ref.id}`] ?? {};
    }
    return new AttributeCache(resolvers);
  }

  /** Helper: add derived_roles to a resource block for specific roles based on actor attributes. */
  function withDerivedRoles(block: ResourceBlock, roles: string[]): ResourceBlock {
    return {
      ...block,
      derived_roles: roles.map((role) => ({
        role,
        when: { [`$actor.is_${role}`]: true },
      })),
    };
  }

  // ─── Permit rule grants conditional access ──────────────────────────

  describe("permit rules", () => {
    const baseBlock: ResourceBlock = {
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

    it("grants permission via permit rule when condition matches", async () => {
      const block = withDerivedRoles(baseBlock, ["editor"]);
      const policy: Policy = { version: "1", actors: { User: { attributes: {} } }, resources: { Document: block } };
      const cache = makeCache({ "Document:d1": { status: "draft" } });
      const result = await evaluateRaw(actor, "write", resource, block, cache, policy);
      expect(result.allowed).toBe(true);
      expect(result.matchedRules).toHaveLength(1);
      expect(result.matchedRules[0].effect).toBe("permit");
      expect(result.matchedRules[0].matched).toBe(true);
    });

    it("denies when permit rule condition does not match", async () => {
      const block = withDerivedRoles(baseBlock, ["editor"]);
      const policy: Policy = { version: "1", actors: { User: { attributes: {} } }, resources: { Document: block } };
      const cache = makeCache({ "Document:d1": { status: "published" } });
      const result = await evaluateRaw(actor, "write", resource, block, cache, policy);
      expect(result.allowed).toBe(false);
    });

    it("denies when actor does not have required role for permit rule", async () => {
      const block = withDerivedRoles(baseBlock, ["viewer"]);
      const policy: Policy = { version: "1", actors: { User: { attributes: {} } }, resources: { Document: block } };
      const cache = makeCache({ "Document:d1": { status: "draft" } });
      const result = await evaluateRaw(actor, "write", resource, block, cache, policy);
      expect(result.allowed).toBe(false);
    });
  });

  // ─── Forbid rule overrides grants (forbid-wins) ─────────────────────

  describe("forbid rules (forbid-wins)", () => {
    const baseBlock: ResourceBlock = {
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

    it("forbid rule overrides grant when condition matches", async () => {
      const block = withDerivedRoles(baseBlock, ["admin"]);
      const policy: Policy = { version: "1", actors: { User: { attributes: {} } }, resources: { Document: block } };
      const cache = makeCache({ "Document:d1": { locked: true } });
      const result = await evaluateRaw(actor, "delete", resource, block, cache, policy);
      expect(result.allowed).toBe(false);
      expect(result.matchedRules.some((r) => r.effect === "forbid" && r.matched)).toBe(true);
    });

    it("allows when forbid condition does not match", async () => {
      const block = withDerivedRoles(baseBlock, ["admin"]);
      const policy: Policy = { version: "1", actors: { User: { attributes: {} } }, resources: { Document: block } };
      const cache = makeCache({ "Document:d1": { locked: false } });
      const result = await evaluateRaw(actor, "delete", resource, block, cache, policy);
      expect(result.allowed).toBe(true);
    });

    it("forbid only applies to specified permissions", async () => {
      const block = withDerivedRoles(baseBlock, ["admin"]);
      const policy: Policy = { version: "1", actors: { User: { attributes: {} } }, resources: { Document: block } };
      const cache = makeCache({ "Document:d1": { locked: true } });
      const result = await evaluateRaw(actor, "read", resource, block, cache, policy);
      expect(result.allowed).toBe(true);
    });
  });

  // ─── Forbid-wins precedence over permit ─────────────────────────────

  describe("forbid-wins precedence", () => {
    const baseBlock: ResourceBlock = {
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

    it("forbid wins even when permit also matches", async () => {
      const block = withDerivedRoles(baseBlock, ["editor"]);
      const policy: Policy = { version: "1", actors: { User: { attributes: {} } }, resources: { Document: block } };
      const cache = makeCache({ "Document:d1": { frozen: true } });
      const result = await evaluateRaw(actor, "write", resource, block, cache, policy);
      expect(result.allowed).toBe(false);
    });

    it("permit works when forbid does not match", async () => {
      const block = withDerivedRoles(baseBlock, ["editor"]);
      const policy: Policy = { version: "1", actors: { User: { attributes: {} } }, resources: { Document: block } };
      const cache = makeCache({ "Document:d1": { frozen: false } });
      const result = await evaluateRaw(actor, "write", resource, block, cache, policy);
      expect(result.allowed).toBe(true);
    });
  });

  // ─── Roles-only guard (T050) ────────────────────────────────────────

  describe("roles-only guard", () => {
    const baseBlock: ResourceBlock = {
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

    it("skips permit rule when actor lacks required role", async () => {
      const block = withDerivedRoles(baseBlock, ["viewer"]);
      const policy: Policy = { version: "1", actors: { User: { attributes: {} } }, resources: { Document: block } };
      const cache = makeCache({ "Document:d1": { status: "draft" } });
      const result = await evaluateRaw(actor, "write", resource, block, cache, policy);
      expect(result.allowed).toBe(false);
    });

    it("evaluates permit rule when actor has required role", async () => {
      const block = withDerivedRoles(baseBlock, ["editor"]);
      const policy: Policy = { version: "1", actors: { User: { attributes: {} } }, resources: { Document: block } };
      const cache = makeCache({ "Document:d1": { status: "draft" } });
      const result = await evaluateRaw(actor, "write", resource, block, cache, policy);
      expect(result.allowed).toBe(true);
    });
  });

  // ─── Custom evaluator in rules (T051) ───────────────────────────────

  describe("custom evaluator in rules", () => {
    const baseBlock: ResourceBlock = {
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

    it("uses custom evaluator in condition", async () => {
      const isWeekend: EvaluatorFn = async () => true;
      const block = withDerivedRoles(baseBlock, ["editor"]);
      const policy: Policy = { version: "1", actors: { User: { attributes: {} } }, resources: { Document: block } };
      const cache = makeCache({ "Document:d1": { status: "active" } });
      const result = await evaluateRaw(actor, "write", resource, block, cache, policy, {
        customEvaluators: { isWeekend },
      });
      expect(result.allowed).toBe(false); // forbid matched
    });

    it("allows when custom evaluator returns false", async () => {
      const isWeekend: EvaluatorFn = async () => false;
      const block = withDerivedRoles(baseBlock, ["editor"]);
      const policy: Policy = { version: "1", actors: { User: { attributes: {} } }, resources: { Document: block } };
      const cache = makeCache({ "Document:d1": { status: "active" } });
      const result = await evaluateRaw(actor, "write", resource, block, cache, policy, {
        customEvaluators: { isWeekend },
      });
      expect(result.allowed).toBe(true);
    });
  });

  // ─── Existing grant evaluation still works ──────────────────────────

  describe("grants without rules", () => {
    const blockNoRules: ResourceBlock = {
      roles: ["editor"],
      permissions: ["read", "write"],
      grants: {
        editor: ["read", "write"],
      },
    };

    it("grants via grants map when actor has derived role", async () => {
      const block = withDerivedRoles(blockNoRules, ["editor"]);
      const policy: Policy = { version: "1", actors: { User: { attributes: {} } }, resources: { Document: block } };
      const cache = makeCache({});
      const result = await evaluateRaw(actor, "read", resource, block, cache, policy);
      expect(result.allowed).toBe(true);
    });

    it("denies via grants map when actor has no roles", async () => {
      const actorNoFlags: ActorRef = { type: "User", id: "u1", attributes: {} };
      const block = withDerivedRoles(blockNoRules, ["editor"]);
      const policy: Policy = { version: "1", actors: { User: { attributes: {} } }, resources: { Document: block } };
      const cache = makeCache({});
      const result = await evaluateRaw(actorNoFlags, "read", resource, block, cache, policy);
      expect(result.allowed).toBe(false);
    });
  });
});
