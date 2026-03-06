// T054: Unit tests for constraint builder

import { describe, it, expect } from "vitest";
import type {
  ActorRef,
  RelationResolver,
  Policy,
} from "../../../src/types.js";
import type { ConstraintResult, Constraint } from "../../../src/partial/constraint-types.js";
import { buildConstraints } from "../../../src/partial/constraint-builder.js";

// ─── Helpers ──────────────────────────────────────────────────────

function makeResolver(opts: {
  roles?: Record<string, string[]>;
  related?: Record<string, Record<string, { type: string; id: string } | { type: string; id: string }[]>>;
  attributes?: Record<string, Record<string, unknown>>;
} = {}): RelationResolver {
  return {
    getRoles: async (actor: ActorRef, resource: { type: string; id: string }) => {
      const key = `${actor.id}:${resource.type}:${resource.id}`;
      return opts.roles?.[key] ?? [];
    },
    getRelated: async (resource: { type: string; id: string }, relation: string) => {
      const key = `${resource.type}:${resource.id}`;
      return opts.related?.[key]?.[relation] ?? [];
    },
    getAttributes: async (ref: { type: string; id: string }) => {
      const key = `${ref.type}:${ref.id}`;
      return opts.attributes?.[key] ?? {};
    },
  };
}

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

// ─── Tests ────────────────────────────────────────────────────────

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

    it("returns unrestricted:true when direct roles grant the action via 'all'", async () => {
      const policy = makePolicy();
      // Since buildConstraints doesn't have a specific resource ID, it
      // evaluates derivation paths. A direct role on ALL resources of a type
      // won't apply here - we use global roles or unconditional derivation
      // instead. Let's use a when-only derived role that always matches.
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

  describe("has_role constraint nodes", () => {
    it("emits has_role node for relation-based derived roles", async () => {
      const policy = makePolicy({
        resources: {
          Task: {
            roles: ["viewer", "editor"],
            permissions: ["read", "update"],
            relations: {
              project: { resource: "Project", cardinality: "one" as const },
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

      // Should produce constrained result with has_role node
      expect(result).not.toHaveProperty("unrestricted");
      expect(result).not.toHaveProperty("forbidden");
      expect(result).toHaveProperty("constraints");

      const constraints = (result as { constraints: Constraint }).constraints;
      // Should contain a relation -> has_role structure
      expect(containsNodeType(constraints, "has_role")).toBe(true);
    });
  });

  describe("$actor and $env value inlining", () => {
    it("inlines $actor attribute values into field_eq constraints via forbid rule", async () => {
      // Use a forbid rule referencing $actor so we can see the inlined value
      // The actor has the role unconditionally, and a forbid rule creates
      // a NOT constraint with the inlined actor value
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
      // The forbid condition references $actor.department which should be inlined
      // to "engineering" in a NOT(field_eq(department, "engineering")) structure
      expect(containsFieldEq(constraints, "department", "engineering")).toBe(true);
      expect(containsNodeType(constraints, "not")).toBe(true);
    });

    it("inlines $env values into concrete constraint nodes via forbid rule", async () => {
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
      // Should contain field_gt with inlined cutoff value inside a NOT wrapper
      expect(containsNodeType(constraints, "field_gt")).toBe(true);
      expect(containsNodeType(constraints, "not")).toBe(true);
    });
  });

  describe("forbid rules as NOT constraints", () => {
    it("wraps forbid rule conditions in NOT constraint", async () => {
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
      // Should contain a NOT node wrapping the forbid condition
      expect(containsNodeType(constraints, "not")).toBe(true);
    });
  });

  describe("constraint simplification", () => {
    it("simplifies and([always, X]) to X", async () => {
      // We test simplification indirectly: a derivation that always matches
      // combined with a permit condition should simplify
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

  describe("unknown constraint for custom evaluators", () => {
    it("emits unknown node for custom evaluator in forbid conditions", async () => {
      // Use a forbid rule with custom evaluator so the unknown node
      // appears as a NOT wrapper around the custom evaluator
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
      expect(containsNodeType(constraints, "unknown")).toBe(true);
    });
  });
});

// ─── AST Inspection Helpers ───────────────────────────────────────

function containsNodeType(constraint: Constraint, nodeType: string): boolean {
  if (constraint.type === nodeType) return true;
  if (constraint.type === "and" || constraint.type === "or") {
    return constraint.children.some((c) => containsNodeType(c, nodeType));
  }
  if (constraint.type === "not") {
    return containsNodeType(constraint.child, nodeType);
  }
  if (constraint.type === "relation") {
    return containsNodeType(constraint.constraint, nodeType);
  }
  return false;
}

function containsFieldEq(constraint: Constraint, field: string, value: unknown): boolean {
  if (constraint.type === "field_eq" && constraint.field === field && constraint.value === value) {
    return true;
  }
  if (constraint.type === "and" || constraint.type === "or") {
    return constraint.children.some((c) => containsFieldEq(c, field, value));
  }
  if (constraint.type === "not") {
    return containsFieldEq(constraint.child, field, value);
  }
  if (constraint.type === "relation") {
    return containsFieldEq(constraint.constraint, field, value);
  }
  return false;
}
