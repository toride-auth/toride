// T034: Unit tests for cycle detection and depth limit enforcement
// Updated for AttributeCache (Phase 3)

import { describe, it, expect, beforeAll } from "vitest";
import type {
  ActorRef,
  ResourceRef,
  Resolvers,
  Policy,
  ResourceBlock,
  ResolvedRolesDetail,
} from "../../../src/types.js";
import { CycleError, DepthLimitError } from "../../../src/types.js";
import { AttributeCache } from "../../../src/evaluation/cache.js";

describe("cycle detection and depth limits", () => {
  let resolveRoles: (
    actor: ActorRef,
    resource: ResourceRef,
    cache: AttributeCache,
    resourceBlock: ResourceBlock,
    policy: Policy,
    options?: { maxDerivedRoleDepth?: number },
  ) => Promise<ResolvedRolesDetail>;

  beforeAll(async () => {
    const mod = await import("../../../src/evaluation/role-resolver.js");
    resolveRoles = mod.resolveRoles;
  });

  const actor: ActorRef = { type: "User", id: "u1", attributes: {} };

  function makeCache(attrs: Record<string, Record<string, unknown>> = {}): AttributeCache {
    const typeSet = new Set<string>();
    for (const key of Object.keys(attrs)) {
      const ci = key.indexOf(":");
      if (ci > 0) typeSet.add(key.substring(0, ci));
    }
    const resolvers: Resolvers = {};
    for (const type of typeSet) {
      resolvers[type] = async (ref) => {
        const key = `${ref.type}:${ref.id}`;
        return attrs[key] ?? {};
      };
    }
    return new AttributeCache(resolvers);
  }

  // ─── Cycle Detection ──────────────────────────────────────────────

  describe("cycle detection", () => {
    it("throws CycleError when A references B which references A", async () => {
      // A derives admin from B's admin on relation "parent"
      // B derives admin from A's admin on relation "parent"
      const policy: Policy = {
        version: "1",
        actors: { User: { attributes: {} } },
        resources: {
          ResourceA: {
            roles: ["admin"],
            permissions: ["read"],
            relations: {
              parent: "ResourceB",
            },
            derived_roles: [
              { role: "admin", from_role: "admin", on_relation: "parent" },
            ],
          },
          ResourceB: {
            roles: ["admin"],
            permissions: ["read"],
            relations: {
              parent: "ResourceA",
            },
            derived_roles: [
              { role: "admin", from_role: "admin", on_relation: "parent" },
            ],
          },
        },
      };

      const cache = makeCache({
        "ResourceA:a1": { parent: { type: "ResourceB", id: "b1" } },
        "ResourceB:b1": { parent: { type: "ResourceA", id: "a1" } },
      });

      const resourceA: ResourceRef = { type: "ResourceA", id: "a1" };
      const blockA = policy.resources["ResourceA"]!;

      await expect(
        resolveRoles(actor, resourceA, cache, blockA, policy),
      ).rejects.toThrow(CycleError);
    });

    it("throws CycleError with the cycle path", async () => {
      const policy: Policy = {
        version: "1",
        actors: { User: { attributes: {} } },
        resources: {
          ResourceA: {
            roles: ["admin"],
            permissions: ["read"],
            relations: {
              parent: "ResourceB",
            },
            derived_roles: [
              { role: "admin", from_role: "admin", on_relation: "parent" },
            ],
          },
          ResourceB: {
            roles: ["admin"],
            permissions: ["read"],
            relations: {
              parent: "ResourceA",
            },
            derived_roles: [
              { role: "admin", from_role: "admin", on_relation: "parent" },
            ],
          },
        },
      };

      const cache = makeCache({
        "ResourceA:a1": { parent: { type: "ResourceB", id: "b1" } },
        "ResourceB:b1": { parent: { type: "ResourceA", id: "a1" } },
      });

      const resourceA: ResourceRef = { type: "ResourceA", id: "a1" };
      const blockA = policy.resources["ResourceA"]!;

      try {
        await resolveRoles(actor, resourceA, cache, blockA, policy);
        expect.fail("Should have thrown CycleError");
      } catch (e) {
        expect(e).toBeInstanceOf(CycleError);
        const cycleError = e as CycleError;
        expect(cycleError.path).toContain("ResourceA:a1");
      }
    });

    it("handles self-referencing relation (A -> A)", async () => {
      const policy: Policy = {
        version: "1",
        actors: { User: { attributes: {} } },
        resources: {
          Folder: {
            roles: ["admin"],
            permissions: ["read"],
            relations: {
              parent: "Folder",
            },
            derived_roles: [
              { role: "admin", from_role: "admin", on_relation: "parent" },
            ],
          },
        },
      };

      // Folder f1 points to itself
      const cache = makeCache({
        "Folder:f1": { parent: { type: "Folder", id: "f1" } },
      });

      const folderRef: ResourceRef = { type: "Folder", id: "f1" };
      const folderBlock = policy.resources["Folder"]!;

      await expect(
        resolveRoles(actor, folderRef, cache, folderBlock, policy),
      ).rejects.toThrow(CycleError);
    });
  });

  // ─── Depth Limit ───────────────────────────────────────────────────

  describe("depth limit", () => {
    it("throws DepthLimitError when chain exceeds default depth of 5", async () => {
      // Create a chain: Res0 -> Res1 -> Res2 -> Res3 -> Res4 -> Res5 -> Res6
      const resources: Record<string, ResourceBlock> = {};
      const attrs: Record<string, Record<string, unknown>> = {};

      for (let i = 0; i <= 6; i++) {
        const resName = `Res${i}`;
        resources[resName] = {
          roles: ["admin"],
          permissions: ["read"],
          ...(i < 6
            ? {
                relations: {
                  parent: `Res${i + 1}`,
                },
                derived_roles: [
                  { role: "admin", from_role: "admin", on_relation: "parent" },
                ],
              }
            : {}),
        };
        if (i < 6) {
          attrs[`Res${i}:r${i}`] = { parent: { type: `Res${i + 1}`, id: `r${i + 1}` } };
        }
      }

      const policy: Policy = {
        version: "1",
        actors: { User: { attributes: {} } },
        resources,
      };

      const cache = makeCache(attrs);
      const startRef: ResourceRef = { type: "Res0", id: "r0" };
      const startBlock = policy.resources["Res0"]!;

      await expect(
        resolveRoles(actor, startRef, cache, startBlock, policy),
      ).rejects.toThrow(DepthLimitError);
    });

    it("succeeds when chain is within depth limit", async () => {
      // Create a chain of 3 hops: Res0 -> Res1 -> Res2 -> Res3
      // Res3 has admin derived from actor attribute
      const resources: Record<string, ResourceBlock> = {};
      const attrs: Record<string, Record<string, unknown>> = {};

      for (let i = 0; i <= 3; i++) {
        const resName = `Res${i}`;
        resources[resName] = {
          roles: ["admin"],
          permissions: ["read"],
          ...(i < 3
            ? {
                relations: {
                  parent: `Res${i + 1}`,
                },
                derived_roles: [
                  { role: "admin", from_role: "admin", on_relation: "parent" },
                ],
              }
            : {
                derived_roles: [
                  { role: "admin", when: { "$actor.is_admin": true } },
                ],
              }),
        };
        if (i < 3) {
          attrs[`Res${i}:r${i}`] = { parent: { type: `Res${i + 1}`, id: `r${i + 1}` } };
        }
      }

      const policy: Policy = {
        version: "1",
        actors: { User: { attributes: { is_admin: "boolean" } } },
        resources,
      };

      const actorWithFlag: ActorRef = { type: "User", id: "u1", attributes: { is_admin: true } };
      const cache = makeCache(attrs);
      const startRef: ResourceRef = { type: "Res0", id: "r0" };
      const startBlock = policy.resources["Res0"]!;

      const result = await resolveRoles(actorWithFlag, startRef, cache, startBlock, policy);
      expect(result.derived.some(d => d.role === "admin")).toBe(true);
    });

    it("respects custom maxDerivedRoleDepth", async () => {
      // Chain of 3 hops, but with maxDerivedRoleDepth=2 should fail
      const resources: Record<string, ResourceBlock> = {};
      const attrs: Record<string, Record<string, unknown>> = {};

      for (let i = 0; i <= 3; i++) {
        const resName = `Res${i}`;
        resources[resName] = {
          roles: ["admin"],
          permissions: ["read"],
          ...(i < 3
            ? {
                relations: {
                  parent: `Res${i + 1}`,
                },
                derived_roles: [
                  { role: "admin", from_role: "admin", on_relation: "parent" },
                ],
              }
            : {}),
        };
        if (i < 3) {
          attrs[`Res${i}:r${i}`] = { parent: { type: `Res${i + 1}`, id: `r${i + 1}` } };
        }
      }

      const policy: Policy = {
        version: "1",
        actors: { User: { attributes: {} } },
        resources,
      };

      const cache = makeCache(attrs);
      const startRef: ResourceRef = { type: "Res0", id: "r0" };
      const startBlock = policy.resources["Res0"]!;

      await expect(
        resolveRoles(actor, startRef, cache, startBlock, policy, { maxDerivedRoleDepth: 2 }),
      ).rejects.toThrow(DepthLimitError);
    });

    it("DepthLimitError has correct limit and limitType", async () => {
      const resources: Record<string, ResourceBlock> = {};
      const attrs: Record<string, Record<string, unknown>> = {};

      for (let i = 0; i <= 6; i++) {
        const resName = `Res${i}`;
        resources[resName] = {
          roles: ["admin"],
          permissions: ["read"],
          ...(i < 6
            ? {
                relations: {
                  parent: `Res${i + 1}`,
                },
                derived_roles: [
                  { role: "admin", from_role: "admin", on_relation: "parent" },
                ],
              }
            : {}),
        };
        if (i < 6) {
          attrs[`Res${i}:r${i}`] = { parent: { type: `Res${i + 1}`, id: `r${i + 1}` } };
        }
      }

      const policy: Policy = {
        version: "1",
        actors: { User: { attributes: {} } },
        resources,
      };

      const cache = makeCache(attrs);
      const startRef: ResourceRef = { type: "Res0", id: "r0" };
      const startBlock = policy.resources["Res0"]!;

      try {
        await resolveRoles(actor, startRef, cache, startBlock, policy);
        expect.fail("Should have thrown DepthLimitError");
      } catch (e) {
        expect(e).toBeInstanceOf(DepthLimitError);
        const dErr = e as DepthLimitError;
        expect(dErr.limit).toBe(5);
        expect(dErr.limitType).toBe("derivation");
      }
    });
  });
});
