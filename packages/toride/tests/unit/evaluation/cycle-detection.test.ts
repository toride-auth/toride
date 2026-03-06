// T034: Unit tests for cycle detection and depth limit enforcement

import { describe, it, expect, beforeAll } from "vitest";
import type {
  ActorRef,
  ResourceRef,
  RelationResolver,
  Policy,
  ResourceBlock,
  ResolvedRolesDetail,
} from "../../../src/types.js";
import { CycleError, DepthLimitError } from "../../../src/types.js";

describe("cycle detection and depth limits", () => {
  let resolveRoles: (
    actor: ActorRef,
    resource: ResourceRef,
    resolver: RelationResolver,
    resourceBlock: ResourceBlock,
    policy: Policy,
    options?: { maxDerivedRoleDepth?: number },
  ) => Promise<ResolvedRolesDetail>;

  beforeAll(async () => {
    const mod = await import("../../../src/evaluation/role-resolver.js");
    resolveRoles = mod.resolveRoles;
  });

  const actor: ActorRef = { type: "User", id: "u1", attributes: {} };

  function makeResolver(overrides: {
    roles?: Record<string, string[]>;
    related?: Record<string, ResourceRef | ResourceRef[]>;
  }): RelationResolver {
    return {
      getRoles: async (a: ActorRef, r: ResourceRef) => {
        const key = `${a.type}:${a.id}:${r.type}:${r.id}`;
        return overrides.roles?.[key] ?? [];
      },
      getRelated: async (r: ResourceRef, rel: string) => {
        const key = `${r.type}:${r.id}:${rel}`;
        return overrides.related?.[key] ?? [];
      },
      getAttributes: async () => ({}),
    };
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
              parent: { resource: "ResourceB", cardinality: "one" },
            },
            derived_roles: [
              { role: "admin", from_role: "admin", on_relation: "parent" },
            ],
          },
          ResourceB: {
            roles: ["admin"],
            permissions: ["read"],
            relations: {
              parent: { resource: "ResourceA", cardinality: "one" },
            },
            derived_roles: [
              { role: "admin", from_role: "admin", on_relation: "parent" },
            ],
          },
        },
      };

      const resolver = makeResolver({
        related: {
          "ResourceA:a1:parent": { type: "ResourceB", id: "b1" },
          "ResourceB:b1:parent": { type: "ResourceA", id: "a1" },
        },
      });

      const resourceA: ResourceRef = { type: "ResourceA", id: "a1" };
      const blockA = policy.resources["ResourceA"]!;

      await expect(
        resolveRoles(actor, resourceA, resolver, blockA, policy),
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
              parent: { resource: "ResourceB", cardinality: "one" },
            },
            derived_roles: [
              { role: "admin", from_role: "admin", on_relation: "parent" },
            ],
          },
          ResourceB: {
            roles: ["admin"],
            permissions: ["read"],
            relations: {
              parent: { resource: "ResourceA", cardinality: "one" },
            },
            derived_roles: [
              { role: "admin", from_role: "admin", on_relation: "parent" },
            ],
          },
        },
      };

      const resolver = makeResolver({
        related: {
          "ResourceA:a1:parent": { type: "ResourceB", id: "b1" },
          "ResourceB:b1:parent": { type: "ResourceA", id: "a1" },
        },
      });

      const resourceA: ResourceRef = { type: "ResourceA", id: "a1" };
      const blockA = policy.resources["ResourceA"]!;

      try {
        await resolveRoles(actor, resourceA, resolver, blockA, policy);
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
              parent: { resource: "Folder", cardinality: "one" },
            },
            derived_roles: [
              { role: "admin", from_role: "admin", on_relation: "parent" },
            ],
          },
        },
      };

      // Folder f1 points to itself
      const resolver = makeResolver({
        related: {
          "Folder:f1:parent": { type: "Folder", id: "f1" },
        },
      });

      const folderRef: ResourceRef = { type: "Folder", id: "f1" };
      const folderBlock = policy.resources["Folder"]!;

      await expect(
        resolveRoles(actor, folderRef, resolver, folderBlock, policy),
      ).rejects.toThrow(CycleError);
    });
  });

  // ─── Depth Limit ───────────────────────────────────────────────────

  describe("depth limit", () => {
    it("throws DepthLimitError when chain exceeds default depth of 5", async () => {
      // Create a chain: Res0 -> Res1 -> Res2 -> Res3 -> Res4 -> Res5 -> Res6
      // This requires 6 hops which exceeds the default depth of 5
      const resources: Record<string, ResourceBlock> = {};
      const related: Record<string, ResourceRef> = {};

      for (let i = 0; i <= 6; i++) {
        const resName = `Res${i}`;
        resources[resName] = {
          roles: ["admin"],
          permissions: ["read"],
          ...(i < 6
            ? {
                relations: {
                  parent: { resource: `Res${i + 1}`, cardinality: "one" as const },
                },
                derived_roles: [
                  { role: "admin", from_role: "admin", on_relation: "parent" },
                ],
              }
            : {}),
        };
        if (i < 6) {
          related[`Res${i}:r${i}:parent`] = { type: `Res${i + 1}`, id: `r${i + 1}` };
        }
      }

      const policy: Policy = {
        version: "1",
        actors: { User: { attributes: {} } },
        resources,
      };

      const resolver = makeResolver({ related });
      const startRef: ResourceRef = { type: "Res0", id: "r0" };
      const startBlock = policy.resources["Res0"]!;

      await expect(
        resolveRoles(actor, startRef, resolver, startBlock, policy),
      ).rejects.toThrow(DepthLimitError);
    });

    it("succeeds when chain is within depth limit", async () => {
      // Create a chain of 3 hops: Res0 -> Res1 -> Res2 -> Res3
      // Res3 has admin directly
      const resources: Record<string, ResourceBlock> = {};
      const related: Record<string, ResourceRef> = {};

      for (let i = 0; i <= 3; i++) {
        const resName = `Res${i}`;
        resources[resName] = {
          roles: ["admin"],
          permissions: ["read"],
          ...(i < 3
            ? {
                relations: {
                  parent: { resource: `Res${i + 1}`, cardinality: "one" as const },
                },
                derived_roles: [
                  { role: "admin", from_role: "admin", on_relation: "parent" },
                ],
              }
            : {}),
        };
        if (i < 3) {
          related[`Res${i}:r${i}:parent`] = { type: `Res${i + 1}`, id: `r${i + 1}` };
        }
      }

      const policy: Policy = {
        version: "1",
        actors: { User: { attributes: {} } },
        resources,
      };

      // Actor has admin role on the leaf resource Res3
      const resolver = makeResolver({
        related,
        roles: { "User:u1:Res3:r3": ["admin"] },
      });
      const startRef: ResourceRef = { type: "Res0", id: "r0" };
      const startBlock = policy.resources["Res0"]!;

      const result = await resolveRoles(actor, startRef, resolver, startBlock, policy);
      expect(result.derived.some(d => d.role === "admin")).toBe(true);
    });

    it("respects custom maxDerivedRoleDepth", async () => {
      // Chain of 3 hops, but with maxDerivedRoleDepth=2 should fail
      const resources: Record<string, ResourceBlock> = {};
      const related: Record<string, ResourceRef> = {};

      for (let i = 0; i <= 3; i++) {
        const resName = `Res${i}`;
        resources[resName] = {
          roles: ["admin"],
          permissions: ["read"],
          ...(i < 3
            ? {
                relations: {
                  parent: { resource: `Res${i + 1}`, cardinality: "one" as const },
                },
                derived_roles: [
                  { role: "admin", from_role: "admin", on_relation: "parent" },
                ],
              }
            : {}),
        };
        if (i < 3) {
          related[`Res${i}:r${i}:parent`] = { type: `Res${i + 1}`, id: `r${i + 1}` };
        }
      }

      const policy: Policy = {
        version: "1",
        actors: { User: { attributes: {} } },
        resources,
      };

      const resolver = makeResolver({ related });
      const startRef: ResourceRef = { type: "Res0", id: "r0" };
      const startBlock = policy.resources["Res0"]!;

      await expect(
        resolveRoles(actor, startRef, resolver, startBlock, policy, { maxDerivedRoleDepth: 2 }),
      ).rejects.toThrow(DepthLimitError);
    });

    it("DepthLimitError has correct limit and limitType", async () => {
      const resources: Record<string, ResourceBlock> = {};
      const related: Record<string, ResourceRef> = {};

      for (let i = 0; i <= 6; i++) {
        const resName = `Res${i}`;
        resources[resName] = {
          roles: ["admin"],
          permissions: ["read"],
          ...(i < 6
            ? {
                relations: {
                  parent: { resource: `Res${i + 1}`, cardinality: "one" as const },
                },
                derived_roles: [
                  { role: "admin", from_role: "admin", on_relation: "parent" },
                ],
              }
            : {}),
        };
        if (i < 6) {
          related[`Res${i}:r${i}:parent`] = { type: `Res${i + 1}`, id: `r${i + 1}` };
        }
      }

      const policy: Policy = {
        version: "1",
        actors: { User: { attributes: {} } },
        resources,
      };

      const resolver = makeResolver({ related });
      const startRef: ResourceRef = { type: "Res0", id: "r0" };
      const startBlock = policy.resources["Res0"]!;

      try {
        await resolveRoles(actor, startRef, resolver, startBlock, policy);
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
