// T024: Unit tests for role resolution (direct roles only)

import { describe, it, expect, beforeAll } from "vitest";
import type { ActorRef, ResourceRef, RelationResolver } from "../../../src/types.js";

describe("resolveDirectRoles", () => {
  let resolveDirectRoles: (
    actor: ActorRef,
    resource: ResourceRef,
    resolver: RelationResolver,
  ) => Promise<import("../../../src/types.js").ResolvedRolesDetail>;

  beforeAll(async () => {
    const mod = await import("../../../src/evaluation/role-resolver.js");
    resolveDirectRoles = mod.resolveDirectRoles;
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

  it("returns direct roles from resolver", async () => {
    const result = await resolveDirectRoles(actor, resource, makeResolver(["editor", "viewer"]));
    expect(result.direct).toEqual(["editor", "viewer"]);
    expect(result.derived).toEqual([]);
  });

  it("returns empty direct roles when actor has no roles", async () => {
    const result = await resolveDirectRoles(actor, resource, makeResolver([]));
    expect(result.direct).toEqual([]);
    expect(result.derived).toEqual([]);
  });

  it("returns empty roles when resolver throws an error (fail-closed)", async () => {
    const failingResolver: RelationResolver = {
      getRoles: async () => { throw new Error("DB connection failed"); },
      getRelated: async () => [],
      getAttributes: async () => ({}),
    };
    const result = await resolveDirectRoles(actor, resource, failingResolver);
    expect(result.direct).toEqual([]);
    expect(result.derived).toEqual([]);
  });

  it("returns single role correctly", async () => {
    const result = await resolveDirectRoles(actor, resource, makeResolver(["admin"]));
    expect(result.direct).toEqual(["admin"]);
    expect(result.derived).toEqual([]);
  });
});
