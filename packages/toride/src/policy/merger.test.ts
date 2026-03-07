import { describe, it, expect } from "vitest";
import type { Policy } from "../types.js";

// Will be implemented in T096
import { mergePolicies } from "./merger.js";
// Will be updated in T097
import { Toride } from "../engine.js";

/** Helper to build a minimal valid policy. */
function makePolicy(overrides: Partial<Policy> = {}): Policy {
  return {
    version: "1",
    actors: {},
    resources: {},
    ...overrides,
  };
}

describe("mergePolicies", () => {
  it("merges disjoint actors additively", () => {
    const base = makePolicy({
      actors: {
        User: { attributes: { email: "string" } },
      },
    });
    const overlay = makePolicy({
      actors: {
        Bot: { attributes: { name: "string" } },
      },
    });
    const merged = mergePolicies(base, overlay);
    expect(merged.actors).toHaveProperty("User");
    expect(merged.actors).toHaveProperty("Bot");
    expect(merged.actors.User.attributes.email).toBe("string");
    expect(merged.actors.Bot.attributes.name).toBe("string");
  });

  it("merges overlapping actors by union of attributes", () => {
    const base = makePolicy({
      actors: {
        User: { attributes: { email: "string" } },
      },
    });
    const overlay = makePolicy({
      actors: {
        User: { attributes: { name: "string" } },
      },
    });
    const merged = mergePolicies(base, overlay);
    expect(merged.actors.User.attributes).toEqual({
      email: "string",
      name: "string",
    });
  });

  it("merges disjoint resources additively", () => {
    const base = makePolicy({
      resources: {
        Task: {
          roles: ["viewer"],
          permissions: ["read"],
          grants: { viewer: ["read"] },
        },
      },
    });
    const overlay = makePolicy({
      resources: {
        Project: {
          roles: ["admin"],
          permissions: ["delete"],
          grants: { admin: ["all"] },
        },
      },
    });
    const merged = mergePolicies(base, overlay);
    expect(merged.resources).toHaveProperty("Task");
    expect(merged.resources).toHaveProperty("Project");
  });

  it("merges overlapping resources: roles and permissions are unioned", () => {
    const base = makePolicy({
      resources: {
        Task: {
          roles: ["viewer"],
          permissions: ["read"],
          grants: { viewer: ["read"] },
        },
      },
    });
    const overlay = makePolicy({
      resources: {
        Task: {
          roles: ["editor"],
          permissions: ["update"],
          grants: { editor: ["update"] },
        },
      },
    });
    const merged = mergePolicies(base, overlay);
    expect(merged.resources.Task.roles).toContain("viewer");
    expect(merged.resources.Task.roles).toContain("editor");
    expect(merged.resources.Task.permissions).toContain("read");
    expect(merged.resources.Task.permissions).toContain("update");
  });

  it("merges grants additively for non-conflicting roles", () => {
    const base = makePolicy({
      resources: {
        Task: {
          roles: ["viewer", "editor"],
          permissions: ["read", "update"],
          grants: { viewer: ["read"] },
        },
      },
    });
    const overlay = makePolicy({
      resources: {
        Task: {
          roles: ["editor"],
          permissions: ["update"],
          grants: { editor: ["update"] },
        },
      },
    });
    const merged = mergePolicies(base, overlay);
    expect(merged.resources.Task.grants).toEqual({
      viewer: ["read"],
      editor: ["update"],
    });
  });

  it("throws on conflicting grants (same role, different permissions)", () => {
    const base = makePolicy({
      resources: {
        Task: {
          roles: ["viewer"],
          permissions: ["read"],
          grants: { viewer: ["read"] },
        },
      },
    });
    const overlay = makePolicy({
      resources: {
        Task: {
          roles: ["viewer"],
          permissions: ["read", "update"],
          grants: { viewer: ["read", "update"] },
        },
      },
    });
    expect(() => mergePolicies(base, overlay)).toThrow(/conflict/i);
  });

  it("does not throw when same role has identical grants", () => {
    const base = makePolicy({
      resources: {
        Task: {
          roles: ["viewer"],
          permissions: ["read"],
          grants: { viewer: ["read"] },
        },
      },
    });
    const overlay = makePolicy({
      resources: {
        Task: {
          roles: ["viewer"],
          permissions: ["read"],
          grants: { viewer: ["read"] },
        },
      },
    });
    const merged = mergePolicies(base, overlay);
    expect(merged.resources.Task.grants).toEqual({ viewer: ["read"] });
  });

  it("silently appends rules from overlay", () => {
    const rule1 = {
      effect: "forbid" as const,
      permissions: ["delete"],
      when: { "$resource.status": "archived" },
    };
    const rule2 = {
      effect: "permit" as const,
      roles: ["admin"],
      permissions: ["delete"],
      when: { "$resource.priority": "low" },
    };
    const base = makePolicy({
      resources: {
        Task: {
          roles: ["viewer"],
          permissions: ["read", "delete"],
          rules: [rule1],
        },
      },
    });
    const overlay = makePolicy({
      resources: {
        Task: {
          roles: ["admin"],
          permissions: ["delete"],
          rules: [rule2],
        },
      },
    });
    const merged = mergePolicies(base, overlay);
    expect(merged.resources.Task.rules).toHaveLength(2);
    expect(merged.resources.Task.rules![0]).toEqual(rule1);
    expect(merged.resources.Task.rules![1]).toEqual(rule2);
  });

  it("merges derived_roles by appending", () => {
    const dr1 = { role: "viewer", from_global_role: "superadmin" };
    const dr2 = { role: "editor", from_role: "editor", on_relation: "project" };
    const base = makePolicy({
      resources: {
        Task: {
          roles: ["viewer", "editor"],
          permissions: ["read"],
          derived_roles: [dr1],
        },
      },
    });
    const overlay = makePolicy({
      resources: {
        Task: {
          roles: ["editor"],
          permissions: ["read"],
          derived_roles: [dr2],
        },
      },
    });
    const merged = mergePolicies(base, overlay);
    expect(merged.resources.Task.derived_roles).toHaveLength(2);
  });

  it("merges field_access additively", () => {
    const base = makePolicy({
      resources: {
        Employee: {
          roles: ["viewer", "hr"],
          permissions: ["read"],
          field_access: {
            salary: { read: ["hr"] },
          },
        },
      },
    });
    const overlay = makePolicy({
      resources: {
        Employee: {
          roles: ["admin"],
          permissions: ["read"],
          field_access: {
            ssn: { read: ["admin"] },
          },
        },
      },
    });
    const merged = mergePolicies(base, overlay);
    expect(merged.resources.Employee.field_access).toHaveProperty("salary");
    expect(merged.resources.Employee.field_access).toHaveProperty("ssn");
  });

  it("merges field_access for same field by union of roles", () => {
    const base = makePolicy({
      resources: {
        Employee: {
          roles: ["hr", "admin"],
          permissions: ["read"],
          field_access: {
            salary: { read: ["hr"] },
          },
        },
      },
    });
    const overlay = makePolicy({
      resources: {
        Employee: {
          roles: ["admin"],
          permissions: ["read"],
          field_access: {
            salary: { read: ["admin"] },
          },
        },
      },
    });
    const merged = mergePolicies(base, overlay);
    expect(merged.resources.Employee.field_access!.salary.read).toContain("hr");
    expect(merged.resources.Employee.field_access!.salary.read).toContain("admin");
  });

  it("merges global_roles additively", () => {
    const base = makePolicy({
      actors: { User: { attributes: { isAdmin: "boolean" } } },
      global_roles: {
        superadmin: { actor_type: "User", when: { "$actor.isAdmin": true } },
      },
    });
    const overlay = makePolicy({
      actors: { Bot: { attributes: { isService: "boolean" } } },
      global_roles: {
        service: { actor_type: "Bot", when: { "$actor.isService": true } },
      },
    });
    const merged = mergePolicies(base, overlay);
    expect(merged.global_roles).toHaveProperty("superadmin");
    expect(merged.global_roles).toHaveProperty("service");
  });

  it("merges relations additively", () => {
    const base = makePolicy({
      resources: {
        Task: {
          roles: ["viewer"],
          permissions: ["read"],
          relations: {
            project: "Project",
          },
        },
      },
    });
    const overlay = makePolicy({
      resources: {
        Task: {
          roles: ["editor"],
          permissions: ["update"],
          relations: {
            assignee: "User",
          },
        },
      },
    });
    const merged = mergePolicies(base, overlay);
    expect(merged.resources.Task.relations).toHaveProperty("project");
    expect(merged.resources.Task.relations).toHaveProperty("assignee");
  });

  it("handles missing optional fields (treats as empty)", () => {
    const base = makePolicy({
      resources: {
        Task: {
          roles: ["viewer"],
          permissions: ["read"],
        },
      },
    });
    const overlay = makePolicy({
      resources: {
        Task: {
          roles: ["editor"],
          permissions: ["update"],
          rules: [{ effect: "permit" as const, permissions: ["update"], when: { "$resource.active": true } }],
        },
      },
    });
    const merged = mergePolicies(base, overlay);
    expect(merged.resources.Task.rules).toHaveLength(1);
  });

  it("returns version '1'", () => {
    const merged = mergePolicies(makePolicy(), makePolicy());
    expect(merged.version).toBe("1");
  });

  it("rejects __proto__ key in actors", () => {
    const base = makePolicy({ actors: {} });
    const overlayActors = Object.create(null);
    overlayActors["__proto__"] = { attributes: {} };
    const overlay = makePolicy({ actors: overlayActors });
    expect(() => mergePolicies(base, overlay)).toThrow(/Dangerous key/);
  });

  it("rejects constructor key in resources", () => {
    const base = makePolicy({ resources: {} });
    const overlay = makePolicy({
      resources: {
        constructor: {
          roles: ["viewer"],
          permissions: ["read"],
        },
      },
    });
    expect(() => mergePolicies(base, overlay)).toThrow(/Dangerous key/);
  });

  it("rejects prototype key in resources", () => {
    const base = makePolicy({ resources: {} });
    const overlay = makePolicy({
      resources: {
        prototype: {
          roles: ["viewer"],
          permissions: ["read"],
        },
      },
    });
    expect(() => mergePolicies(base, overlay)).toThrow(/Dangerous key/);
  });

  it("does not include tests from either policy", () => {
    const base = makePolicy({
      tests: [{ name: "t1", actor: { type: "User", id: "1", attributes: {} }, action: "read", resource: { type: "Task", id: "1" }, expected: "allow" }],
    });
    const overlay = makePolicy();
    const merged = mergePolicies(base, overlay);
    // Tests should not be merged
    expect(merged.tests).toBeUndefined();
  });
});

describe("setPolicy", () => {
  it("swaps the policy atomically", async () => {
    // Policy1: Task with viewer role derived from actor attribute
    const policy1 = makePolicy({
      actors: { User: { attributes: { is_viewer: "boolean", is_admin: "boolean" } } },
      resources: {
        Task: {
          roles: ["viewer"],
          permissions: ["read"],
          grants: { viewer: ["read"] },
          derived_roles: [
            { role: "viewer", when: { "$actor.is_viewer": true } },
          ],
        },
      },
    });
    // Policy2: Project with admin role derived from actor attribute
    const policy2 = makePolicy({
      actors: { User: { attributes: { is_viewer: "boolean", is_admin: "boolean" } } },
      resources: {
        Project: {
          roles: ["admin"],
          permissions: ["delete"],
          grants: { admin: ["all"] },
          derived_roles: [
            { role: "admin", when: { "$actor.is_admin": true } },
          ],
        },
      },
    });

    const engine = new Toride({ policy: policy1 });
    // Should find Task with viewer role
    expect(await engine.can(
      { type: "User", id: "1", attributes: { is_viewer: true } },
      "read",
      { type: "Task", id: "1" },
    )).toBe(true);

    // After setPolicy, Task should not exist, Project should
    engine.setPolicy(policy2);

    expect(await engine.can(
      { type: "User", id: "1", attributes: { is_viewer: true } },
      "read",
      { type: "Task", id: "1" },
    )).toBe(false);

    // Now actor with is_admin gets admin on Project
    const engine2 = new Toride({ policy: policy2 });
    expect(await engine2.can(
      { type: "User", id: "1", attributes: { is_admin: true } },
      "delete",
      { type: "Project", id: "1" },
    )).toBe(true);
  });
});
