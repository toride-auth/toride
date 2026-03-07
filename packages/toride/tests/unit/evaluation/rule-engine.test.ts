// T025: Unit tests for grant evaluation (role-to-permission mapping, `all` keyword)
// Updated for AttributeCache (Phase 3)

import { describe, it, expect, beforeAll } from "vitest";
import type {
  ActorRef,
  ResourceRef,
  ResourceBlock,
  ExplainResult,
  Policy,
} from "../../../src/types.js";
import { AttributeCache } from "../../../src/evaluation/cache.js";

describe("evaluate (grant evaluation)", () => {
  let evaluateRaw: (
    actor: ActorRef,
    action: string,
    resource: ResourceRef,
    resourceBlock: ResourceBlock,
    cache: AttributeCache,
    policy: Policy,
    options?: { maxDerivedRoleDepth?: number },
  ) => Promise<ExplainResult>;

  beforeAll(async () => {
    const mod = await import("../../../src/evaluation/rule-engine.js");
    evaluateRaw = mod.evaluate;
  });

  const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
  const resource: ResourceRef = { type: "Task", id: "42" };

  /**
   * Since getRoles is removed (FR-008), roles must be derived.
   * For simple grant-based tests, we use derived_roles with when conditions.
   * For tests that just check the grant expansion, we use a policy where
   * the actor gets a role via a global_role or when condition.
   */
  function makeCache(): AttributeCache {
    return new AttributeCache({});
  }

  function makeBlockWithDerivedRole(roleName: string): ResourceBlock {
    return {
      ...taskBlock,
      derived_roles: [
        {
          role: roleName,
          // Pattern 5: when-only with actor attribute match
          when: { "$actor.is_test": true },
        },
      ],
    };
  }

  const actorWithFlag: ActorRef = { type: "User", id: "u1", attributes: { is_test: true } };

  const taskBlock: ResourceBlock = {
    roles: ["editor", "viewer", "admin"],
    permissions: ["read", "update", "delete"],
    grants: {
      editor: ["read", "update"],
      viewer: ["read"],
      admin: ["all"],
    },
  };

  const minimalPolicy: Policy = {
    version: "1",
    actors: { User: { attributes: {} } },
    resources: { Task: taskBlock },
  };

  function evaluate(
    a: ActorRef,
    action: string,
    r: ResourceRef,
    block: ResourceBlock,
    cache: AttributeCache,
  ): Promise<ExplainResult> {
    return evaluateRaw(a, action, r, block, cache, {
      ...minimalPolicy,
      resources: { [r.type]: block },
    });
  }

  it("grants permission when actor has derived role with explicit permission", async () => {
    const block = makeBlockWithDerivedRole("editor");
    const result = await evaluate(actorWithFlag, "update", resource, block, makeCache());
    expect(result.allowed).toBe(true);
    expect(result.grantedPermissions).toContain("update");
  });

  it("denies permission when derived role does not have the permission", async () => {
    const block = makeBlockWithDerivedRole("viewer");
    const result = await evaluate(actorWithFlag, "update", resource, block, makeCache());
    expect(result.allowed).toBe(false);
  });

  it("denies permission when actor has no roles (default deny)", async () => {
    const result = await evaluate(actor, "read", resource, taskBlock, makeCache());
    expect(result.allowed).toBe(false);
    expect(result.grantedPermissions).toEqual([]);
  });

  it("resolves 'all' keyword to all declared permissions", async () => {
    const block = makeBlockWithDerivedRole("admin");
    const result = await evaluate(actorWithFlag, "delete", resource, block, makeCache());
    expect(result.allowed).toBe(true);
    expect(result.grantedPermissions).toContain("read");
    expect(result.grantedPermissions).toContain("update");
    expect(result.grantedPermissions).toContain("delete");
  });

  it("resolves 'all' keyword for every declared permission", async () => {
    const block = makeBlockWithDerivedRole("admin");
    for (const perm of ["read", "update", "delete"]) {
      const result = await evaluate(actorWithFlag, perm, resource, block, makeCache());
      expect(result.allowed).toBe(true);
    }
  });

  it("merges permissions from multiple derived roles", async () => {
    const block: ResourceBlock = {
      ...taskBlock,
      derived_roles: [
        { role: "viewer", when: { "$actor.is_test": true } },
        { role: "editor", when: { "$actor.is_test": true } },
      ],
    };
    const result = await evaluate(actorWithFlag, "update", resource, block, makeCache());
    expect(result.allowed).toBe(true);
    expect(result.grantedPermissions).toContain("read");
    expect(result.grantedPermissions).toContain("update");
  });

  it("denies when derived role not in grants map", async () => {
    const block = makeBlockWithDerivedRole("unknown_role");
    const result = await evaluate(actorWithFlag, "read", resource, block, makeCache());
    expect(result.allowed).toBe(false);
    expect(result.grantedPermissions).toEqual([]);
  });

  it("handles resource with no grants defined", async () => {
    const blockNoGrants: ResourceBlock = {
      roles: ["editor"],
      permissions: ["read"],
      derived_roles: [{ role: "editor", when: { "$actor.is_test": true } }],
    };
    const result = await evaluate(actorWithFlag, "read", resource, blockNoGrants, makeCache());
    expect(result.allowed).toBe(false);
  });

  it("returns ExplainResult with resolvedRoles detail", async () => {
    const block = makeBlockWithDerivedRole("editor");
    const result = await evaluate(actorWithFlag, "read", resource, block, makeCache());
    // FR-008: direct roles always empty, roles come from derived
    expect(result.resolvedRoles.direct).toEqual([]);
    expect(result.resolvedRoles.derived.length).toBeGreaterThan(0);
    expect(result.resolvedRoles.derived[0].role).toBe("editor");
    expect(result.matchedRules).toEqual([]);
    expect(result.finalDecision).toBeDefined();
  });
});
