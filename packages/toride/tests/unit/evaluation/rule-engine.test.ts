// T025: Unit tests for grant evaluation (role-to-permission mapping, `all` keyword)

import { describe, it, expect, beforeAll } from "vitest";
import type {
  ActorRef,
  ResourceRef,
  RelationResolver,
  ResourceBlock,
  ExplainResult,
} from "../../../src/types.js";

describe("evaluate (grant evaluation)", () => {
  let evaluate: (
    actor: ActorRef,
    action: string,
    resource: ResourceRef,
    resourceBlock: ResourceBlock,
    resolver: RelationResolver,
  ) => Promise<ExplainResult>;

  beforeAll(async () => {
    const mod = await import("../../../src/evaluation/rule-engine.js");
    evaluate = mod.evaluate;
  });

  const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
  const resource: ResourceRef = { type: "Task", id: "42" };

  function makeResolver(roles: string[]): RelationResolver {
    return {
      getRoles: async () => roles,
      getRelated: async () => [],
      getAttributes: async () => ({}),
    };
  }

  const taskBlock: ResourceBlock = {
    roles: ["editor", "viewer", "admin"],
    permissions: ["read", "update", "delete"],
    grants: {
      editor: ["read", "update"],
      viewer: ["read"],
      admin: ["all"],
    },
  };

  it("grants permission when role has explicit permission", async () => {
    const result = await evaluate(actor, "update", resource, taskBlock, makeResolver(["editor"]));
    expect(result.allowed).toBe(true);
    expect(result.grantedPermissions).toContain("update");
  });

  it("denies permission when role does not have the permission", async () => {
    const result = await evaluate(actor, "update", resource, taskBlock, makeResolver(["viewer"]));
    expect(result.allowed).toBe(false);
  });

  it("denies permission when actor has no roles (default deny)", async () => {
    const result = await evaluate(actor, "read", resource, taskBlock, makeResolver([]));
    expect(result.allowed).toBe(false);
    expect(result.grantedPermissions).toEqual([]);
  });

  it("resolves 'all' keyword to all declared permissions", async () => {
    const result = await evaluate(actor, "delete", resource, taskBlock, makeResolver(["admin"]));
    expect(result.allowed).toBe(true);
    expect(result.grantedPermissions).toContain("read");
    expect(result.grantedPermissions).toContain("update");
    expect(result.grantedPermissions).toContain("delete");
  });

  it("resolves 'all' keyword for every declared permission", async () => {
    for (const perm of ["read", "update", "delete"]) {
      const result = await evaluate(actor, perm, resource, taskBlock, makeResolver(["admin"]));
      expect(result.allowed).toBe(true);
    }
  });

  it("merges permissions from multiple roles", async () => {
    const result = await evaluate(actor, "update", resource, taskBlock, makeResolver(["viewer", "editor"]));
    expect(result.allowed).toBe(true);
    expect(result.grantedPermissions).toContain("read");
    expect(result.grantedPermissions).toContain("update");
  });

  it("denies when role not in grants map", async () => {
    const result = await evaluate(actor, "read", resource, taskBlock, makeResolver(["unknown_role"]));
    expect(result.allowed).toBe(false);
    expect(result.grantedPermissions).toEqual([]);
  });

  it("handles resource with no grants defined", async () => {
    const blockNoGrants: ResourceBlock = {
      roles: ["editor"],
      permissions: ["read"],
    };
    const result = await evaluate(actor, "read", resource, blockNoGrants, makeResolver(["editor"]));
    expect(result.allowed).toBe(false);
  });

  it("returns ExplainResult with resolvedRoles detail", async () => {
    const result = await evaluate(actor, "read", resource, taskBlock, makeResolver(["editor"]));
    expect(result.resolvedRoles.direct).toEqual(["editor"]);
    expect(result.resolvedRoles.derived).toEqual([]);
    expect(result.matchedRules).toEqual([]);
    expect(result.finalDecision).toBeDefined();
  });
});
