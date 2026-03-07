// T024: Unit tests for role resolution (direct roles)
// FR-008: getRoles removed. Direct roles always empty.

import { describe, it, expect, beforeAll } from "vitest";
import type { ActorRef, ResourceRef } from "../types.js";
import { AttributeCache } from "./cache.js";

describe("resolveDirectRoles", () => {
  let resolveDirectRoles: (
    actor: ActorRef,
    resource: ResourceRef,
    cache: AttributeCache,
  ) => Promise<import("../types.js").ResolvedRolesDetail>;

  beforeAll(async () => {
    const mod = await import("./role-resolver.js");
    resolveDirectRoles = mod.resolveDirectRoles;
  });

  const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
  const resource: ResourceRef = { type: "Task", id: "42" };

  it("returns empty direct roles (FR-008: getRoles removed)", async () => {
    const cache = new AttributeCache({});
    const result = await resolveDirectRoles(actor, resource, cache);
    expect(result.direct).toEqual([]);
    expect(result.derived).toEqual([]);
  });
});
