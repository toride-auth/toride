// T054: Unit tests for constraint builder

import { describe, it, expect } from "vitest";
import type {
  ActorRef,
  Policy,
} from "../../../src/types.js";
import type { Constraint } from "../../../src/partial/constraint-types.js";
import { buildConstraints, simplify } from "../../../src/partial/constraint-builder.js";
import { makeResolver } from "../../helpers/test-adapter.js";

// ---- Helpers ----

const baseActor: ActorRef = { type: "User", id: "u1", attributes: {} };

function makePolicy(overrides: Partial<Policy> = {}): Policy {
  return {
    version: "1",
    actors: {
      User: { attributes: { email: "string" } },
    },
    resources: {
      Task: {
        roles: ["viewer", "editor", "admin"],
        permissions: ["read", "update", "delete"],
        grants: {
          viewer: ["read"],
          editor: ["read", "update"],
          admin: ["all"],
        },
      },
    },
    ...overrides,
  };
}

// ---- Tests ----

describe("buildConstraints", () => {
  describe("unrestricted result", () => {
    it("returns unrestricted:true for superadmin with global role granting all", async () => {
      const policy = makePolicy({
        global_roles: {
          superadmin: { actor_type: "User", when: { "$actor.isSuperAdmin": true } },
        },
        resources: {
          Task: {
            roles: ["viewer", "editor", "admin", "owner"],
            permissions: ["read", "update", "delete"],
            grants: {
              owner: ["all"],
            },
            derived_roles: [
              { role: "owner", from_global_role: "superadmin" },
            ],
          },
        },
      });
      const actor: ActorRef = { type: "User", id: "u1", attributes: { isSuperAdmin: true } };
      const resolver = makeResolver();

      const result = await buildConstraints(actor, "read", "Task", resolver, policy);
      expect(result).toEqual({ unrestricted: true });
    });

    it("returns unrestricted:true when when-only derived role matches", async () => {
      const policyWithAlwaysAdmin = makePolicy({
        resources: {
          Task: {
            roles: ["admin"],
            permissions: ["read", "update", "delete"],
            grants: { admin: ["all"] },
            derived_roles: [
              { role: "admin", when: { "$actor.isAdmin": true } },
            ],
          },
        },
      });
      const actor: ActorRef = { type: "User", id: "u1", attributes: { isAdmin: true } };
      const resolver = makeResolver();

      const result = await buildConstraints(actor, "read", "Task", resolver, policyWithAlwaysAdmin);
      expect(result).toEqual({ unrestricted: true });
    });
  });

  describe("forbidden result", () => {
    it("returns forbidden:true for unknown resource type", async () => {
      const policy = makePolicy();
      const resolver = makeResolver();

      const result = await buildConstraints(baseActor, "read", "Unknown", resolver, policy);
      expect(result).toEqual({ forbidden: true });
    });

    it("returns forbidden:true when no derivation paths and no direct roles grant the action", async () => {
      const policy = makePolicy({
        resources: {
          Task: {
            roles: ["viewer", "editor"],
            permissions: ["read", "update"],
            grants: { viewer: ["read"], editor: ["read", "update"] },
            // No derived roles - no paths to access
          },
        },
      });
      const resolver = makeResolver();

      const result = await buildConstraints(baseActor, "read", "Task", resolver, policy);
      expect(result).toEqual({ forbidden: true });
    });

    it("returns forbidden:true when action is not in any grant", async () => {
      const policy = makePolicy({
        resources: {
          Task: {
            roles: ["viewer"],
            permissions: ["read", "delete"],
            grants: { viewer: ["read"] },
            derived_roles: [
              { role: "viewer", when: { "$actor.active": true } },
            ],
          },
        },
      });
      const actor: ActorRef = { type: "User", id: "u1", attributes: { active: true } };
      const resolver = makeResolver();

      // "delete" is not granted to any role
      const result = await buildConstraints(actor, "delete", "Task", resolver, policy);
      expect(result).toEqual({ forbidden: true });
    });
  });

  describe("has_role constraint nodes (Finding 7: structural assertions)", () => {
    it("emits relation -> has_role structure for relation-based derived roles", async () => {
      const policy = makePolicy({
        resources: {
          Task: {
            roles: ["viewer", "editor"],
            permissions: ["read", "update"],
            relations: {
              project: "Project",
            },
            grants: { editor: ["read", "update"] },
            derived_roles: [
              { role: "editor", from_role: "admin", on_relation: "project" },
            ],
          },
          Project: {
            roles: ["admin"],
            permissions: ["read", "delete"],
            grants: { admin: ["all"] },
          },
        },
      });
      const resolver = makeResolver();

      const result = await buildConstraints(baseActor, "read", "Task", resolver, policy);

      // Verify full tree structure, not just node type presence
      expect(result).not.toHaveProperty("unrestricted");
      expect(result).not.toHaveProperty("forbidden");
      expect(result).toHaveProperty("constraints");

      const constraints = (result as { constraints: Constraint }).constraints;
      // Should be a relation constraint wrapping a has_role constraint
      expect(constraints).toEqual({
        type: "relation",
        field: "project",
        resourceType: "Project",
        constraint: {
          type: "has_role",
          actorId: "u1",
          actorType: "User",
          role: "admin",
        },
      });
    });
  });

  describe("$actor and $env value inlining (Finding 7: structural assertions)", () => {
    it("inlines $actor attribute values into NOT(field_eq) via forbid rule", async () => {
      const policy = makePolicy({
        resources: {
          Task: {
            roles: ["viewer"],
            permissions: ["read"],
            grants: { viewer: ["read"] },
            derived_roles: [
              { role: "viewer", when: { "$actor.active": true } },
            ],
            rules: [
              {
                effect: "forbid" as const,
                permissions: ["read"],
                when: { "$resource.department": "$actor.department" },
              },
            ],
          },
        },
      });
      const actor: ActorRef = {
        type: "User",
        id: "u1",
        attributes: { active: true, department: "engineering" },
      };
      const resolver = makeResolver();

      const result = await buildConstraints(actor, "read", "Task", resolver, policy);
      expect(result).toHaveProperty("constraints");

      const constraints = (result as { constraints: Constraint }).constraints;
      // Verify exact structure: NOT(field_eq(department, "engineering"))
      expect(constraints).toEqual({
        type: "not",
        child: {
          type: "field_eq",
          field: "department",
          value: "engineering",
        },
      });
    });

    it("inlines $env values into NOT(field_gt) via forbid rule", async () => {
      const policy = makePolicy({
        resources: {
          Task: {
            roles: ["viewer"],
            permissions: ["read"],
            grants: { viewer: ["read"] },
            derived_roles: [
              { role: "viewer", when: { "$actor.active": true } },
            ],
            rules: [
              {
                effect: "forbid" as const,
                permissions: ["read"],
                when: { "$resource.createdAt": { gt: "$env.cutoff" } },
              },
            ],
          },
        },
      });
      const actor: ActorRef = {
        type: "User",
        id: "u1",
        attributes: { active: true },
      };
      const resolver = makeResolver();

      const result = await buildConstraints(
        actor,
        "read",
        "Task",
        resolver,
        policy,
        { env: { cutoff: "2024-01-01" } },
      );
      expect(result).toHaveProperty("constraints");

      const constraints = (result as { constraints: Constraint }).constraints;
      // Verify exact structure: NOT(field_gt(createdAt, "2024-01-01"))
      expect(constraints).toEqual({
        type: "not",
        child: {
          type: "field_gt",
          field: "createdAt",
          value: "2024-01-01",
        },
      });
    });
  });

  describe("forbid rules as NOT constraints (Finding 7: structural assertions)", () => {
    it("wraps forbid rule conditions in AND(always-simplified, NOT(field_eq))", async () => {
      const policy = makePolicy({
        resources: {
          Task: {
            roles: ["admin"],
            permissions: ["read", "delete"],
            grants: { admin: ["all"] },
            derived_roles: [
              { role: "admin", when: { "$actor.isAdmin": true } },
            ],
            rules: [
              {
                effect: "forbid" as const,
                permissions: ["delete"],
                when: { "$resource.archived": true },
              },
            ],
          },
        },
      });
      const actor: ActorRef = {
        type: "User",
        id: "u1",
        attributes: { isAdmin: true },
      };
      const resolver = makeResolver();

      const result = await buildConstraints(actor, "delete", "Task", resolver, policy);
      expect(result).toHaveProperty("constraints");

      const constraints = (result as { constraints: Constraint }).constraints;
      // derived role simplifies to always, combined with NOT(forbid)
      // simplify(and([always, not(field_eq)])) => not(field_eq)
      expect(constraints).toEqual({
        type: "not",
        child: {
          type: "field_eq",
          field: "archived",
          value: true,
        },
      });
    });
  });

  describe("constraint simplification", () => {
    it("simplifies and([always, X]) to X", async () => {
      const policy = makePolicy({
        resources: {
          Task: {
            roles: ["admin"],
            permissions: ["read"],
            grants: { admin: ["read"] },
            derived_roles: [
              { role: "admin", when: { "$actor.isAdmin": true } },
            ],
          },
        },
      });
      const actor: ActorRef = {
        type: "User",
        id: "u1",
        attributes: { isAdmin: true },
      };
      const resolver = makeResolver();

      // Admin with unconditional grant + no rules = should be unrestricted
      const result = await buildConstraints(actor, "read", "Task", resolver, policy);
      expect(result).toEqual({ unrestricted: true });
    });
  });

  describe("unknown constraint for custom evaluators (Finding 7: structural assertions)", () => {
    it("emits NOT(unknown) for custom evaluator in forbid conditions", async () => {
      const policy = makePolicy({
        resources: {
          Task: {
            roles: ["viewer"],
            permissions: ["read"],
            grants: { viewer: ["read"] },
            derived_roles: [
              { role: "viewer", when: { "$actor.active": true } },
            ],
            rules: [
              {
                effect: "forbid" as const,
                permissions: ["read"],
                when: { "$resource.status": { custom: "businessHours" } },
              },
            ],
          },
        },
      });
      const actor: ActorRef = {
        type: "User",
        id: "u1",
        attributes: { active: true },
      };
      const resolver = makeResolver();

      const result = await buildConstraints(actor, "read", "Task", resolver, policy);
      expect(result).toHaveProperty("constraints");

      const constraints = (result as { constraints: Constraint }).constraints;
      // Verify exact structure: NOT(unknown("businessHours"))
      expect(constraints).toEqual({
        type: "not",
        child: {
          type: "unknown",
          name: "businessHours",
        },
      });
    });
  });

  describe("prototype pollution guard (Finding 2)", () => {
    it("rejects __proto__ in actor attribute paths", async () => {
      const policy = makePolicy({
        global_roles: {
          superadmin: { actor_type: "User", when: { "$actor.__proto__.polluted": true } },
        },
        resources: {
          Task: {
            roles: ["owner"],
            permissions: ["read"],
            grants: { owner: ["read"] },
            derived_roles: [
              { role: "owner", from_global_role: "superadmin" },
            ],
          },
        },
      });
      const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
      const resolver = makeResolver();

      const result = await buildConstraints(actor, "read", "Task", resolver, policy);
      // Should NOT grant access via prototype pollution
      expect(result).toEqual({ forbidden: true });
    });
  });

  describe("Finding 1: $resource/$env conditions in actor-only derivation", () => {
    it("rejects derived role with $resource condition (prevents privilege escalation)", async () => {
      const policy = makePolicy({
        resources: {
          Task: {
            roles: ["viewer"],
            permissions: ["read"],
            grants: { viewer: ["read"] },
            derived_roles: [
              // This role has a $resource condition that CANNOT be evaluated
              // during actor-only derivation. It must NOT be granted silently.
              { role: "viewer", when: { "$resource.status": "active" } },
            ],
          },
        },
      });
      const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
      const resolver = makeResolver();

      const result = await buildConstraints(actor, "read", "Task", resolver, policy);
      // Must be forbidden, NOT unrestricted (the old bug was granting access here)
      expect(result).toEqual({ forbidden: true });
    });

    it("rejects derived role with $env condition (prevents privilege escalation)", async () => {
      const policy = makePolicy({
        resources: {
          Task: {
            roles: ["viewer"],
            permissions: ["read"],
            grants: { viewer: ["read"] },
            derived_roles: [
              { role: "viewer", when: { "$env.feature_flag": true } },
            ],
          },
        },
      });
      const actor: ActorRef = { type: "User", id: "u1", attributes: {} };
      const resolver = makeResolver();

      const result = await buildConstraints(actor, "read", "Task", resolver, policy, { env: { feature_flag: true } });
      // Must be forbidden because $env conditions cannot be evaluated during derivation
      expect(result).toEqual({ forbidden: true });
    });
  });

  describe("depth guard for simplify (Finding 10)", () => {
    it("handles deeply nested constraints without stack overflow", () => {
      // Build a deeply nested NOT chain
      let constraint: Constraint = { type: "field_eq", field: "a", value: 1 };
      for (let i = 0; i < 200; i++) {
        constraint = { type: "not", child: constraint };
      }
      // Should not throw; depth guard limits recursion
      const result = simplify(constraint);
      expect(result).toBeDefined();
    });
  });
});
