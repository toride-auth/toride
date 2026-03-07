// T043: Unit tests for condition expression evaluator
// Updated for AttributeCache (Phase 3)
// Covers all operators, cross-references, strict null semantics, nested property
// resolution, logical combinators, depth limits.
// Note: cardinality:many tests deferred to US3 (relation traversal via attributes).
// Note: nested relation tests adapted for attribute-based relation traversal.

import { describe, it, expect, beforeAll } from "vitest";
import type {
  ActorRef,
  ResourceRef,
  ConditionExpression,
  ResourceBlock,
  Policy,
  EvaluatorFn,
  Resolvers,
} from "../types.js";
import { AttributeCache } from "./cache.js";

describe("evaluateCondition", () => {
  let evaluateCondition: (
    condition: ConditionExpression,
    actor: ActorRef,
    resource: ResourceRef,
    cache: AttributeCache,
    env: Record<string, unknown>,
    resourceBlock: ResourceBlock,
    policy: Policy,
    options?: {
      maxConditionDepth?: number;
      maxCombinatorDepth?: number;
      customEvaluators?: Record<string, EvaluatorFn>;
      ruleEffect?: "permit" | "forbid";
    },
  ) => Promise<boolean>;

  beforeAll(async () => {
    const mod = await import("./condition.js");
    evaluateCondition = mod.evaluateCondition;
  });

  const actor: ActorRef = {
    type: "User",
    id: "u1",
    attributes: { department: "engineering", level: 5, active: true, email: "u1@example.com" },
  };
  const resource: ResourceRef = { type: "Document", id: "d1" };

  const minimalBlock: ResourceBlock = {
    roles: ["editor", "viewer"],
    permissions: ["read", "write"],
    relations: {
      org: "Organization",
    },
  };

  const minimalPolicy: Policy = {
    version: "1",
    actors: { User: { attributes: { department: "string", level: "number", active: "boolean", email: "string" } } },
    resources: {
      Document: minimalBlock,
      Organization: { roles: ["admin"], permissions: ["manage"], relations: {} },
    },
  };

  /**
   * Build an AttributeCache from a map of "Type:id" -> attributes.
   */
  function makeCache(attrMap: Record<string, Record<string, unknown>>): AttributeCache {
    // Collect types
    const typeSet = new Set<string>();
    for (const key of Object.keys(attrMap)) {
      const colonIndex = key.indexOf(":");
      if (colonIndex > 0) typeSet.add(key.substring(0, colonIndex));
    }
    const resolvers: Resolvers = {};
    for (const type of typeSet) {
      resolvers[type] = async (ref) => {
        const key = `${ref.type}:${ref.id}`;
        return attrMap[key] ?? {};
      };
    }
    return new AttributeCache(resolvers);
  }

  const defaultCache = makeCache({
    "Document:d1": { status: "published", priority: 3, tags: ["urgent", "review"], owner_dept: "engineering" },
  });

  const env: Record<string, unknown> = { region: "us-west", maxLevel: 10 };

  // ─── Equality shorthand (primitive ConditionValue) ──────────────────

  describe("equality shorthand", () => {
    it("matches $actor attribute with exact primitive value", async () => {
      const condition: ConditionExpression = { "$actor.department": "engineering" };
      expect(await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy)).toBe(true);
    });

    it("rejects $actor attribute mismatch", async () => {
      const condition: ConditionExpression = { "$actor.department": "sales" };
      expect(await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy)).toBe(false);
    });

    it("matches $resource attribute with exact primitive value", async () => {
      const condition: ConditionExpression = { "$resource.status": "published" };
      expect(await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy)).toBe(true);
    });

    it("matches $env value", async () => {
      const condition: ConditionExpression = { "$env.region": "us-west" };
      expect(await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy)).toBe(true);
    });

    it("matches boolean equality shorthand", async () => {
      const condition: ConditionExpression = { "$actor.active": true };
      expect(await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy)).toBe(true);
    });

    it("matches numeric equality shorthand", async () => {
      const condition: ConditionExpression = { "$actor.level": 5 };
      expect(await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy)).toBe(true);
    });
  });

  // ─── Operator: eq ───────────────────────────────────────────────────

  describe("eq operator", () => {
    it("matches equal values", async () => {
      const condition: ConditionExpression = { "$actor.department": { eq: "engineering" } };
      expect(await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy)).toBe(true);
    });

    it("rejects unequal values", async () => {
      const condition: ConditionExpression = { "$actor.department": { eq: "sales" } };
      expect(await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy)).toBe(false);
    });
  });

  // ─── Operator: neq ──────────────────────────────────────────────────

  describe("neq operator", () => {
    it("matches non-equal values", async () => {
      const condition: ConditionExpression = { "$actor.department": { neq: "sales" } };
      expect(await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy)).toBe(true);
    });

    it("rejects equal values", async () => {
      const condition: ConditionExpression = { "$actor.department": { neq: "engineering" } };
      expect(await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy)).toBe(false);
    });
  });

  // ─── Operator: gt, gte, lt, lte ────────────────────────────────────

  describe("comparison operators", () => {
    it("gt: true when left > right", async () => {
      const condition: ConditionExpression = { "$actor.level": { gt: 3 } };
      expect(await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy)).toBe(true);
    });

    it("gt: false when left == right", async () => {
      const condition: ConditionExpression = { "$actor.level": { gt: 5 } };
      expect(await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy)).toBe(false);
    });

    it("gte: true when left == right", async () => {
      const condition: ConditionExpression = { "$actor.level": { gte: 5 } };
      expect(await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy)).toBe(true);
    });

    it("lt: true when left < right", async () => {
      const condition: ConditionExpression = { "$actor.level": { lt: 10 } };
      expect(await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy)).toBe(true);
    });

    it("lte: true when left == right", async () => {
      const condition: ConditionExpression = { "$actor.level": { lte: 5 } };
      expect(await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy)).toBe(true);
    });

    it("lte: false when left > right", async () => {
      const condition: ConditionExpression = { "$actor.level": { lte: 3 } };
      expect(await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy)).toBe(false);
    });
  });

  // ─── Operator: in ───────────────────────────────────────────────────

  describe("in operator", () => {
    it("matches when value is in array", async () => {
      const condition: ConditionExpression = { "$actor.department": { in: ["engineering", "design"] } };
      expect(await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy)).toBe(true);
    });

    it("rejects when value is not in array", async () => {
      const condition: ConditionExpression = { "$actor.department": { in: ["sales", "marketing"] } };
      expect(await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy)).toBe(false);
    });

    it("supports cross-reference as the array (e.g., $resource.tags)", async () => {
      const condition: ConditionExpression = { "$actor.department": { in: "$resource.tags" } };
      // actor.department = "engineering", resource.tags = ["urgent", "review"] - not in
      expect(await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy)).toBe(false);
    });
  });

  // ─── Operator: includes ─────────────────────────────────────────────

  describe("includes operator", () => {
    it("matches when array includes value", async () => {
      const condition: ConditionExpression = { "$resource.tags": { includes: "urgent" } };
      expect(await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy)).toBe(true);
    });

    it("rejects when array does not include value", async () => {
      const condition: ConditionExpression = { "$resource.tags": { includes: "archived" } };
      expect(await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy)).toBe(false);
    });
  });

  // ─── Operator: exists ───────────────────────────────────────────────

  describe("exists operator", () => {
    it("exists: true when property is defined", async () => {
      const condition: ConditionExpression = { "$resource.status": { exists: true } };
      expect(await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy)).toBe(true);
    });

    it("exists: true returns false when property is undefined", async () => {
      const condition: ConditionExpression = { "$resource.nonexistent": { exists: true } };
      expect(await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy)).toBe(false);
    });

    it("exists: false when property is undefined", async () => {
      const condition: ConditionExpression = { "$resource.nonexistent": { exists: false } };
      expect(await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy)).toBe(true);
    });

    it("exists: false when property is defined", async () => {
      const condition: ConditionExpression = { "$resource.status": { exists: false } };
      expect(await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy)).toBe(false);
    });
  });

  // ─── Operator: startsWith, endsWith, contains ──────────────────────

  describe("string operators", () => {
    it("startsWith: matches", async () => {
      const condition: ConditionExpression = { "$actor.email": { startsWith: "u1@" } };
      expect(await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy)).toBe(true);
    });

    it("startsWith: no match", async () => {
      const condition: ConditionExpression = { "$actor.email": { startsWith: "admin@" } };
      expect(await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy)).toBe(false);
    });

    it("endsWith: matches", async () => {
      const condition: ConditionExpression = { "$actor.email": { endsWith: "@example.com" } };
      expect(await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy)).toBe(true);
    });

    it("contains: matches", async () => {
      const condition: ConditionExpression = { "$actor.email": { contains: "example" } };
      expect(await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy)).toBe(true);
    });

    it("contains: no match", async () => {
      const condition: ConditionExpression = { "$actor.email": { contains: "internal" } };
      expect(await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy)).toBe(false);
    });
  });

  // ─── Cross-references ($actor, $resource, $env) ────────────────────

  describe("cross-references", () => {
    it("compares $actor attribute to $resource attribute (eq cross-ref)", async () => {
      const condition: ConditionExpression = { "$actor.department": { eq: "$resource.owner_dept" } };
      expect(await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy)).toBe(true);
    });

    it("compares $actor attribute to $env value", async () => {
      const condition: ConditionExpression = { "$actor.level": { lt: "$env.maxLevel" } };
      expect(await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy)).toBe(true);
    });

    it("equality shorthand with cross-ref string", async () => {
      const condition: ConditionExpression = { "$actor.department": "$resource.owner_dept" };
      expect(await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy)).toBe(true);
    });
  });

  // ─── Logical combinators (any, all) ────────────────────────────────

  describe("logical combinators", () => {
    it("all: true when all conditions match", async () => {
      const condition: ConditionExpression = {
        all: [
          { "$actor.department": "engineering" },
          { "$actor.active": true },
        ],
      };
      expect(await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy)).toBe(true);
    });

    it("all: false when one condition fails", async () => {
      const condition: ConditionExpression = {
        all: [
          { "$actor.department": "engineering" },
          { "$actor.active": false },
        ],
      };
      expect(await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy)).toBe(false);
    });

    it("any: true when at least one condition matches", async () => {
      const condition: ConditionExpression = {
        any: [
          { "$actor.department": "sales" },
          { "$actor.active": true },
        ],
      };
      expect(await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy)).toBe(true);
    });

    it("any: false when no conditions match", async () => {
      const condition: ConditionExpression = {
        any: [
          { "$actor.department": "sales" },
          { "$actor.active": false },
        ],
      };
      expect(await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy)).toBe(false);
    });

    it("nested combinators: any inside all", async () => {
      const condition: ConditionExpression = {
        all: [
          { "$actor.active": true },
          {
            any: [
              { "$actor.department": "sales" },
              { "$actor.department": "engineering" },
            ],
          },
        ],
      };
      expect(await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy)).toBe(true);
    });
  });

  // ─── Multiple conditions ANDed (simple conditions) ──────────────────

  describe("multiple conditions ANDed", () => {
    it("all pairs must match in simple conditions", async () => {
      const condition: ConditionExpression = {
        "$actor.department": "engineering",
        "$actor.active": true,
      };
      expect(await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy)).toBe(true);
    });

    it("fails if one pair doesn't match", async () => {
      const condition: ConditionExpression = {
        "$actor.department": "engineering",
        "$actor.level": { gt: 10 },
      };
      expect(await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy)).toBe(false);
    });
  });

  // ─── Strict null semantics (T048) ──────────────────────────────────

  describe("strict null semantics", () => {
    it("returns false when $actor attribute is undefined (equality)", async () => {
      const condition: ConditionExpression = { "$actor.nonexistent": "value" };
      expect(await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy)).toBe(false);
    });

    it("returns false when $resource attribute is undefined (equality)", async () => {
      const condition: ConditionExpression = { "$resource.nonexistent": "value" };
      expect(await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy)).toBe(false);
    });

    it("returns false for comparison operators on undefined values", async () => {
      const condition: ConditionExpression = { "$actor.nonexistent": { gt: 5 } };
      expect(await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy)).toBe(false);
    });

    it("returns false for string operators on undefined values", async () => {
      const condition: ConditionExpression = { "$actor.nonexistent": { startsWith: "x" } };
      expect(await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy)).toBe(false);
    });

    it("null never equals null (strict null)", async () => {
      const nullActor: ActorRef = { type: "User", id: "u2", attributes: { department: null as unknown as string } };
      const condition: ConditionExpression = { "$actor.department": { eq: null as unknown as string } };
      expect(await evaluateCondition(condition, nullActor, resource, defaultCache, env, minimalBlock, minimalPolicy)).toBe(false);
    });
  });

  // ─── Nested property resolution (T047) ─────────────────────────────
  // Adapted for attribute-based relation traversal (US3 scope).
  // In the new model, relation targets are ResourceRef values in attributes.

  describe("nested property resolution via relations", () => {
    it("resolves $resource.org.name via attribute-based relation traversal", async () => {
      // The Document's "org" attribute is a ResourceRef pointing to Organization
      const cache = makeCache({
        "Document:d1": { status: "published", org: { type: "Organization", id: "org1" } },
        "Organization:org1": { name: "Acme" },
      });
      const condition: ConditionExpression = { "$resource.org.name": "Acme" };
      expect(await evaluateCondition(condition, actor, resource, cache, env, minimalBlock, minimalPolicy)).toBe(true);
    });

    it("returns false when nested relation attribute is missing", async () => {
      const cache = makeCache({
        "Document:d1": { status: "published" },
      });
      const condition: ConditionExpression = { "$resource.org.name": "Acme" };
      expect(await evaluateCondition(condition, actor, resource, cache, env, minimalBlock, minimalPolicy)).toBe(false);
    });
  });

  // ─── Custom evaluator (T051) ───────────────────────────────────────

  describe("custom evaluator", () => {
    it("invokes custom evaluator and returns its result", async () => {
      const customEval: EvaluatorFn = async () => true;
      const condition: ConditionExpression = { "$resource.status": { custom: "myEval" } };
      expect(
        await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy, {
          customEvaluators: { myEval: customEval },
        }),
      ).toBe(true);
    });

    it("returns false when custom evaluator returns false", async () => {
      const customEval: EvaluatorFn = async () => false;
      const condition: ConditionExpression = { "$resource.status": { custom: "myEval" } };
      expect(
        await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy, {
          customEvaluators: { myEval: customEval },
        }),
      ).toBe(false);
    });

    it("returns false when custom evaluator not found (fail-closed)", async () => {
      const condition: ConditionExpression = { "$resource.status": { custom: "unknown" } };
      expect(
        await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy, {
          customEvaluators: {},
        }),
      ).toBe(false);
    });

    it("fail-closed on custom evaluator error (permit rule)", async () => {
      const throwingEval: EvaluatorFn = async () => { throw new Error("boom"); };
      const condition: ConditionExpression = { "$resource.status": { custom: "throwEval" } };
      expect(
        await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy, {
          customEvaluators: { throwEval: throwingEval },
          ruleEffect: "permit",
        }),
      ).toBe(false);
    });

    it("fail-closed on custom evaluator error (forbid rule) -> true (deny)", async () => {
      const throwingEval: EvaluatorFn = async () => { throw new Error("boom"); };
      const condition: ConditionExpression = { "$resource.status": { custom: "throwEval" } };
      expect(
        await evaluateCondition(condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy, {
          customEvaluators: { throwEval: throwingEval },
          ruleEffect: "forbid",
        }),
      ).toBe(true);
    });
  });

  // ─── Recursion depth limit for logical combinators ──────────────────

  describe("combinator recursion depth limit", () => {
    it("returns false when combinator nesting exceeds maxCombinatorDepth", async () => {
      let condition: ConditionExpression = { "$actor.active": true };
      for (let i = 0; i < 5; i++) {
        condition = { any: [condition] };
      }
      const result = await evaluateCondition(
        condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy,
        { maxCombinatorDepth: 3 },
      );
      expect(result).toBe(false);
    });

    it("succeeds when combinator nesting is within limit", async () => {
      let condition: ConditionExpression = { "$actor.active": true };
      condition = { all: [condition] };
      condition = { any: [condition] };
      const result = await evaluateCondition(
        condition, actor, resource, defaultCache, env, minimalBlock, minimalPolicy,
      );
      expect(result).toBe(true);
    });
  });

  // ─── Depth limit for condition evaluation ──────────────────────────

  describe("depth limits", () => {
    it("respects maxConditionDepth option", async () => {
      const deepBlock: ResourceBlock = {
        roles: [],
        permissions: [],
        relations: { org: "Organization" },
      };
      const deepPolicy: Policy = {
        version: "1",
        actors: { User: { attributes: {} } },
        resources: {
          Document: deepBlock,
          Organization: {
            roles: [],
            permissions: [],
            relations: { parent: "Organization" },
          },
        },
      };
      // org attribute is a ResourceRef, and org's parent is also a ResourceRef
      const cache = makeCache({
        "Document:d1": { org: { type: "Organization", id: "org1" } },
        "Organization:org1": { parent: { type: "Organization", id: "org0" } },
        "Organization:org0": { name: "Root" },
      });
      const condition: ConditionExpression = { "$resource.org.parent.name": "Root" };
      // With depth=1, cannot traverse 2 hops
      const result = await evaluateCondition(condition, actor, resource, cache, env, deepBlock, deepPolicy, {
        maxConditionDepth: 1,
      });
      expect(result).toBe(false);
    });
  });
});
