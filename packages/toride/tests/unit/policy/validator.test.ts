import { describe, it, expect, beforeAll } from "vitest";
import { ValidationError } from "../../../src/types.js";
import type { Policy } from "../../../src/types.js";

describe("cross-reference validator", () => {
  let validatePolicy: (policy: Policy) => void;

  beforeAll(async () => {
    const mod = await import("../../../src/policy/validator.js");
    validatePolicy = mod.validatePolicy;
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

  it("accepts a valid policy without errors", () => {
    expect(() => validatePolicy(makePolicy())).not.toThrow();
  });

  it("detects undeclared role in grants", () => {
    const policy = makePolicy({
      resources: {
        Task: {
          roles: ["viewer", "editor"],
          permissions: ["read", "update"],
          grants: {
            viewer: ["read"],
            editor: ["read", "update"],
            manager: ["read", "update"],
          },
        },
      },
    });
    expect(() => validatePolicy(policy)).toThrow(ValidationError);
    try {
      validatePolicy(policy);
    } catch (e) {
      expect((e as ValidationError).message).toContain("manager");
      expect((e as ValidationError).message).toContain("resources.Task.grants");
    }
  });

  it("detects undeclared permission in grants", () => {
    const policy = makePolicy({
      resources: {
        Task: {
          roles: ["viewer"],
          permissions: ["read"],
          grants: {
            viewer: ["read", "write"],
          },
        },
      },
    });
    expect(() => validatePolicy(policy)).toThrow(ValidationError);
    try {
      validatePolicy(policy);
    } catch (e) {
      expect((e as ValidationError).message).toContain("write");
    }
  });

  it("allows 'all' in grants", () => {
    const policy = makePolicy({
      resources: {
        Task: {
          roles: ["admin"],
          permissions: ["read", "update"],
          grants: {
            admin: ["all"],
          },
        },
      },
    });
    expect(() => validatePolicy(policy)).not.toThrow();
  });

  it("detects unknown relation in derived_roles on_relation", () => {
    const policy = makePolicy({
      resources: {
        Project: {
          roles: ["admin"],
          permissions: ["read"],
          grants: { admin: ["read"] },
        },
        Task: {
          roles: ["admin"],
          permissions: ["read"],
          grants: { admin: ["read"] },
          relations: {
            project: { resource: "Project", cardinality: "one" as const },
          },
          derived_roles: [
            { role: "admin", from_role: "admin", on_relation: "org" },
          ],
        },
      },
    });
    expect(() => validatePolicy(policy)).toThrow(ValidationError);
    try {
      validatePolicy(policy);
    } catch (e) {
      expect((e as ValidationError).message).toContain("org");
      expect((e as ValidationError).message).toContain("derived_roles");
    }
  });

  it("detects undeclared role in derived_roles target role", () => {
    const policy = makePolicy({
      resources: {
        Project: {
          roles: ["admin"],
          permissions: ["read"],
          grants: { admin: ["read"] },
        },
        Task: {
          roles: ["viewer"],
          permissions: ["read"],
          grants: { viewer: ["read"] },
          relations: {
            project: { resource: "Project", cardinality: "one" as const },
          },
          derived_roles: [
            { role: "admin", from_role: "admin", on_relation: "project" },
          ],
        },
      },
    });
    expect(() => validatePolicy(policy)).toThrow(ValidationError);
    try {
      validatePolicy(policy);
    } catch (e) {
      expect((e as ValidationError).message).toContain("admin");
      expect((e as ValidationError).message).toContain("derived_roles");
    }
  });

  it("detects undeclared global role in from_global_role", () => {
    const policy = makePolicy({
      resources: {
        Task: {
          roles: ["admin"],
          permissions: ["read"],
          grants: { admin: ["read"] },
          derived_roles: [
            { role: "admin", from_global_role: "superadmin" },
          ],
        },
      },
    });
    expect(() => validatePolicy(policy)).toThrow(ValidationError);
    try {
      validatePolicy(policy);
    } catch (e) {
      expect((e as ValidationError).message).toContain("superadmin");
    }
  });

  it("detects invalid actor type in global_roles", () => {
    const policy = makePolicy({
      global_roles: {
        superadmin: {
          actor_type: "Bot",
          when: { "$actor.isSuper": true },
        },
      },
    });
    expect(() => validatePolicy(policy)).toThrow(ValidationError);
    try {
      validatePolicy(policy);
    } catch (e) {
      expect((e as ValidationError).message).toContain("Bot");
    }
  });

  it("detects undeclared actor_type in derived role entries", () => {
    const policy = makePolicy({
      resources: {
        Task: {
          roles: ["editor"],
          permissions: ["update"],
          grants: { editor: ["update"] },
          derived_roles: [
            {
              role: "editor",
              actor_type: "ServiceAccount",
              when: { "$actor.isBot": true },
            },
          ],
        },
      },
    });
    expect(() => validatePolicy(policy)).toThrow(ValidationError);
    try {
      validatePolicy(policy);
    } catch (e) {
      expect((e as ValidationError).message).toContain("ServiceAccount");
    }
  });

  it("detects undeclared permission in rules", () => {
    const policy = makePolicy({
      resources: {
        Task: {
          roles: ["editor"],
          permissions: ["read", "update"],
          grants: { editor: ["read", "update"] },
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
    expect(() => validatePolicy(policy)).toThrow(ValidationError);
    try {
      validatePolicy(policy);
    } catch (e) {
      expect((e as ValidationError).message).toContain("delete");
      expect((e as ValidationError).message).toContain("rules");
    }
  });

  it("detects undeclared role in rules roles", () => {
    const policy = makePolicy({
      resources: {
        Task: {
          roles: ["editor"],
          permissions: ["read"],
          grants: { editor: ["read"] },
          rules: [
            {
              effect: "permit" as const,
              roles: ["manager"],
              permissions: ["read"],
              when: { "resource.isPublic": true },
            },
          ],
        },
      },
    });
    expect(() => validatePolicy(policy)).toThrow(ValidationError);
    try {
      validatePolicy(policy);
    } catch (e) {
      expect((e as ValidationError).message).toContain("manager");
    }
  });

  it("detects undeclared role in field_access", () => {
    const policy = makePolicy({
      resources: {
        Employee: {
          roles: ["hr_admin"],
          permissions: ["read", "update"],
          grants: { hr_admin: ["all"] },
          field_access: {
            salary: {
              read: ["hr_admin", "manager"],
            },
          },
        },
      },
    });
    expect(() => validatePolicy(policy)).toThrow(ValidationError);
    try {
      validatePolicy(policy);
    } catch (e) {
      expect((e as ValidationError).message).toContain("manager");
      expect((e as ValidationError).message).toContain("field_access");
    }
  });

  it("detects relation target referencing undeclared resource", () => {
    const policy = makePolicy({
      resources: {
        Task: {
          roles: ["viewer"],
          permissions: ["read"],
          grants: { viewer: ["read"] },
          relations: {
            project: { resource: "Project", cardinality: "one" as const },
          },
        },
      },
    });
    expect(() => validatePolicy(policy)).toThrow(ValidationError);
    try {
      validatePolicy(policy);
    } catch (e) {
      expect((e as ValidationError).message).toContain("Project");
    }
  });

  it("detects mutual exclusivity violation in derived role (from_role without on_relation)", () => {
    const policy = makePolicy({
      resources: {
        Task: {
          roles: ["editor"],
          permissions: ["read"],
          grants: { editor: ["read"] },
          derived_roles: [
            { role: "editor", from_role: "editor" } as any,
          ],
        },
      },
    });
    expect(() => validatePolicy(policy)).toThrow(ValidationError);
  });

  it("detects mutual exclusivity violation in derived role (conflicting patterns)", () => {
    const policy = makePolicy({
      resources: {
        Project: {
          roles: ["admin"],
          permissions: ["read"],
          grants: { admin: ["read"] },
        },
        Task: {
          roles: ["editor"],
          permissions: ["read"],
          grants: { editor: ["read"] },
          relations: {
            project: { resource: "Project", cardinality: "one" as const },
            assignee: { resource: "User", cardinality: "one" as const },
          },
          derived_roles: [
            {
              role: "editor",
              from_role: "admin",
              on_relation: "project",
              from_relation: "assignee",
            } as any,
          ],
        },
      },
    });
    expect(() => validatePolicy(policy)).toThrow(ValidationError);
  });

  it("accepts a complex valid policy", () => {
    const policy: Policy = {
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
      global_roles: {
        superadmin: {
          actor_type: "User",
          when: { "$actor.isSuperAdmin": true },
        },
      },
      resources: {
        Project: {
          roles: ["admin", "editor", "viewer"],
          permissions: ["read", "update", "delete"],
          grants: {
            admin: ["all"],
            editor: ["read", "update"],
            viewer: ["read"],
          },
          derived_roles: [
            { role: "admin", from_global_role: "superadmin" },
          ],
        },
        Task: {
          roles: ["editor", "viewer"],
          permissions: ["read", "update", "delete"],
          relations: {
            project: { resource: "Project", cardinality: "one" },
            assignee: { resource: "User", cardinality: "one" },
          },
          grants: {
            editor: ["read", "update", "delete"],
            viewer: ["read"],
          },
          derived_roles: [
            { role: "editor", from_role: "editor", on_relation: "project" },
            { role: "editor", from_relation: "assignee" },
          ],
          rules: [
            {
              effect: "forbid",
              permissions: ["update", "delete"],
              when: { "resource.archived": true },
            },
          ],
        },
      },
    };
    expect(() => validatePolicy(policy)).not.toThrow();
  });
});
