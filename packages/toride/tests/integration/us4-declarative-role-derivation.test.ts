// T026: Integration tests for US4 — Declarative Role Derivation Without getRoles
// Tests the 3 acceptance scenarios from spec.md US4 plus edge cases
// All roles derived through derived_roles in policy YAML using attribute-based conditions.
// No getRoles callback anywhere.

import { describe, it, expect, vi } from "vitest";
import type {
  ActorRef,
  ResourceRef,
  Policy,
  Resolvers,
  ResourceResolver,
} from "../../src/types.js";
import { createToride } from "../../src/engine.js";

// ─── Test Policy ────────────────────────────────────────────────────
// This policy uses derived_roles with when conditions that reference
// $resource.* attributes, which requires Pattern 4/5 to be async
// and capable of resolving resource attributes via cache.

const policy: Policy = {
  version: "1",
  actors: {
    User: { attributes: { id: "string", role: "string" } },
  },
  resources: {
    Document: {
      roles: ["owner", "editor", "viewer", "org_admin"],
      permissions: ["read", "update", "delete", "admin"],
      relations: {
        org: "Organization",
      },
      grants: {
        owner: ["all"],
        editor: ["read", "update"],
        viewer: ["read"],
        org_admin: ["admin"],
      },
      derived_roles: [
        // Pattern 5 (when only): owner via $resource.owner_id eq $actor.id
        {
          role: "owner",
          when: {
            "$resource.owner_id": { eq: "$actor.id" },
          },
        },
        // Pattern 5 (when only): editor via $actor.id in $resource.editor_ids
        {
          role: "editor",
          when: {
            "$actor.id": { in: "$resource.editor_ids" },
          },
        },
        // Pattern 4 (actor_type + when): viewer for User type when resource is public
        {
          role: "viewer",
          actor_type: "User",
          when: {
            "$resource.visibility": "public",
          },
        },
        // Pattern 2 (from_role + on_relation): org admin inherits from org
        {
          role: "org_admin",
          from_role: "admin",
          on_relation: "org",
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
      derived_roles: [
        // Pattern 5 (when only): admin via $resource.admin_id eq $actor.id
        {
          role: "admin",
          when: {
            "$resource.admin_id": { eq: "$actor.id" },
          },
        },
        // Pattern 5 (when only): member via $actor.id in $resource.member_ids
        {
          role: "member",
          when: {
            "$actor.id": { in: "$resource.member_ids" },
          },
        },
      ],
    },
  },
};

const owner: ActorRef = { type: "User", id: "user1", attributes: { id: "user1", role: "user" } };
const editor: ActorRef = { type: "User", id: "user2", attributes: { id: "user2", role: "user" } };
const stranger: ActorRef = { type: "User", id: "user99", attributes: { id: "user99", role: "user" } };

describe("US4: Declarative Role Derivation Without getRoles", () => {

  // ─── Acceptance Scenario 1 ──────────────────────────────────────
  // Given a policy with derived_roles where role: owner has
  // when: { $resource.owner_id: { eq: $actor.id } },
  // When the resource's owner_id matches the actor's ID (via inline attributes or resolver),
  // Then the actor is assigned the "owner" role.
  describe("Scenario 1: Owner via $resource.owner_id eq $actor.id", () => {
    it("assigns owner role when $resource.owner_id matches $actor.id via inline attrs", async () => {
      const engine = createToride({ policy });
      const resource: ResourceRef = {
        type: "Document",
        id: "doc1",
        attributes: {
          owner_id: "user1",
        },
      };

      // owner gets all permissions including delete
      const result = await engine.can(owner, "delete", resource);
      expect(result).toBe(true);
    });

    it("denies when $resource.owner_id does not match $actor.id", async () => {
      const engine = createToride({ policy });
      const resource: ResourceRef = {
        type: "Document",
        id: "doc1",
        attributes: {
          owner_id: "user1",
        },
      };

      // stranger is not the owner
      const result = await engine.can(stranger, "delete", resource);
      expect(result).toBe(false);
    });

    it("assigns owner role when $resource.owner_id comes from resolver", async () => {
      const docResolver = vi.fn<ResourceResolver>(async () => {
        return { owner_id: "user1" };
      });

      const resolvers: Resolvers = { Document: docResolver };
      const engine = createToride({ policy, resolvers });
      const resource: ResourceRef = {
        type: "Document",
        id: "doc1",
      };

      const result = await engine.can(owner, "delete", resource);
      expect(result).toBe(true);
      expect(docResolver).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Acceptance Scenario 2 ──────────────────────────────────────
  // Given a policy with derived_roles using from_role: admin and on_relation: org,
  // When the actor has the "admin" role on the related Organization resource,
  // Then the actor inherits the derived role on the Document.
  describe("Scenario 2: Inherited role via from_role + on_relation", () => {
    it("inherits org_admin on Document when actor is admin on related Org", async () => {
      const orgResolver = vi.fn<ResourceResolver>(async () => {
        return { admin_id: "user1" };
      });

      const resolvers: Resolvers = { Organization: orgResolver };
      const engine = createToride({ policy, resolvers });
      const resource: ResourceRef = {
        type: "Document",
        id: "doc1",
        attributes: {
          org: { type: "Organization", id: "org1" },
        },
      };

      // org_admin grants "admin" permission
      const result = await engine.can(owner, "admin", resource);
      expect(result).toBe(true);
    });

    it("does not inherit role when actor is not admin on related Org", async () => {
      const orgResolver = vi.fn<ResourceResolver>(async () => {
        return { admin_id: "user1" }; // user1 is admin, not user99
      });

      const resolvers: Resolvers = { Organization: orgResolver };
      const engine = createToride({ policy, resolvers });
      const resource: ResourceRef = {
        type: "Document",
        id: "doc1",
        attributes: {
          org: { type: "Organization", id: "org1" },
        },
      };

      const result = await engine.can(stranger, "admin", resource);
      expect(result).toBe(false);
    });

    it("works with fully resolver-provided org relation", async () => {
      const docResolver = vi.fn<ResourceResolver>(async () => {
        return { org: { type: "Organization", id: "org1" } };
      });
      const orgResolver = vi.fn<ResourceResolver>(async () => {
        return { admin_id: "user1" };
      });

      const resolvers: Resolvers = {
        Document: docResolver,
        Organization: orgResolver,
      };
      const engine = createToride({ policy, resolvers });
      const resource: ResourceRef = {
        type: "Document",
        id: "doc1",
      };

      const result = await engine.can(owner, "admin", resource);
      expect(result).toBe(true);
    });
  });

  // ─── Acceptance Scenario 3 ──────────────────────────────────────
  // Given an application that previously used getRoles to return ["editor"]
  // for specific actor-resource pairs,
  // When migrated to use $resource.editor_ids attribute with
  // when: { $actor.id: { in: $resource.editor_ids } },
  // Then the same authorization decisions are produced.
  describe("Scenario 3: Migration from getRoles to attribute-based conditions", () => {
    it("editor role via $actor.id in $resource.editor_ids (inline)", async () => {
      const engine = createToride({ policy });
      const resource: ResourceRef = {
        type: "Document",
        id: "doc1",
        attributes: {
          editor_ids: ["user2", "user3"],
        },
      };

      // user2 is in editor_ids -> editor role -> read + update
      const readResult = await engine.can(editor, "read", resource);
      expect(readResult).toBe(true);

      const updateResult = await engine.can(editor, "update", resource);
      expect(updateResult).toBe(true);

      // editor does not have delete permission
      const deleteResult = await engine.can(editor, "delete", resource);
      expect(deleteResult).toBe(false);
    });

    it("denies editor role when actor is not in editor_ids", async () => {
      const engine = createToride({ policy });
      const resource: ResourceRef = {
        type: "Document",
        id: "doc1",
        attributes: {
          editor_ids: ["user2", "user3"],
        },
      };

      const result = await engine.can(stranger, "update", resource);
      expect(result).toBe(false);
    });

    it("editor role via $resource.editor_ids from resolver", async () => {
      const docResolver = vi.fn<ResourceResolver>(async () => {
        return { editor_ids: ["user2", "user3"] };
      });

      const resolvers: Resolvers = { Document: docResolver };
      const engine = createToride({ policy, resolvers });
      const resource: ResourceRef = {
        type: "Document",
        id: "doc1",
      };

      const result = await engine.can(editor, "update", resource);
      expect(result).toBe(true);
    });
  });

  // ─── Pattern 4: actor_type + when with $resource ───────────────
  describe("Pattern 4: actor_type + when with $resource attributes", () => {
    it("assigns viewer role when actor type matches and resource is public", async () => {
      const engine = createToride({ policy });
      const resource: ResourceRef = {
        type: "Document",
        id: "doc1",
        attributes: {
          visibility: "public",
        },
      };

      const result = await engine.can(stranger, "read", resource);
      expect(result).toBe(true);
    });

    it("denies viewer role when resource is not public", async () => {
      const engine = createToride({ policy });
      const resource: ResourceRef = {
        type: "Document",
        id: "doc1",
        attributes: {
          visibility: "private",
        },
      };

      // stranger has no other role, and document is not public
      const result = await engine.can(stranger, "read", resource);
      expect(result).toBe(false);
    });

    it("assigns viewer role when visibility comes from resolver", async () => {
      const docResolver = vi.fn<ResourceResolver>(async () => {
        return { visibility: "public" };
      });

      const resolvers: Resolvers = { Document: docResolver };
      const engine = createToride({ policy, resolvers });
      const resource: ResourceRef = {
        type: "Document",
        id: "doc1",
      };

      const result = await engine.can(stranger, "read", resource);
      expect(result).toBe(true);
    });

    it("skips when actor_type does not match", async () => {
      const serviceActor: ActorRef = { type: "Service", id: "svc1", attributes: { id: "svc1" } };
      const engine = createToride({ policy });
      const resource: ResourceRef = {
        type: "Document",
        id: "doc1",
        attributes: {
          visibility: "public",
        },
      };

      // actor_type is "User" but actor is "Service"
      const result = await engine.can(serviceActor, "read", resource);
      expect(result).toBe(false);
    });
  });

  // ─── Combined patterns ─────────────────────────────────────────
  describe("Combined patterns: multiple derived roles on same resource", () => {
    it("owner and editor roles can coexist", async () => {
      const engine = createToride({ policy });
      const resource: ResourceRef = {
        type: "Document",
        id: "doc1",
        attributes: {
          owner_id: "user2",
          editor_ids: ["user2"],
        },
      };

      // user2 is both owner and editor
      const result = await engine.can(editor, "delete", resource);
      expect(result).toBe(true);
    });

    it("resolvedRoles returns all matched derived roles", async () => {
      const engine = createToride({ policy });
      const resource: ResourceRef = {
        type: "Document",
        id: "doc1",
        attributes: {
          owner_id: "user1",
          visibility: "public",
        },
      };

      const roles = await engine.resolvedRoles(owner, resource);
      expect(roles).toContain("owner");
      expect(roles).toContain("viewer");
    });
  });

  // ─── Fail-closed for $env conditions ───────────────────────────
  describe("Fail-closed for $env conditions in derived roles", () => {
    it("$env conditions in when clauses are fail-closed (deny)", async () => {
      const envPolicy: Policy = {
        version: "1",
        actors: { User: { attributes: { id: "string" } } },
        resources: {
          Document: {
            roles: ["viewer"],
            permissions: ["read"],
            grants: { viewer: ["read"] },
            derived_roles: [
              {
                role: "viewer",
                when: {
                  "$env.feature_flag": true,
                },
              },
            ],
          },
        },
      };

      const engine = createToride({ policy: envPolicy });
      const resource: ResourceRef = {
        type: "Document",
        id: "doc1",
      };

      // $env conditions cannot be resolved in derived role evaluation
      // -> fail-closed -> role not assigned
      const result = await engine.can(owner, "read", resource);
      expect(result).toBe(false);
    });
  });

  // ─── Constraint builder (T025) ─────────────────────────────────
  describe("Constraint builder: derived roles with $resource conditions", () => {
    it("emits field constraint for $resource.owner_id eq $actor.id in derived role", async () => {
      const simplePolicy: Policy = {
        version: "1",
        actors: { User: { attributes: { id: "string" } } },
        resources: {
          Document: {
            roles: ["owner"],
            permissions: ["read"],
            grants: { owner: ["read"] },
            derived_roles: [
              {
                role: "owner",
                when: {
                  "$resource.owner_id": { eq: "$actor.id" },
                },
              },
            ],
          },
        },
      };

      const engine = createToride({ policy: simplePolicy });
      const result = await engine.buildConstraints(owner, "read", "Document");

      // Should emit a field constraint, not "always" or "forbidden"
      expect("constraints" in result).toBe(true);
      if ("constraints" in result) {
        // Should contain a field_eq constraint for owner_id = "user1"
        expect(result.constraints).toEqual(
          expect.objectContaining({ type: "field_eq", field: "owner_id", value: "user1" }),
        );
      }
    });

    it("emits field constraint for $actor.id in $resource.editor_ids in derived role", async () => {
      const simplePolicy: Policy = {
        version: "1",
        actors: { User: { attributes: { id: "string" } } },
        resources: {
          Document: {
            roles: ["editor"],
            permissions: ["update"],
            grants: { editor: ["update"] },
            derived_roles: [
              {
                role: "editor",
                when: {
                  "$actor.id": { in: "$resource.editor_ids" },
                },
              },
            ],
          },
        },
      };

      const engine = createToride({ policy: simplePolicy });
      const result = await engine.buildConstraints(editor, "update", "Document");

      expect("constraints" in result).toBe(true);
      if ("constraints" in result) {
        // Should contain a field_includes constraint for editor_ids includes "user2"
        expect(result.constraints).toEqual(
          expect.objectContaining({ type: "field_includes", field: "editor_ids", value: "user2" }),
        );
      }
    });

    it("emits field constraint for pattern 4 (actor_type + when with $resource)", async () => {
      const simplePolicy: Policy = {
        version: "1",
        actors: { User: { attributes: { id: "string" } } },
        resources: {
          Document: {
            roles: ["viewer"],
            permissions: ["read"],
            grants: { viewer: ["read"] },
            derived_roles: [
              {
                role: "viewer",
                actor_type: "User",
                when: {
                  "$resource.visibility": "public",
                },
              },
            ],
          },
        },
      };

      const engine = createToride({ policy: simplePolicy });
      const result = await engine.buildConstraints(owner, "read", "Document");

      expect("constraints" in result).toBe(true);
      if ("constraints" in result) {
        expect(result.constraints).toEqual(
          expect.objectContaining({ type: "field_eq", field: "visibility", value: "public" }),
        );
      }
    });

    it("returns forbidden when actor_type does not match in constraint builder", async () => {
      const simplePolicy: Policy = {
        version: "1",
        actors: {
          User: { attributes: { id: "string" } },
          Service: { attributes: { id: "string" } },
        },
        resources: {
          Document: {
            roles: ["viewer"],
            permissions: ["read"],
            grants: { viewer: ["read"] },
            derived_roles: [
              {
                role: "viewer",
                actor_type: "User",
                when: {
                  "$resource.visibility": "public",
                },
              },
            ],
          },
        },
      };

      const serviceActor: ActorRef = { type: "Service", id: "svc1", attributes: { id: "svc1" } };
      const engine = createToride({ policy: simplePolicy });
      const result = await engine.buildConstraints(serviceActor, "read", "Document");

      expect("forbidden" in result && result.forbidden).toBe(true);
    });
  });
});
