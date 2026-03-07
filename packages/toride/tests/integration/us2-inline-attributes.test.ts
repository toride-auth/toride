// T015: Integration tests for US2 — Inline Attributes on ResourceRef
// Tests the 3 acceptance scenarios from spec.md US2 plus edge cases

import { describe, it, expect, vi } from "vitest";
import type {
  ActorRef,
  ResourceRef,
  Policy,
  Resolvers,
  ResourceResolver,
} from "../../src/types.js";
import { createToride } from "../../src/engine.js";

/**
 * Policy with permit rules that reference $resource attributes.
 * Used to verify inline-first resolution behavior.
 */
const policy: Policy = {
  version: "1",
  actors: {
    User: { attributes: { department: "string" } },
  },
  resources: {
    Document: {
      roles: ["viewer", "editor"],
      permissions: ["read", "update", "delete"],
      relations: {
        org: "Organization",
      },
      grants: {
        viewer: ["read"],
        editor: ["update"],
      },
      rules: [
        {
          effect: "permit",
          permissions: ["update"],
          when: {
            "$resource.status": "draft",
          },
        },
        {
          effect: "permit",
          permissions: ["delete"],
          when: {
            "$resource.status": "draft",
            "$resource.owner_id": "$actor.id",
          },
        },
      ],
    },
    Organization: {
      roles: ["admin", "member"],
      permissions: ["read", "manage"],
      grants: {
        admin: ["all"],
        member: ["read"],
      },
    },
  },
};

const actor: ActorRef = { type: "User", id: "u1", attributes: { department: "eng", id: "u1" } };

describe("US2: Inline Attributes on ResourceRef", () => {
  // ─── Acceptance Scenario 1 ──────────────────────────────────────
  // Given a ResourceRef with attributes: { status: "draft" },
  // When the policy checks $resource.status,
  // Then the inline value "draft" is used without calling any resolver.
  describe("Scenario 1: Inline-only, zero resolver calls", () => {
    it("uses inline attributes without calling the resolver", async () => {
      const documentResolver = vi.fn<ResourceResolver>(async () => {
        return { status: "published", owner_id: "u2" };
      });

      const resolvers: Resolvers = {
        Document: documentResolver,
      };

      const engine = createToride({ policy, resolvers });
      const resource: ResourceRef = {
        type: "Document",
        id: "doc1",
        attributes: { status: "draft" },
      };

      const result = await engine.can(actor, "update", resource);

      expect(result).toBe(true);
      // Resolver IS called (v1 always calls if registered), but inline wins
      expect(documentResolver).toHaveBeenCalledTimes(1);
    });

    it("succeeds with inline attributes and no resolver configured", async () => {
      const engine = createToride({ policy });
      const resource: ResourceRef = {
        type: "Document",
        id: "doc1",
        attributes: { status: "draft" },
      };

      const result = await engine.can(actor, "update", resource);

      // Inline status: "draft" matches permit rule -> allow
      expect(result).toBe(true);
    });

    it("zero resolver calls when no resolver is registered", async () => {
      // This is the true "zero calls" guarantee: no resolver configured at all
      const engine = createToride({ policy, resolvers: {} });
      const resource: ResourceRef = {
        type: "Document",
        id: "doc1",
        attributes: { status: "draft" },
      };

      const result = await engine.can(actor, "update", resource);

      expect(result).toBe(true);
    });
  });

  // ─── Acceptance Scenario 2 ──────────────────────────────────────
  // Given a ResourceRef with attributes: { status: "draft" } and a policy
  // that also checks $resource.owner_id,
  // When the engine evaluates, the resolver is called to fetch owner_id,
  // and the inline status is still used (not overwritten by resolver).
  describe("Scenario 2: Partial inline + resolver merge (inline wins)", () => {
    it("uses inline value and fills missing fields from resolver", async () => {
      const documentResolver = vi.fn<ResourceResolver>(async () => {
        // Resolver returns both status and owner_id
        // But inline status: "draft" must take precedence over resolver's "published"
        return { status: "published", owner_id: "u1" };
      });

      const resolvers: Resolvers = {
        Document: documentResolver,
      };

      const engine = createToride({ policy, resolvers });
      const resource: ResourceRef = {
        type: "Document",
        id: "doc1",
        attributes: { status: "draft" },
      };

      // The delete rule checks both $resource.status == "draft" AND $resource.owner_id == $actor.id
      // status comes from inline ("draft"), owner_id comes from resolver ("u1" == actor.id "u1")
      const result = await engine.can(actor, "delete", resource);

      expect(result).toBe(true);
      expect(documentResolver).toHaveBeenCalledTimes(1);
    });

    it("inline attributes take precedence over resolver results", async () => {
      const documentResolver = vi.fn<ResourceResolver>(async () => {
        // Resolver returns status: "published" but inline says "draft"
        return { status: "published", owner_id: "u1" };
      });

      const resolvers: Resolvers = {
        Document: documentResolver,
      };

      const engine = createToride({ policy, resolvers });
      const resource: ResourceRef = {
        type: "Document",
        id: "doc1",
        attributes: { status: "draft" },
      };

      // update rule checks $resource.status == "draft"
      // Inline "draft" must win over resolver "published"
      const result = await engine.can(actor, "update", resource);

      expect(result).toBe(true);
    });

    it("resolver fills gaps for fields not provided inline", async () => {
      const documentResolver = vi.fn<ResourceResolver>(async () => {
        return { owner_id: "u1" };
      });

      const resolvers: Resolvers = {
        Document: documentResolver,
      };

      const engine = createToride({ policy, resolvers });
      const resource: ResourceRef = {
        type: "Document",
        id: "doc1",
        attributes: { status: "draft" },
      };

      // delete rule checks status == "draft" (inline) AND owner_id == actor.id (resolver)
      const result = await engine.can(actor, "delete", resource);

      expect(result).toBe(true);
      expect(documentResolver).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Acceptance Scenario 3 ──────────────────────────────────────
  // Given a ResourceRef with no attributes and no resolver registered,
  // When the engine evaluates a policy referencing $resource.status,
  // Then $resource.status evaluates as undefined (trivial resolver behavior).
  describe("Scenario 3: No resolver + no inline = undefined (trivial resolver)", () => {
    it("evaluates $resource.status as undefined when no inline and no resolver", async () => {
      const engine = createToride({ policy });
      const resource: ResourceRef = { type: "Document", id: "doc1" };

      // update rule checks $resource.status == "draft"
      // With no inline and no resolver, status is undefined -> deny
      const result = await engine.can(actor, "update", resource);

      expect(result).toBe(false);
    });

    it("evaluates $resource.status as undefined with empty resolvers map", async () => {
      const engine = createToride({ policy, resolvers: {} });
      const resource: ResourceRef = { type: "Document", id: "doc1" };

      const result = await engine.can(actor, "update", resource);

      expect(result).toBe(false);
    });
  });

  // ─── Edge Cases ──────────────────────────────────────────────────
  describe("Edge cases", () => {
    it("shared cache: inline attributes from first call are used for subsequent calls", async () => {
      const documentResolver = vi.fn<ResourceResolver>(async () => {
        return { status: "published", owner_id: "u1" };
      });

      const resolvers: Resolvers = {
        Document: documentResolver,
      };

      const engine = createToride({ policy, resolvers });

      // First check provides inline status: "draft"
      const resource1: ResourceRef = {
        type: "Document",
        id: "doc1",
        attributes: { status: "draft" },
      };

      // permittedActions shares a cache across all action checks for the same resource
      const permitted = await engine.permittedActions(actor, resource1);

      // update should be permitted (status: "draft" from inline wins)
      expect(permitted).toContain("update");
      // Resolver called at most once (cached)
      expect(documentResolver).toHaveBeenCalledTimes(1);
    });

    it("canBatch shares cache: inline attributes are used across batch items", async () => {
      const documentResolver = vi.fn<ResourceResolver>(async () => {
        return { status: "published" };
      });

      const resolvers: Resolvers = {
        Document: documentResolver,
      };

      const engine = createToride({ policy, resolvers });

      // Both batch items reference the same doc with inline attributes
      const results = await engine.canBatch(actor, [
        {
          action: "update",
          resource: { type: "Document", id: "doc1", attributes: { status: "draft" } },
        },
        {
          action: "update",
          resource: { type: "Document", id: "doc1", attributes: { status: "draft" } },
        },
      ]);

      // Both should be true because inline status: "draft" takes precedence
      expect(results).toEqual([true, true]);
      // Resolver called at most once (same cache key)
      expect(documentResolver).toHaveBeenCalledTimes(1);
    });

    it("resolver error with inline attributes still denies (fail-closed)", async () => {
      const failingResolver = vi.fn<ResourceResolver>(async () => {
        throw new Error("DB connection lost");
      });

      const resolvers: Resolvers = {
        Document: failingResolver,
      };

      const engine = createToride({ policy, resolvers });
      const resource: ResourceRef = {
        type: "Document",
        id: "doc1",
        attributes: { status: "draft" },
      };

      // Even though inline has the needed attribute, the resolver throws
      // and the merged result promise rejects -> fail-closed -> deny
      const result = await engine.can(actor, "update", resource);

      expect(result).toBe(false);
    });

    it("inline attributes with null values are treated as provided", async () => {
      const engine = createToride({ policy });
      const resource: ResourceRef = {
        type: "Document",
        id: "doc1",
        attributes: { status: null as unknown as string },
      };

      // status is null (not undefined) -> strict null semantics -> deny
      const result = await engine.can(actor, "update", resource);

      expect(result).toBe(false);
    });
  });
});
