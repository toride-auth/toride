// Phase 2: Default Resolver Tests (US1 + US2)
// Dedicated tests that explicitly exercise and name the "default resolver" behavior —
// inline-only attribute resolution without a registered ResourceResolver.

import { describe, it, expect, vi } from "vitest";
import type {
  ActorRef,
  ResourceRef,
  Policy,
  Resolvers,
  ResourceResolver,
} from "../types.js";
import { createToride } from "../engine.js";

/**
 * Policy with permit rules referencing $resource attributes via conditions.
 * Includes equality, operator, and multi-field conditions to cover all scenarios.
 */
const policy: Policy = {
  version: "1",
  actors: {
    User: { attributes: { department: "string" } },
  },
  resources: {
    Document: {
      roles: ["viewer", "editor"],
      permissions: ["read", "update", "delete", "publish"],
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
        {
          effect: "permit",
          permissions: ["publish"],
          when: {
            "$resource.priority": { gt: 3 },
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

const actor: ActorRef = {
  type: "User",
  id: "u1",
  attributes: { department: "eng", id: "u1" },
};

describe("default resolver", () => {
  // T004: Inline attributes resolve $resource.<field> conditions without a registered resolver
  // Acceptance scenario 1.1 — FR-001
  describe("inline attributes resolve without a registered resolver", () => {
    it("resolves $resource.<field> conditions from inline attributes", async () => {
      const engine = createToride({ policy });
      const resource: ResourceRef = {
        type: "Document",
        id: "doc1",
        attributes: { status: "draft" },
      };

      const result = await engine.can(actor, "update", resource);

      expect(result).toBe(true);
    });

    it("denies when inline attribute value does not match condition", async () => {
      const engine = createToride({ policy });
      const resource: ResourceRef = {
        type: "Document",
        id: "doc1",
        attributes: { status: "published" },
      };

      const result = await engine.can(actor, "update", resource);

      expect(result).toBe(false);
    });

    it("works with empty resolvers map (no resolver for the type)", async () => {
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

  // T005: Missing inline fields resolve to undefined and conditions fail — default-deny preserved
  // Acceptance scenario 1.2 — FR-003
  describe("missing inline fields resolve to undefined — default-deny preserved", () => {
    it("denies when no inline attributes and no resolver registered", async () => {
      const engine = createToride({ policy });
      const resource: ResourceRef = { type: "Document", id: "doc1" };

      const result = await engine.can(actor, "update", resource);

      expect(result).toBe(false);
    });

    it("denies with empty resolvers map and no inline attributes", async () => {
      const engine = createToride({ policy, resolvers: {} });
      const resource: ResourceRef = { type: "Document", id: "doc1" };

      const result = await engine.can(actor, "update", resource);

      expect(result).toBe(false);
    });

    it("denies when inline attributes are present but the required field is missing", async () => {
      const engine = createToride({ policy });
      const resource: ResourceRef = {
        type: "Document",
        id: "doc1",
        attributes: { title: "My Document" }, // 'status' is missing
      };

      const result = await engine.can(actor, "update", resource);

      expect(result).toBe(false);
    });
  });

  // T006: Operator conditions (e.g., gt) work with inline-only data
  // Acceptance scenario 1.3
  describe("operator conditions work with inline-only data", () => {
    it("evaluates gt operator against inline attribute", async () => {
      const engine = createToride({ policy });
      const resource: ResourceRef = {
        type: "Document",
        id: "doc1",
        attributes: { priority: 5 },
      };

      const result = await engine.can(actor, "publish", resource);

      expect(result).toBe(true);
    });

    it("denies when inline attribute does not satisfy gt operator", async () => {
      const engine = createToride({ policy });
      const resource: ResourceRef = {
        type: "Document",
        id: "doc1",
        attributes: { priority: 2 },
      };

      const result = await engine.can(actor, "publish", resource);

      expect(result).toBe(false);
    });

    it("denies when priority field is missing (undefined fails gt comparison)", async () => {
      const engine = createToride({ policy });
      const resource: ResourceRef = {
        type: "Document",
        id: "doc1",
        attributes: { status: "draft" },
      };

      const result = await engine.can(actor, "publish", resource);

      expect(result).toBe(false);
    });
  });

  // T007: Multiple fields resolve independently from inline attributes
  describe("multiple fields resolve independently from inline attributes", () => {
    it("resolves multiple $resource fields from a single inline attributes object", async () => {
      const engine = createToride({ policy });
      const resource: ResourceRef = {
        type: "Document",
        id: "doc1",
        attributes: { status: "draft", owner_id: "u1" },
      };

      // delete rule checks both $resource.status == "draft" AND $resource.owner_id == $actor.id
      const result = await engine.can(actor, "delete", resource);

      expect(result).toBe(true);
    });

    it("denies when one of multiple required fields is missing", async () => {
      const engine = createToride({ policy });
      const resource: ResourceRef = {
        type: "Document",
        id: "doc1",
        attributes: { status: "draft" }, // owner_id missing
      };

      // delete rule needs both status and owner_id — owner_id is undefined -> deny
      const result = await engine.can(actor, "delete", resource);

      expect(result).toBe(false);
    });

    it("denies when one of multiple required fields does not match", async () => {
      const engine = createToride({ policy });
      const resource: ResourceRef = {
        type: "Document",
        id: "doc1",
        attributes: { status: "draft", owner_id: "u999" }, // wrong owner
      };

      const result = await engine.can(actor, "delete", resource);

      expect(result).toBe(false);
    });
  });

  // T008: When resolver IS registered alongside inline attributes, inline takes precedence
  // Acceptance scenario 2.2 — FR-002
  describe("inline attributes take precedence over resolver results", () => {
    it("uses inline value over conflicting resolver value", async () => {
      const documentResolver = vi.fn<ResourceResolver>(async () => {
        return { status: "published", owner_id: "u1" };
      });

      const resolvers: Resolvers = {
        Document: documentResolver,
      };

      const engine = createToride({ policy, resolvers });
      const resource: ResourceRef = {
        type: "Document",
        id: "doc1",
        attributes: { status: "draft" }, // inline says "draft", resolver says "published"
      };

      // update rule checks $resource.status == "draft"
      // inline "draft" must win over resolver "published"
      const result = await engine.can(actor, "update", resource);

      expect(result).toBe(true);
      expect(documentResolver).toHaveBeenCalledTimes(1);
    });

    it("resolver fills in fields not provided inline", async () => {
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
        attributes: { status: "draft" }, // only status inline, owner_id from resolver
      };

      // delete rule checks status (inline) AND owner_id (resolver)
      const result = await engine.can(actor, "delete", resource);

      expect(result).toBe(true);
      expect(documentResolver).toHaveBeenCalledTimes(1);
    });
  });
});
