// T033: Unit tests for all 5 derived role patterns
// Updated for AttributeCache (Phase 3)

import { describe, it, expect, beforeAll } from "vitest";
import type {
  ActorRef,
  ResourceRef,
  Resolvers,
  Policy,
  ResourceBlock,
  ResolvedRolesDetail,
} from "../types.js";
import { AttributeCache } from "./cache.js";

describe("derived role patterns", () => {
  let resolveRoles: (
    actor: ActorRef,
    resource: ResourceRef,
    cache: AttributeCache,
    resourceBlock: ResourceBlock,
    policy: Policy,
    options?: { maxDerivedRoleDepth?: number },
  ) => Promise<ResolvedRolesDetail>;

  beforeAll(async () => {
    const mod = await import("./role-resolver.js");
    resolveRoles = mod.resolveRoles;
  });

  // ─── Helpers ──────────────────────────────────────────────────────

  const userActor: ActorRef = { type: "User", id: "u1", attributes: {} };
  const resource: ResourceRef = { type: "Project", id: "p1" };

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

  // ─── Pattern 1: Global Role (from_global_role) ────────────────────

  describe("Pattern 1: Global Role (from_global_role)", () => {
    const policy: Policy = {
      version: "1",
      actors: {
        User: { attributes: { isSuperAdmin: "boolean" } },
        ServiceAccount: { attributes: {} },
      },
      global_roles: {
        superadmin: {
          actor_type: "User",
          when: { "$actor.isSuperAdmin": true },
        },
      },
      resources: {
        Project: {
          roles: ["owner", "admin", "viewer"],
          permissions: ["read", "write", "delete"],
          derived_roles: [
            { role: "owner", from_global_role: "superadmin" },
          ],
        },
      },
    };

    const projectBlock = policy.resources["Project"]!;

    it("derives role when actor matches global role conditions", async () => {
      const actor: ActorRef = { type: "User", id: "u1", attributes: { isSuperAdmin: true } };
      const cache = makeCache();
      const result = await resolveRoles(actor, resource, cache, projectBlock, policy);

      expect(result.derived.some(d => d.role === "owner")).toBe(true);
    });

    it("does not derive role when actor attribute does not match", async () => {
      const actor: ActorRef = { type: "User", id: "u1", attributes: { isSuperAdmin: false } };
      const cache = makeCache();
      const result = await resolveRoles(actor, resource, cache, projectBlock, policy);

      expect(result.derived.some(d => d.role === "owner")).toBe(false);
    });

    it("skips global role when actor type does not match", async () => {
      const actor: ActorRef = { type: "ServiceAccount", id: "sa1", attributes: {} };
      const cache = makeCache();
      const result = await resolveRoles(actor, resource, cache, projectBlock, policy);

      expect(result.derived.some(d => d.role === "owner")).toBe(false);
    });

    it("records derivation trace via global role", async () => {
      const actor: ActorRef = { type: "User", id: "u1", attributes: { isSuperAdmin: true } };
      const cache = makeCache();
      const result = await resolveRoles(actor, resource, cache, projectBlock, policy);

      const trace = result.derived.find(d => d.role === "owner");
      expect(trace).toBeDefined();
      expect(trace!.via).toContain("global_role:superadmin");
    });
  });

  // ─── Pattern 2: Relation-based (from_role + on_relation) ──────────

  describe("Pattern 2: Relation-based (from_role + on_relation)", () => {
    const policy: Policy = {
      version: "1",
      actors: {
        User: { attributes: { is_org_admin: "boolean" } },
      },
      resources: {
        Organization: {
          roles: ["admin", "member"],
          permissions: ["read", "manage"],
          derived_roles: [
            { role: "admin", when: { "$actor.is_org_admin": true } },
          ],
        },
        Project: {
          roles: ["admin", "viewer"],
          permissions: ["read", "write", "delete"],
          relations: {
            org: "Organization",
          },
          derived_roles: [
            { role: "admin", from_role: "admin", on_relation: "org" },
          ],
        },
      },
    };

    const projectBlock = policy.resources["Project"]!;

    it("derives role when actor has the required role on the related resource", async () => {
      const actor: ActorRef = { type: "User", id: "u1", attributes: { is_org_admin: true } };
      const cache = makeCache({
        "Project:p1": { org: { type: "Organization", id: "org1" } },
      });
      const result = await resolveRoles(actor, resource, cache, projectBlock, policy);

      expect(result.derived.some(d => d.role === "admin")).toBe(true);
    });

    it("does not derive role when actor lacks the required role on related resource", async () => {
      const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
      const cache = makeCache({
        "Project:p1": { org: { type: "Organization", id: "org1" } },
      });
      const result = await resolveRoles(actor, resource, cache, projectBlock, policy);

      expect(result.derived.some(d => d.role === "admin")).toBe(false);
    });

    it("does not derive role when relation returns empty", async () => {
      const actor: ActorRef = { type: "User", id: "u1", attributes: { is_org_admin: true } };
      const cache = makeCache();
      const result = await resolveRoles(actor, resource, cache, projectBlock, policy);

      expect(result.derived.some(d => d.role === "admin")).toBe(false);
    });

    it("records derivation trace for relation-based role", async () => {
      const actor: ActorRef = { type: "User", id: "u1", attributes: { is_org_admin: true } };
      const cache = makeCache({
        "Project:p1": { org: { type: "Organization", id: "org1" } },
      });
      const result = await resolveRoles(actor, resource, cache, projectBlock, policy);

      const trace = result.derived.find(d => d.role === "admin");
      expect(trace).toBeDefined();
      expect(trace!.via).toContain("org");
    });
  });

  // ─── Pattern 3: Relation Identity (from_relation) ─────────────────

  describe("Pattern 3: Relation Identity (from_relation)", () => {
    const policy: Policy = {
      version: "1",
      actors: {
        User: { attributes: {} },
      },
      resources: {
        User: {
          roles: [],
          permissions: [],
        },
        Task: {
          roles: ["editor", "viewer"],
          permissions: ["read", "update"],
          relations: {
            assignee: "User",
          },
          derived_roles: [
            { role: "editor", from_relation: "assignee" },
          ],
        },
      },
    };

    const taskBlock = policy.resources["Task"]!;
    const taskRef: ResourceRef = { type: "Task", id: "t1" };

    it("derives role when actor ID matches the relation target", async () => {
      const cache = makeCache({
        "Task:t1": { assignee: { type: "User", id: "u1" } },
      });
      const result = await resolveRoles(userActor, taskRef, cache, taskBlock, policy);

      expect(result.derived.some(d => d.role === "editor")).toBe(true);
    });

    it("does not derive role when actor ID does not match", async () => {
      const cache = makeCache({
        "Task:t1": { assignee: { type: "User", id: "u999" } },
      });
      const result = await resolveRoles(userActor, taskRef, cache, taskBlock, policy);

      expect(result.derived.some(d => d.role === "editor")).toBe(false);
    });

    it("does not derive role when actor type does not match", async () => {
      const saActor: ActorRef = { type: "ServiceAccount", id: "u1", attributes: {} };
      const cache = makeCache({
        "Task:t1": { assignee: { type: "User", id: "u1" } },
      });
      const policyWithSA: Policy = {
        ...policy,
        actors: { ...policy.actors, ServiceAccount: { attributes: {} } },
      };
      const result = await resolveRoles(saActor, taskRef, cache, taskBlock, policyWithSA);

      expect(result.derived.some(d => d.role === "editor")).toBe(false);
    });

    it("records derivation trace for identity-based role", async () => {
      const cache = makeCache({
        "Task:t1": { assignee: { type: "User", id: "u1" } },
      });
      const result = await resolveRoles(userActor, taskRef, cache, taskBlock, policy);

      const trace = result.derived.find(d => d.role === "editor");
      expect(trace).toBeDefined();
      expect(trace!.via).toContain("assignee");
    });
  });

  // ─── Pattern 4: Actor-type + when condition ────────────────────────

  describe("Pattern 4: Actor-type + when condition", () => {
    const policy: Policy = {
      version: "1",
      actors: {
        User: { attributes: { department: "string" } },
        ServiceAccount: { attributes: {} },
      },
      resources: {
        Document: {
          roles: ["reviewer"],
          permissions: ["read", "review"],
          derived_roles: [
            {
              role: "reviewer",
              actor_type: "User",
              when: { "$actor.department": "engineering" },
            },
          ],
        },
      },
    };

    const docBlock = policy.resources["Document"]!;
    const docRef: ResourceRef = { type: "Document", id: "d1" };

    it("derives role when actor type matches and condition is met", async () => {
      const actor: ActorRef = { type: "User", id: "u1", attributes: { department: "engineering" } };
      const cache = makeCache();
      const result = await resolveRoles(actor, docRef, cache, docBlock, policy);

      expect(result.derived.some(d => d.role === "reviewer")).toBe(true);
    });

    it("does not derive role when actor type matches but condition fails", async () => {
      const actor: ActorRef = { type: "User", id: "u1", attributes: { department: "sales" } };
      const cache = makeCache();
      const result = await resolveRoles(actor, docRef, cache, docBlock, policy);

      expect(result.derived.some(d => d.role === "reviewer")).toBe(false);
    });

    it("silently skips when actor type does not match", async () => {
      const actor: ActorRef = { type: "ServiceAccount", id: "sa1", attributes: {} };
      const cache = makeCache();
      const result = await resolveRoles(actor, docRef, cache, docBlock, policy);

      expect(result.derived.some(d => d.role === "reviewer")).toBe(false);
    });

    it("records derivation trace for actor-type conditional role", async () => {
      const actor: ActorRef = { type: "User", id: "u1", attributes: { department: "engineering" } };
      const cache = makeCache();
      const result = await resolveRoles(actor, docRef, cache, docBlock, policy);

      const trace = result.derived.find(d => d.role === "reviewer");
      expect(trace).toBeDefined();
      expect(trace!.via).toContain("actor_type:User");
    });
  });

  // ─── Pattern 5: when-only condition (no actor_type) ────────────────

  describe("Pattern 5: when-only condition", () => {
    const policy: Policy = {
      version: "1",
      actors: {
        User: { attributes: { isInternal: "boolean" } },
      },
      resources: {
        Report: {
          roles: ["viewer"],
          permissions: ["read"],
          derived_roles: [
            {
              role: "viewer",
              when: { "$actor.isInternal": true },
            },
          ],
        },
      },
    };

    const reportBlock = policy.resources["Report"]!;
    const reportRef: ResourceRef = { type: "Report", id: "r1" };

    it("derives role when condition is met (any actor type)", async () => {
      const actor: ActorRef = { type: "User", id: "u1", attributes: { isInternal: true } };
      const cache = makeCache();
      const result = await resolveRoles(actor, reportRef, cache, reportBlock, policy);

      expect(result.derived.some(d => d.role === "viewer")).toBe(true);
    });

    it("does not derive role when condition fails", async () => {
      const actor: ActorRef = { type: "User", id: "u1", attributes: { isInternal: false } };
      const cache = makeCache();
      const result = await resolveRoles(actor, reportRef, cache, reportBlock, policy);

      expect(result.derived.some(d => d.role === "viewer")).toBe(false);
    });

    it("records derivation trace for when-only role", async () => {
      const actor: ActorRef = { type: "User", id: "u1", attributes: { isInternal: true } };
      const cache = makeCache();
      const result = await resolveRoles(actor, reportRef, cache, reportBlock, policy);

      const trace = result.derived.find(d => d.role === "viewer");
      expect(trace).toBeDefined();
      expect(trace!.via).toContain("when");
    });
  });

  // ─── Exhaustive evaluation ─────────────────────────────────────────

  describe("Exhaustive evaluation", () => {
    it("evaluates all derived role entries even after a match", async () => {
      const policy: Policy = {
        version: "1",
        actors: {
          User: { attributes: { isInternal: "boolean", department: "string" } },
        },
        resources: {
          Task: {
            roles: ["editor"],
            permissions: ["read", "update"],
            derived_roles: [
              { role: "editor", when: { "$actor.isInternal": true } },
              { role: "editor", actor_type: "User", when: { "$actor.department": "engineering" } },
            ],
          },
        },
      };

      const actor: ActorRef = {
        type: "User",
        id: "u1",
        attributes: { isInternal: true, department: "engineering" },
      };
      const cache = makeCache();
      const taskBlock = policy.resources["Task"]!;
      const taskRef: ResourceRef = { type: "Task", id: "t1" };

      const result = await resolveRoles(actor, taskRef, cache, taskBlock, policy);

      // Both paths should produce traces (exhaustive)
      const editorTraces = result.derived.filter(d => d.role === "editor");
      expect(editorTraces.length).toBeGreaterThanOrEqual(2);
    });
  });
});
