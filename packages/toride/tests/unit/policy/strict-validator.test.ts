// T074: Tests for strict mode warnings (unused roles, unreachable rules, redundant derived_roles)

import { describe, it, expect, beforeAll } from "vitest";
import type { Policy } from "../../../src/types.js";

describe("strict mode validation", () => {
  let validatePolicyStrict: (
    policy: Policy,
  ) => { errors: { message: string; path: string }[]; warnings: { message: string; path: string }[] };

  beforeAll(async () => {
    const mod = await import("../../../src/policy/validator.js");
    validatePolicyStrict = mod.validatePolicyStrict;
  });

  /** Helper to build a minimal valid policy and override parts. */
  function makePolicy(overrides: Partial<Policy> = {}): Policy {
    return {
      version: "1",
      actors: {
        User: {
          attributes: {
            email: "string",
            department: "string",
            isSuperAdmin: "boolean",
          },
        },
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
    } as Policy;
  }

  it("returns no warnings for a fully used policy", () => {
    const result = validatePolicyStrict(makePolicy());
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  // ─── Unused Roles ──────────────────────────────────────────────

  it("warns about unused roles not referenced in grants", () => {
    const policy = makePolicy({
      resources: {
        Task: {
          roles: ["viewer", "editor", "admin", "commenter"],
          permissions: ["read", "update", "delete"],
          grants: {
            viewer: ["read"],
            editor: ["read", "update"],
            admin: ["all"],
          },
        },
      },
    });
    const result = validatePolicyStrict(policy);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].message).toContain("commenter");
    expect(result.warnings[0].message).toContain("never used");
    expect(result.warnings[0].path).toContain("resources.Task.roles");
  });

  it("does not warn about roles used in derived_roles", () => {
    const policy = makePolicy({
      global_roles: {
        superadmin: {
          actor_type: "User",
          when: { "$actor.isSuperAdmin": true },
        },
      },
      resources: {
        Task: {
          roles: ["viewer", "admin"],
          permissions: ["read", "delete"],
          grants: {
            viewer: ["read"],
          },
          derived_roles: [{ role: "admin", from_global_role: "superadmin" }],
        },
      },
    });
    const result = validatePolicyStrict(policy);
    expect(result.errors).toHaveLength(0);
    // admin is used as derived_roles target, viewer is used in grants
    expect(result.warnings).toHaveLength(0);
  });

  it("does not warn about roles used in rules", () => {
    const policy = makePolicy({
      resources: {
        Task: {
          roles: ["viewer", "editor"],
          permissions: ["read", "update"],
          grants: {
            viewer: ["read"],
          },
          rules: [
            {
              effect: "permit" as const,
              roles: ["editor"],
              permissions: ["update"],
              when: { "resource.isPublic": true },
            },
          ],
        },
      },
    });
    const result = validatePolicyStrict(policy);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("does not warn about roles used in field_access", () => {
    const policy = makePolicy({
      resources: {
        Employee: {
          roles: ["hr_admin", "viewer"],
          permissions: ["read", "update"],
          grants: {
            viewer: ["read"],
          },
          field_access: {
            salary: {
              read: ["hr_admin"],
            },
          },
        },
      },
    });
    const result = validatePolicyStrict(policy);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("warns about multiple unused roles", () => {
    const policy = makePolicy({
      resources: {
        Task: {
          roles: ["viewer", "editor", "admin", "commenter", "reviewer"],
          permissions: ["read"],
          grants: {
            viewer: ["read"],
          },
        },
      },
    });
    const result = validatePolicyStrict(policy);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThanOrEqual(4);
  });

  // ─── Unreachable Rules ─────────────────────────────────────────

  it("warns about unreachable rules affecting permissions not granted to any role", () => {
    const policy = makePolicy({
      resources: {
        Task: {
          roles: ["viewer"],
          permissions: ["read", "update", "delete"],
          grants: {
            viewer: ["read"],
          },
          rules: [
            {
              effect: "forbid" as const,
              permissions: ["delete"],
              when: { "resource.archived": true },
            },
          ],
        },
      },
    });
    const result = validatePolicyStrict(policy);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.some((w) => w.message.includes("unreachable"))).toBe(
      true,
    );
    expect(
      result.warnings.some((w) => w.message.includes("delete")),
    ).toBe(true);
  });

  it("does not warn about rules for permissions granted via 'all'", () => {
    const policy = makePolicy({
      resources: {
        Task: {
          roles: ["admin"],
          permissions: ["read", "update", "delete"],
          grants: {
            admin: ["all"],
          },
          rules: [
            {
              effect: "forbid" as const,
              permissions: ["delete"],
              when: { "resource.archived": true },
            },
          ],
        },
      },
    });
    const result = validatePolicyStrict(policy);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  // ─── Redundant Derived Roles ───────────────────────────────────

  it("warns about redundant derived_roles (duplicate derivation entries)", () => {
    const policy = makePolicy({
      global_roles: {
        superadmin: {
          actor_type: "User",
          when: { "$actor.isSuperAdmin": true },
        },
      },
      resources: {
        Task: {
          roles: ["admin"],
          permissions: ["read"],
          grants: {
            admin: ["all"],
          },
          derived_roles: [
            { role: "admin", from_global_role: "superadmin" },
            { role: "admin", from_global_role: "superadmin" },
          ],
        },
      },
    });
    const result = validatePolicyStrict(policy);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.some((w) => w.message.includes("redundant") || w.message.includes("duplicate"))).toBe(
      true,
    );
  });

  it("does not warn about different derived_roles for the same role", () => {
    const policy = makePolicy({
      global_roles: {
        superadmin: {
          actor_type: "User",
          when: { "$actor.isSuperAdmin": true },
        },
      },
      resources: {
        Project: {
          roles: ["admin"],
          permissions: ["read"],
          grants: { admin: ["read"] },
        },
        Task: {
          roles: ["admin"],
          permissions: ["read"],
          grants: {
            admin: ["all"],
          },
          relations: {
            project: "Project",
          },
          derived_roles: [
            { role: "admin", from_global_role: "superadmin" },
            { role: "admin", from_role: "admin", on_relation: "project" },
          ],
        },
      },
    });
    const result = validatePolicyStrict(policy);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  // ─── Strict + Errors ───────────────────────────────────────────

  it("returns both errors and warnings when policy has both", () => {
    const policy = makePolicy({
      resources: {
        Task: {
          roles: ["viewer", "commenter"],
          permissions: ["read"],
          grants: {
            viewer: ["read"],
            manager: ["read"], // error: undeclared role
          },
        },
      },
    });
    const result = validatePolicyStrict(policy);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
  });
});
