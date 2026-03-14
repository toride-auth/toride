import { describe, it, expect, vi, beforeAll } from "vitest";
import { ValidationError } from "../types.js";

// Will be implemented in T020
// import { loadYaml, loadJson } from "./parser.js";

describe("policy parser", () => {
  // Dynamically import to allow test-first approach
  let loadYaml: (input: string) => Promise<import("../types.js").Policy>;
  let loadJson: (input: string) => Promise<import("../types.js").Policy>;

  beforeAll(async () => {
    const mod = await import("./parser.js");
    loadYaml = mod.loadYaml;
    loadJson = mod.loadJson;
  });

  const VALID_YAML = `
version: "1"
actors:
  User:
    attributes:
      email: string
      department: string
      isSuperAdmin: boolean
resources:
  Task:
    roles: [viewer, editor]
    permissions: [read, update, delete]
    grants:
      viewer: [read]
      editor: [read, update, delete]
`;

  const VALID_JSON = JSON.stringify({
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
        roles: ["viewer", "editor"],
        permissions: ["read", "update", "delete"],
        grants: {
          viewer: ["read"],
          editor: ["read", "update", "delete"],
        },
      },
    },
  });

  describe("loadYaml", () => {
    it("parses a valid YAML policy into a typed Policy object", async () => {
      const policy = await loadYaml(VALID_YAML);
      expect(policy.version).toBe("1");
      expect(policy.actors.User.attributes.email).toEqual({ kind: "primitive", type: "string" });
      expect(policy.resources.Task.roles).toEqual(["viewer", "editor"]);
      expect(policy.resources.Task.permissions).toEqual(["read", "update", "delete"]);
      expect(policy.resources.Task.grants).toEqual({
        viewer: ["read"],
        editor: ["read", "update", "delete"],
      });
    });

    it("parses a policy with global_roles", async () => {
      const yaml = `
version: "1"
actors:
  User:
    attributes:
      isSuperAdmin: boolean
global_roles:
  superadmin:
    actor_type: User
    when:
      $actor.isSuperAdmin: true
resources:
  Task:
    roles: [admin]
    permissions: [read, delete]
    grants:
      admin: [all]
    derived_roles:
      - role: admin
        from_global_role: superadmin
`;
      const policy = await loadYaml(yaml);
      expect(policy.global_roles).toBeDefined();
      expect(policy.global_roles!.superadmin.actor_type).toBe("User");
      expect(policy.global_roles!.superadmin.when).toEqual({
        "$actor.isSuperAdmin": true,
      });
    });

    it("parses a policy with relations and derived roles", async () => {
      const yaml = `
version: "1"
actors:
  User:
    attributes:
      email: string
resources:
  Project:
    roles: [admin, editor]
    permissions: [read, update, delete]
    grants:
      admin: [all]
      editor: [read, update]
  Task:
    roles: [editor, viewer]
    permissions: [read, update]
    relations:
      project: Project
      assignee: User
    grants:
      editor: [read, update]
      viewer: [read]
    derived_roles:
      - role: editor
        from_role: editor
        on_relation: project
      - role: editor
        from_relation: assignee
`;
      const policy = await loadYaml(yaml);
      expect(policy.resources.Task.relations!.project).toBe("Project");
      expect(policy.resources.Task.relations!.assignee).toBe("User");
      expect(policy.resources.Task.derived_roles).toHaveLength(2);
      expect(policy.resources.Task.derived_roles![0]).toEqual({
        role: "editor",
        from_role: "editor",
        on_relation: "project",
      });
      expect(policy.resources.Task.derived_roles![1]).toEqual({
        role: "editor",
        from_relation: "assignee",
      });
    });

    it("parses a policy with rules and condition expressions", async () => {
      const yaml = `
version: "1"
actors:
  User:
    attributes:
      department: string
resources:
  Task:
    roles: [editor]
    permissions: [read, update, delete]
    grants:
      editor: [read, update, delete]
    rules:
      - effect: forbid
        permissions: [delete]
        when:
          resource.archived: true
      - effect: permit
        roles: [editor]
        permissions: [update]
        when:
          $actor.department:
            eq: engineering
`;
      const policy = await loadYaml(yaml);
      expect(policy.resources.Task.rules).toHaveLength(2);
      expect(policy.resources.Task.rules![0].effect).toBe("forbid");
      expect(policy.resources.Task.rules![0].when).toEqual({
        "resource.archived": true,
      });
      expect(policy.resources.Task.rules![1].roles).toEqual(["editor"]);
    });

    it("parses recursive condition expressions with any/all", async () => {
      const yaml = `
version: "1"
actors:
  User:
    attributes:
      department: string
      level: number
resources:
  Task:
    roles: [editor]
    permissions: [update]
    grants:
      editor: [update]
    rules:
      - effect: permit
        permissions: [update]
        when:
          any:
            - $actor.department: engineering
            - all:
                - $actor.level:
                    gte: 5
                - resource.isPublic: true
`;
      const policy = await loadYaml(yaml);
      const rule = policy.resources.Task.rules![0];
      expect(rule.when).toHaveProperty("any");
      const any = (rule.when as { any: unknown[] }).any;
      expect(any).toHaveLength(2);
      expect(any[1]).toHaveProperty("all");
    });

    it("parses field_access definitions", async () => {
      const yaml = `
version: "1"
actors:
  User:
    attributes:
      email: string
resources:
  Employee:
    roles: [hr_admin, manager, viewer]
    permissions: [read, update]
    grants:
      hr_admin: [all]
      manager: [read, update]
      viewer: [read]
    field_access:
      salary:
        read: [hr_admin, manager]
        update: [hr_admin]
`;
      const policy = await loadYaml(yaml);
      expect(policy.resources.Employee.field_access!.salary.read).toEqual([
        "hr_admin",
        "manager",
      ]);
      expect(policy.resources.Employee.field_access!.salary.update).toEqual([
        "hr_admin",
      ]);
    });

    it("parses a policy with resource attributes", async () => {
      const yaml = `
version: "1"
actors:
  User:
    attributes:
      email: string
resources:
  Document:
    roles: [viewer, editor]
    permissions: [read, update]
    attributes:
      status: string
      priority: number
      archived: boolean
    grants:
      viewer: [read]
      editor: [read, update]
`;
      const policy = await loadYaml(yaml);
      expect(policy.resources.Document.attributes).toEqual({
        status: { kind: "primitive", type: "string" },
        priority: { kind: "primitive", type: "number" },
        archived: { kind: "primitive", type: "boolean" },
      });
    });

    it("parses a policy without resource attributes (backward compatible)", async () => {
      const policy = await loadYaml(VALID_YAML);
      // attributes should be undefined when not specified
      expect(policy.resources.Task.attributes).toBeUndefined();
    });

    it("rejects invalid resource attribute types", async () => {
      const yaml = `
version: "1"
actors:
  User:
    attributes:
      email: string
resources:
  Document:
    roles: [viewer]
    permissions: [read]
    attributes:
      status: array
`;
      await expect(loadYaml(yaml)).rejects.toThrow(ValidationError);
    });

    it("rejects non-string resource attribute type values", async () => {
      const yaml = `
version: "1"
actors:
  User:
    attributes:
      email: string
resources:
  Document:
    roles: [viewer]
    permissions: [read]
    attributes:
      status: 42
`;
      await expect(loadYaml(yaml)).rejects.toThrow(ValidationError);
    });

    it("throws ValidationError for missing version", async () => {
      const yaml = `
actors:
  User:
    attributes:
      email: string
resources:
  Task:
    roles: [viewer]
    permissions: [read]
`;
      await expect(loadYaml(yaml)).rejects.toThrow(ValidationError);
    });

    it("throws ValidationError for invalid version", async () => {
      const yaml = `
version: "2"
actors:
  User:
    attributes:
      email: string
resources:
  Task:
    roles: [viewer]
    permissions: [read]
`;
      await expect(loadYaml(yaml)).rejects.toThrow(ValidationError);
    });

    it("throws ValidationError for missing actors", async () => {
      const yaml = `
version: "1"
resources:
  Task:
    roles: [viewer]
    permissions: [read]
`;
      await expect(loadYaml(yaml)).rejects.toThrow(ValidationError);
    });

    it("throws ValidationError for missing resources", async () => {
      const yaml = `
version: "1"
actors:
  User:
    attributes:
      email: string
`;
      await expect(loadYaml(yaml)).rejects.toThrow(ValidationError);
    });

    it("throws ValidationError for missing roles in resource", async () => {
      const yaml = `
version: "1"
actors:
  User:
    attributes:
      email: string
resources:
  Task:
    permissions: [read]
`;
      await expect(loadYaml(yaml)).rejects.toThrow(ValidationError);
    });

    it("throws ValidationError for missing permissions in resource", async () => {
      const yaml = `
version: "1"
actors:
  User:
    attributes:
      email: string
resources:
  Task:
    roles: [viewer]
`;
      await expect(loadYaml(yaml)).rejects.toThrow(ValidationError);
    });

    it("throws ValidationError for invalid attribute type", async () => {
      const yaml = `
version: "1"
actors:
  User:
    attributes:
      email: object
resources:
  Task:
    roles: [viewer]
    permissions: [read]
`;
      await expect(loadYaml(yaml)).rejects.toThrow(ValidationError);
    });

    it("throws ValidationError for invalid rule effect", async () => {
      const yaml = `
version: "1"
actors:
  User:
    attributes:
      email: string
resources:
  Task:
    roles: [editor]
    permissions: [read]
    grants:
      editor: [read]
    rules:
      - effect: allow
        permissions: [read]
        when:
          resource.isPublic: true
`;
      await expect(loadYaml(yaml)).rejects.toThrow(ValidationError);
    });

    it("throws ValidationError with migration message for old relation syntax", async () => {
      const yaml = `
version: "1"
actors:
  User:
    attributes:
      email: string
resources:
  Task:
    roles: [viewer]
    permissions: [read]
    relations:
      project:
        resource: Project
        cardinality: multiple
`;
      await expect(loadYaml(yaml)).rejects.toThrow(ValidationError);
      await expect(loadYaml(yaml)).rejects.toThrow(/old object syntax/);
      await expect(loadYaml(yaml)).rejects.toThrow(/project:\s*Project/);
    });

    describe("nested attribute declarations", () => {
      it("parses string[] shorthand as array schema with string items", async () => {
        const yaml = `
version: "1"
actors:
  User:
    attributes:
      tags: string[]
resources:
  Document:
    roles: [viewer]
    permissions: [read]
    attributes:
      labels: string[]
`;
        const policy = await loadYaml(yaml);
        expect(policy.actors.User.attributes.tags).toEqual({
          kind: "array",
          items: { kind: "primitive", type: "string" },
        });
        expect(policy.resources.Document.attributes!.labels).toEqual({
          kind: "array",
          items: { kind: "primitive", type: "string" },
        });
      });

      it("parses number[] shorthand as array schema with number items", async () => {
        const yaml = `
version: "1"
actors:
  User:
    attributes:
      scores: number[]
resources:
  Task:
    roles: [viewer]
    permissions: [read]
    attributes:
      priority: number[]
`;
        const policy = await loadYaml(yaml);
        expect(policy.actors.User.attributes.scores).toEqual({
          kind: "array",
          items: { kind: "primitive", type: "number" },
        });
      });

      it("parses boolean[] shorthand as array schema with boolean items", async () => {
        const yaml = `
version: "1"
actors:
  User:
    attributes:
      flags: boolean[]
resources:
  Task:
    roles: [viewer]
    permissions: [read]
    attributes:
      settings: boolean[]
`;
        const policy = await loadYaml(yaml);
        expect(policy.actors.User.attributes.flags).toEqual({
          kind: "array",
          items: { kind: "primitive", type: "boolean" },
        });
      });

      it("parses nested object attribute with multiple fields", async () => {
        const yaml = `
version: "1"
actors:
  User:
    attributes:
      address:
        city: string
        zip: string
        country: string
resources:
  Task:
    roles: [viewer]
    permissions: [read]
    attributes:
      metadata:
        createdAt: string
        version: number
`;
        const policy = await loadYaml(yaml);
        expect(policy.actors.User.attributes.address).toEqual({
          kind: "object",
          fields: {
            city: { kind: "primitive", type: "string" },
            zip: { kind: "primitive", type: "string" },
            country: { kind: "primitive", type: "string" },
          },
        });
        expect(policy.resources.Task.attributes!.metadata).toEqual({
          kind: "object",
          fields: {
            createdAt: { kind: "primitive", type: "string" },
            version: { kind: "primitive", type: "number" },
          },
        });
      });

      it("parses array-of-objects using type: array + items syntax", async () => {
        const yaml = `
version: "1"
actors:
  User:
    attributes:
      collaborators:
        type: array
        items:
          userId: string
          role: string
resources:
  Task:
    roles: [viewer]
    permissions: [read]
    attributes:
      assignees:
        type: array
        items:
          id: string
          name: string
`;
        const policy = await loadYaml(yaml);
        expect(policy.actors.User.attributes.collaborators).toEqual({
          kind: "array",
          items: {
            kind: "object",
            fields: {
              userId: { kind: "primitive", type: "string" },
              role: { kind: "primitive", type: "string" },
            },
          },
        });
      });

      it("disambiguates type field in nested object - not treated as array declaration", async () => {
        const yaml = `
version: "1"
actors:
  User:
    attributes:
      profile:
        name: string
        type: string
        age: number
resources:
  Task:
    roles: [viewer]
    permissions: [read]
`;
        const policy = await loadYaml(yaml);
        expect(policy.actors.User.attributes.profile).toEqual({
          kind: "object",
          fields: {
            name: { kind: "primitive", type: "string" },
            type: { kind: "primitive", type: "string" },
            age: { kind: "primitive", type: "number" },
          },
        });
      });

      it("rejects depth 5 nested objects (max depth 3)", async () => {
        const yaml = `
version: "1"
actors:
  User:
    attributes:
      level1:
        level2:
          level3:
            level4:
              level5: string
resources:
  Task:
    roles: [viewer]
    permissions: [read]
`;
        await expect(loadYaml(yaml)).rejects.toThrow(ValidationError);
        await expect(loadYaml(yaml)).rejects.toThrow(/depth.*3/i);
      });

      it("allows depth 3 nested objects (max allowed)", async () => {
        const yaml = `
version: "1"
actors:
  User:
    attributes:
      level1:
        level2:
          level3: string
resources:
  Document:
    roles: [viewer]
    permissions: [read]
    attributes:
      a:
        b:
          c: string
`;
        const policy = await loadYaml(yaml);
        expect(policy.actors.User.attributes.level1).toEqual({
          kind: "object",
          fields: {
            level2: {
              kind: "object",
              fields: {
                level3: { kind: "primitive", type: "string" },
              },
            },
          },
        });
      });

      it("handles mixed flat and nested attributes in same resource", async () => {
        const yaml = `
version: "1"
actors:
  User:
    attributes:
      email: string
      profile:
        name: string
        age: number
      tags: string[]
resources:
  Task:
    roles: [viewer]
    permissions: [read]
    attributes:
      status: string
      metadata:
        createdAt: string
        priority: number
      permissions: string[]
`;
        const policy = await loadYaml(yaml);
        expect(policy.actors.User.attributes.email).toEqual({ kind: "primitive", type: "string" });
        expect(policy.actors.User.attributes.profile).toEqual({
          kind: "object",
          fields: {
            name: { kind: "primitive", type: "string" },
            age: { kind: "primitive", type: "number" },
          },
        });
        expect(policy.actors.User.attributes.tags).toEqual({
          kind: "array",
          items: { kind: "primitive", type: "string" },
        });
        expect(policy.resources.Task.attributes!.status).toEqual({ kind: "primitive", type: "string" });
      });
    });
  });

  describe("loadJson", () => {
    it("parses valid JSON policy", async () => {
      const policy = await loadJson(VALID_JSON);
      expect(policy.version).toBe("1");
      expect(policy.actors.User.attributes.email).toEqual({ kind: "primitive", type: "string" });
      expect(policy.resources.Task.roles).toEqual(["viewer", "editor"]);
    });

    it("throws ValidationError for invalid JSON structure", async () => {
      const json = JSON.stringify({
        version: "1",
        actors: {},
        resources: {
          Task: {
            roles: "not-an-array",
            permissions: ["read"],
          },
        },
      });
      await expect(loadJson(json)).rejects.toThrow(ValidationError);
    });

    describe("nested attribute declarations", () => {
      it("normalizes nested object attributes in JSON", async () => {
        const json = JSON.stringify({
          version: "1",
          actors: {
            User: {
              attributes: {
                address: {
                  city: "string",
                  zip: "string",
                },
              },
            },
          },
          resources: {
            Task: {
              roles: ["viewer"],
              permissions: ["read"],
              attributes: {
                metadata: {
                  createdAt: "string",
                  version: "number",
                },
              },
            },
          },
        });
        const policy = await loadJson(json);
        expect(policy.actors.User.attributes.address).toEqual({
          kind: "object",
          fields: {
            city: { kind: "primitive", type: "string" },
            zip: { kind: "primitive", type: "string" },
          },
        });
        expect(policy.resources.Task.attributes!.metadata).toEqual({
          kind: "object",
          fields: {
            createdAt: { kind: "primitive", type: "string" },
            version: { kind: "primitive", type: "number" },
          },
        });
      });

      it("normalizes explicit array declaration with type: array + items", async () => {
        const json = JSON.stringify({
          version: "1",
          actors: {
            User: {
              attributes: {
                collaborators: {
                  type: "array",
                  items: {
                    userId: "string",
                    role: "string",
                  },
                },
              },
            },
          },
          resources: {
            Task: {
              roles: ["viewer"],
              permissions: ["read"],
            },
          },
        });
        const policy = await loadJson(json);
        expect(policy.actors.User.attributes.collaborators).toEqual({
          kind: "array",
          items: {
            kind: "object",
            fields: {
              userId: { kind: "primitive", type: "string" },
              role: { kind: "primitive", type: "string" },
            },
          },
        });
      });

      it("passes through already-canonical AttributeSchema form unchanged", async () => {
        const json = JSON.stringify({
          version: "1",
          actors: {
            User: {
              attributes: {
                profile: {
                  kind: "object",
                  fields: {
                    name: { kind: "primitive", type: "string" },
                  },
                },
                tags: {
                  kind: "array",
                  items: { kind: "primitive", type: "string" },
                },
              },
            },
          },
          resources: {
            Task: {
              roles: ["viewer"],
              permissions: ["read"],
            },
          },
        });
        const policy = await loadJson(json);
        expect(policy.actors.User.attributes.profile).toEqual({
          kind: "object",
          fields: {
            name: { kind: "primitive", type: "string" },
          },
        });
        expect(policy.actors.User.attributes.tags).toEqual({
          kind: "array",
          items: { kind: "primitive", type: "string" },
        });
      });

      it("rejects string[] shorthand in JSON input", async () => {
        const json = JSON.stringify({
          version: "1",
          actors: {
            User: {
              attributes: {
                tags: "string[]",
              },
            },
          },
          resources: {
            Task: {
              roles: ["viewer"],
              permissions: ["read"],
            },
          },
        });
        await expect(loadJson(json)).rejects.toThrow(ValidationError);
      });

      it("normalizes object with user field named 'kind' as nested object", async () => {
        const json = JSON.stringify({
          version: "1",
          actors: {
            User: {
              attributes: {
                profile: {
                  kind: "string",
                  name: "string",
                },
              },
            },
          },
          resources: {
            Task: {
              roles: ["viewer"],
              permissions: ["read"],
            },
          },
        });
        const policy = await loadJson(json);
        expect(policy.actors.User.attributes.profile).toEqual({
          kind: "object",
          fields: {
            kind: { kind: "primitive", type: "string" },
            name: { kind: "primitive", type: "string" },
          },
        });
      });
    });
  });

  describe("loadYaml > nested attribute declarations", () => {
    it("normalizes object with user field named 'kind' as nested object", async () => {
      const yaml = `
version: "1"
actors:
  User:
    attributes:
      profile:
        kind: string
        name: string
resources:
  Task:
    roles: [viewer]
    permissions: [read]
`;
      const policy = await loadYaml(yaml);
      expect(policy.actors.User.attributes.profile).toEqual({
        kind: "object",
        fields: {
          kind: { kind: "primitive", type: "string" },
          name: { kind: "primitive", type: "string" },
        },
      });
    });

    it("accepts array of objects at depth 2 with nested fields", async () => {
      const yaml = `
version: "1"
actors:
  User:
    attributes:
      teams:
        type: array
        items:
          name: string
          role: string
resources:
  Task:
    roles: [viewer]
    permissions: [read]
`;
      const policy = await loadYaml(yaml);
      expect(policy.actors.User.attributes.teams).toEqual({
        kind: "array",
        items: {
          kind: "object",
          fields: {
            name: { kind: "primitive", type: "string" },
            role: { kind: "primitive", type: "string" },
          },
        },
      });
    });

    it("accepts array items with deeply nested object path at depth 3", async () => {
      const yaml = `
version: "1"
actors:
  User:
    attributes:
      members:
        type: array
        items:
          org:
            address:
              city: string
resources:
  Task:
    roles: [viewer]
    permissions: [read]
`;
      const policy = await loadYaml(yaml);
      expect(policy.actors.User.attributes.members).toEqual({
        kind: "array",
        items: {
          kind: "object",
          fields: {
            org: {
              kind: "object",
              fields: {
                address: {
                  kind: "object",
                  fields: {
                    city: { kind: "primitive", type: "string" },
                  },
                },
              },
            },
          },
        },
      });
    });

    it("rejects depth 5 through array items", async () => {
      const yaml = `
version: "1"
actors:
  User:
    attributes:
      deepArray:
        type: array
        items:
          level1:
            level2:
              level3:
                level4:
                  level5: string
resources:
  Task:
    roles: [viewer]
    permissions: [read]
`;
      await expect(loadYaml(yaml)).rejects.toThrow(ValidationError);
      await expect(loadYaml(yaml)).rejects.toThrow(/depth.*3/i);
    });
  });
});
