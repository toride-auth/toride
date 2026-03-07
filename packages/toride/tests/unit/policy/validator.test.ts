import { describe, it, expect, beforeAll } from "vitest";
import { ValidationError } from "../../../src/types.js";
import type { Policy } from "../../../src/types.js";

describe("cross-reference validator", () => {
  let validatePolicy: (policy: Policy) => void;
  let validatePolicyResult: (
    policy: Policy,
  ) => { errors: { message: string; path: string }[] };

  beforeAll(async () => {
    const mod = await import("../../../src/policy/validator.js");
    validatePolicy = mod.validatePolicy;
    validatePolicyResult = mod.validatePolicyResult;
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
            project: "Project",
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
            project: "Project",
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
            project: "Project",
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
            project: "Project",
            assignee: "User",
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
            project: "Project",
            assignee: "User",
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

  // ─── T073: $actor attribute validation ─────────────────────────

  describe("$actor attribute validation", () => {
    it("detects invalid $actor attribute in global_role when condition", () => {
      const policy = makePolicy({
        global_roles: {
          superadmin: {
            actor_type: "User",
            when: { "$actor.nonExistent": true },
          },
        },
      });
      expect(() => validatePolicy(policy)).toThrow(ValidationError);
      try {
        validatePolicy(policy);
      } catch (e) {
        expect((e as ValidationError).message).toContain("nonExistent");
        expect((e as ValidationError).message).toContain("$actor");
        expect((e as ValidationError).path).toContain("global_roles.superadmin");
      }
    });

    it("accepts valid $actor attribute in global_role when condition", () => {
      const policy = makePolicy({
        global_roles: {
          superadmin: {
            actor_type: "User",
            when: { "$actor.isSuperAdmin": true },
          },
        },
      });
      expect(() => validatePolicy(policy)).not.toThrow();
    });

    it("detects invalid $actor attribute in derived_role when condition", () => {
      const policy = makePolicy({
        resources: {
          Task: {
            roles: ["editor"],
            permissions: ["update"],
            grants: { editor: ["update"] },
            derived_roles: [
              {
                role: "editor",
                actor_type: "User",
                when: { "$actor.unknownAttr": "value" },
              },
            ],
          },
        },
      });
      expect(() => validatePolicy(policy)).toThrow(ValidationError);
      try {
        validatePolicy(policy);
      } catch (e) {
        expect((e as ValidationError).message).toContain("unknownAttr");
        expect((e as ValidationError).message).toContain("$actor");
      }
    });

    it("detects invalid $actor attribute in rule when condition", () => {
      const policy = makePolicy({
        resources: {
          Task: {
            roles: ["editor"],
            permissions: ["read", "update"],
            grants: { editor: ["read", "update"] },
            rules: [
              {
                effect: "permit" as const,
                permissions: ["read"],
                when: { "$actor.nonExistent": true },
              },
            ],
          },
        },
      });
      expect(() => validatePolicy(policy)).toThrow(ValidationError);
      try {
        validatePolicy(policy);
      } catch (e) {
        expect((e as ValidationError).message).toContain("nonExistent");
        expect((e as ValidationError).message).toContain("$actor");
      }
    });

    it("validates $actor attrs in rules against all actor types when no actor_type", () => {
      const policy: Policy = {
        version: "1",
        actors: {
          User: {
            attributes: { email: "string" },
          },
          ServiceAccount: {
            attributes: { scope: "string" },
          },
        },
        resources: {
          Task: {
            roles: ["editor"],
            permissions: ["update"],
            grants: { editor: ["update"] },
            rules: [
              {
                effect: "permit" as const,
                permissions: ["update"],
                when: { "$actor.email": "admin@test.com" },
              },
            ],
          },
        },
      };
      // $actor.email is not valid for ServiceAccount - should error
      expect(() => validatePolicy(policy)).toThrow(ValidationError);
      try {
        validatePolicy(policy);
      } catch (e) {
        expect((e as ValidationError).message).toContain("email");
        expect((e as ValidationError).message).toContain("ServiceAccount");
      }
    });

    it("validates $actor attrs in nested any/all conditions", () => {
      const policy = makePolicy({
        global_roles: {
          superadmin: {
            actor_type: "User",
            when: {
              any: [
                { "$actor.isSuperAdmin": true },
                { "$actor.badAttr": "value" },
              ],
            },
          },
        },
      });
      expect(() => validatePolicy(policy)).toThrow(ValidationError);
      try {
        validatePolicy(policy);
      } catch (e) {
        expect((e as ValidationError).message).toContain("badAttr");
      }
    });

    it("validates $actor attrs with operator-based condition values", () => {
      const policy = makePolicy({
        global_roles: {
          superadmin: {
            actor_type: "User",
            when: { "$actor.nonExistent": { eq: true } },
          },
        },
      });
      expect(() => validatePolicy(policy)).toThrow(ValidationError);
      try {
        validatePolicy(policy);
      } catch (e) {
        expect((e as ValidationError).message).toContain("nonExistent");
      }
    });

    it("accepts $resource and $env references without validation", () => {
      const policy = makePolicy({
        resources: {
          Task: {
            roles: ["editor"],
            permissions: ["read", "update"],
            grants: { editor: ["read", "update"] },
            rules: [
              {
                effect: "permit" as const,
                permissions: ["read"],
                when: {
                  "resource.isPublic": true,
                  "$env.region": "us-east",
                },
              },
            ],
          },
        },
      });
      expect(() => validatePolicy(policy)).not.toThrow();
    });

    it("handles deeply nested all/any conditions", () => {
      const policy = makePolicy({
        global_roles: {
          admin: {
            actor_type: "User",
            when: {
              all: [
                { "$actor.isSuperAdmin": true },
                {
                  any: [
                    { "$actor.department": "engineering" },
                    {
                      all: [
                        { "$actor.email": { endsWith: "@admin.com" } },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
      });
      // All referenced attributes exist on User
      expect(() => validatePolicy(policy)).not.toThrow();
    });
  });

  // ─── T073: Multi-error collection ──────────────────────────────

  describe("multi-error collection via validatePolicyResult", () => {
    it("collects multiple errors without throwing", () => {
      const policy = makePolicy({
        resources: {
          Task: {
            roles: ["viewer"],
            permissions: ["read"],
            grants: {
              viewer: ["read"],
              manager: ["read"],  // undeclared role
              editor: ["write"],  // undeclared role AND undeclared permission
            },
          },
        },
      });
      const result = validatePolicyResult(policy);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    });

    it("returns empty errors for valid policy", () => {
      const result = validatePolicyResult(makePolicy());
      expect(result.errors).toHaveLength(0);
    });

    it("collects errors from multiple sections", () => {
      const policy = makePolicy({
        global_roles: {
          superadmin: {
            actor_type: "Bot",  // undeclared actor type
            when: { "$actor.isSuper": true },
          },
        },
        resources: {
          Task: {
            roles: ["viewer"],
            permissions: ["read"],
            grants: {
              viewer: ["read"],
              manager: ["read"],  // undeclared role
            },
          },
        },
      });
      const result = validatePolicyResult(policy);
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
      expect(result.errors.some((e) => e.message.includes("Bot"))).toBe(true);
      expect(result.errors.some((e) => e.message.includes("manager"))).toBe(true);
    });

    it("each error has a logical path", () => {
      const policy = makePolicy({
        resources: {
          Task: {
            roles: ["viewer"],
            permissions: ["read"],
            grants: {
              viewer: ["read"],
              manager: ["read"],
            },
          },
        },
      });
      const result = validatePolicyResult(policy);
      for (const error of result.errors) {
        expect(error.path).toBeDefined();
        expect(error.path.length).toBeGreaterThan(0);
      }
    });

    it("validatePolicy still throws with all errors in message", () => {
      const policy = makePolicy({
        resources: {
          Task: {
            roles: ["viewer"],
            permissions: ["read"],
            grants: {
              viewer: ["read"],
              manager: ["read"],
              editor: ["write"],
            },
          },
        },
      });
      expect(() => validatePolicy(policy)).toThrow(ValidationError);
    });
  });
});
