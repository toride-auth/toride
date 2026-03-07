// T012: Integration tests for US1 — Per-Type Attribute Resolver
// Tests the 3 acceptance scenarios from spec.md US1

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
 * Policy that uses permit rules with when conditions referencing $resource attributes.
 * Conditions compare $resource values to $actor.attributes (not $actor.id,
 * since the condition resolver resolves $actor.x from actor.attributes only).
 */
const policy: Policy = {
  version: "1",
  actors: {
    User: { attributes: { department: "string" } },
  },
  resources: {
    Document: {
      roles: ["viewer"],
      permissions: ["read", "update", "delete"],
      relations: {
        org: "Organization",
      },
      grants: {
        viewer: ["read"],
      },
      // Use permit rules with $resource conditions to test resolver dispatch
      rules: [
        {
          effect: "permit",
          permissions: ["update"],
          when: {
            "$resource.status": "draft",
          },
        },
        {
          effect: "forbid",
          permissions: ["delete"],
          when: {
            "$resource.locked": true,
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
    Workspace: {
      roles: ["member"],
      permissions: ["read"],
      grants: {
        member: ["read"],
      },
    },
  },
};

const actor: ActorRef = { type: "User", id: "u1", attributes: { department: "eng" } };

describe("US1: Per-Type Attribute Resolver", () => {
  // Acceptance Scenario 1:
  // Given an engine configured with resolvers for "Document" and "Organization",
  // When a can() check is performed on a Document resource,
  // Then only the Document resolver is invoked (not Organization).
  it("calls only the Document resolver when checking a Document resource", async () => {
    const documentResolver = vi.fn<ResourceResolver>(async (_ref) => {
      return { status: "draft", locked: false };
    });
    const organizationResolver = vi.fn<ResourceResolver>(async (_ref) => {
      return { name: "Test Org" };
    });

    const resolvers: Resolvers = {
      Document: documentResolver,
      Organization: organizationResolver,
    };

    const engine = createToride({ policy, resolvers });
    const resource: ResourceRef = { type: "Document", id: "doc1" };

    // The permit rule for "update" checks $resource.status == "draft"
    const result = await engine.can(actor, "update", resource);

    expect(result).toBe(true);
    expect(documentResolver).toHaveBeenCalledTimes(1);
    expect(documentResolver).toHaveBeenCalledWith(
      expect.objectContaining({ type: "Document", id: "doc1" }),
    );
    expect(organizationResolver).not.toHaveBeenCalled();
  });

  // Acceptance Scenario 2:
  // Given an engine configured with a resolver for "Document" but not "Workspace",
  // When a can() check references a Workspace resource,
  // Then the engine behaves like a GraphQL trivial resolver — fields not present
  // are treated as undefined, and policy conditions referencing them evaluate
  // accordingly (no error thrown).
  it("treats unregistered type as trivial resolver (no error, fields undefined)", async () => {
    const documentResolver = vi.fn<ResourceResolver>(async () => {
      return { status: "draft" };
    });

    const resolvers: Resolvers = {
      Document: documentResolver,
    };

    const engine = createToride({ policy, resolvers });
    const resource: ResourceRef = { type: "Workspace", id: "ws1" };

    // Should not throw, and should deny (no resolver means no attributes,
    // no roles can be derived, no grants match)
    const result = await engine.can(actor, "read", resource);

    expect(result).toBe(false);
    expect(documentResolver).not.toHaveBeenCalled();
  });

  // Acceptance Scenario 3:
  // Given an engine with no resolvers configured,
  // When all required attributes are provided inline on the ResourceRef,
  // Then authorization evaluation succeeds without any resolver calls.
  it("succeeds with inline attributes and no resolvers configured", async () => {
    const engine = createToride({ policy });
    const resource: ResourceRef = {
      type: "Document",
      id: "doc1",
      attributes: { status: "draft" },
    };

    const result = await engine.can(actor, "update", resource);

    expect(result).toBe(true);
  });

  it("denies when inline attributes do not match condition and no resolver", async () => {
    const engine = createToride({ policy });
    const resource: ResourceRef = {
      type: "Document",
      id: "doc1",
      attributes: { status: "published" },
    };

    const result = await engine.can(actor, "update", resource);

    expect(result).toBe(false);
  });

  // Edge case: Engine with empty resolvers map works the same as no resolvers
  it("works with empty resolvers map", async () => {
    const engine = createToride({ policy, resolvers: {} });
    const resource: ResourceRef = {
      type: "Document",
      id: "doc1",
      attributes: { status: "draft" },
    };

    const result = await engine.can(actor, "update", resource);

    expect(result).toBe(true);
  });

  // Verify caching: resolver called at most once per resource per can() call
  it("caches resolver results within a single can() call", async () => {
    const documentResolver = vi.fn<ResourceResolver>(async () => {
      return { status: "draft", locked: false };
    });

    const resolvers: Resolvers = {
      Document: documentResolver,
    };

    const engine = createToride({ policy, resolvers });
    const resource: ResourceRef = { type: "Document", id: "doc1" };

    await engine.can(actor, "update", resource);

    // Even though the engine may need attributes multiple times
    // (e.g., for multiple rule conditions), the resolver should be called at most once.
    expect(documentResolver).toHaveBeenCalledTimes(1);
  });

  // Verify shared cache across permittedActions
  it("shares cache across permittedActions evaluations", async () => {
    const documentResolver = vi.fn<ResourceResolver>(async () => {
      return { status: "draft", locked: false };
    });

    const resolvers: Resolvers = {
      Document: documentResolver,
    };

    const engine = createToride({ policy, resolvers });
    const resource: ResourceRef = { type: "Document", id: "doc1" };

    const permitted = await engine.permittedActions(actor, resource);

    // permittedActions checks read, update, delete — should call resolver only once
    expect(documentResolver).toHaveBeenCalledTimes(1);
    expect(permitted).toContain("update");
  });

  // Verify shared cache across canBatch
  it("shares cache across canBatch evaluations", async () => {
    const documentResolver = vi.fn<ResourceResolver>(async () => {
      return { status: "draft", locked: false };
    });

    const resolvers: Resolvers = {
      Document: documentResolver,
    };

    const engine = createToride({ policy, resolvers });

    const results = await engine.canBatch(actor, [
      { action: "update", resource: { type: "Document", id: "doc1" } },
      { action: "update", resource: { type: "Document", id: "doc1" } },
    ]);

    // Same resource in all checks — resolver called once
    expect(documentResolver).toHaveBeenCalledTimes(1);
    expect(results).toEqual([true, true]);
  });

  // Verify resolver error is fail-closed
  it("denies access when resolver throws (fail-closed)", async () => {
    const failingResolver = vi.fn<ResourceResolver>(async () => {
      throw new Error("DB connection lost");
    });

    const resolvers: Resolvers = {
      Document: failingResolver,
    };

    const engine = createToride({ policy, resolvers });
    const resource: ResourceRef = { type: "Document", id: "doc1" };

    // The permit rule for update checks $resource.status, which requires resolver.
    // Resolver throws -> fail-closed -> deny
    const result = await engine.can(actor, "update", resource);

    expect(result).toBe(false);
  });
});
