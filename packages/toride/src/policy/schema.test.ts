import { describe, it, expect, beforeAll } from "vitest";
import * as v from "valibot";

describe("AttributeSchemaNodeSchema", () => {
  let AttributeSchemaNodeSchema: v.BaseSchema<unknown, any, never>;

  beforeAll(async () => {
    const schema = await import("./schema.js");
    AttributeSchemaNodeSchema = schema.AttributeSchemaNodeSchema as any;
  });

  it("accepts primitive string type", () => {
    const result = v.safeParse(AttributeSchemaNodeSchema, {
      kind: "primitive",
      type: "string",
    });
    expect(result.success).toBe(true);
  });

  it("accepts primitive number type", () => {
    const result = v.safeParse(AttributeSchemaNodeSchema, {
      kind: "primitive",
      type: "number",
    });
    expect(result.success).toBe(true);
  });

  it("accepts primitive boolean type", () => {
    const result = v.safeParse(AttributeSchemaNodeSchema, {
      kind: "primitive",
      type: "boolean",
    });
    expect(result.success).toBe(true);
  });

  it("accepts nested object attribute", () => {
    const result = v.safeParse(AttributeSchemaNodeSchema, {
      kind: "object",
      fields: {
        city: { kind: "primitive", type: "string" },
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts array of primitives", () => {
    const result = v.safeParse(AttributeSchemaNodeSchema, {
      kind: "array",
      items: { kind: "primitive", type: "string" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts array of objects", () => {
    const result = v.safeParse(AttributeSchemaNodeSchema, {
      kind: "array",
      items: {
        kind: "object",
        fields: {
          id: { kind: "primitive", type: "string" },
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts max depth 3 (object → object → object → primitive)", () => {
    const result = v.safeParse(AttributeSchemaNodeSchema, {
      kind: "object",
      fields: {
        level1: {
          kind: "object",
          fields: {
            level2: {
              kind: "object",
              fields: {
                level3: { kind: "primitive", type: "string" },
              },
            },
          },
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects depth 4 (exceeds maximum of 3 levels)", () => {
    const result = v.safeParse(AttributeSchemaNodeSchema, {
      kind: "object",
      fields: {
        level1: {
          kind: "object",
          fields: {
            level2: {
              kind: "object",
              fields: {
                level3: {
                  kind: "object",
                  fields: {
                    level4: { kind: "primitive", type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid primitive type", () => {
    const result = v.safeParse(AttributeSchemaNodeSchema, {
      kind: "primitive",
      type: "date",
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown kind", () => {
    const result = v.safeParse(AttributeSchemaNodeSchema, {
      kind: "map",
      fields: {},
    });
    expect(result.success).toBe(false);
  });
});

describe("normalizeAttributes regression tests", () => {
  let loadYaml: (input: string) => Promise<unknown>;

  beforeAll(async () => {
    const parser = await import("./parser.js");
    loadYaml = parser.loadYaml as any;
  });

  it("preserves permissions array with string values", async () => {
    const yaml = `
version: "1"
actors:
  user:
    attributes: {}
resources:
  document:
    attributes: {}
    roles:
      - viewer
    permissions:
      - read
      - write
    grants:
      viewer:
        - read
`;
    const policy = await loadYaml(yaml);
    const doc = policy as any;
    expect(doc.resources.document.permissions).toEqual(["read", "write"]);
    expect(doc.resources.document.roles).toEqual(["viewer"]);
  });

  it("preserves conditions in rules", async () => {
    const yaml = `
version: "1"
actors:
  user:
    attributes: {}
resources:
  document:
    attributes: {}
    roles:
      - viewer
    permissions:
      - read
    grants:
      viewer:
        - read
    rules:
      - effect: forbid
        permissions:
          - read
        when:
          $resource.status:
            in:
              - active
              - pending
`;
    const policy = await loadYaml(yaml);
    const doc = policy as any;
    expect(doc.resources.document.rules[0].when["$resource.status"].in).toEqual(["active", "pending"]);
  });

  it("preserves conditions with boolean eq in rules", async () => {
    const yaml = `
version: "1"
actors:
  user:
    attributes: {}
resources:
  document:
    attributes: {}
    roles:
      - viewer
    permissions:
      - read
    grants:
      viewer:
        - read
    rules:
      - effect: forbid
        permissions:
          - read
        when:
          $resource.active:
            eq: true
`;
    const policy = await loadYaml(yaml);
    const doc = policy as any;
    expect(doc.resources.document.rules[0].when["$resource.active"].eq).toBe(true);
  });

  it("converts flat attribute strings to canonical form", async () => {
    const yaml = `
version: "1"
actors:
  user:
    attributes:
      name: string
      age: number
      active: boolean
resources:
  document:
    attributes:
      title: string
      count: number
      enabled: boolean
    roles:
      - viewer
    permissions:
      - read
    grants:
      viewer:
        - read
`;
    const policy = await loadYaml(yaml);
    const doc = policy as any;
    expect(doc.actors.user.attributes.name).toEqual({ kind: "primitive", type: "string" });
    expect(doc.actors.user.attributes.age).toEqual({ kind: "primitive", type: "number" });
    expect(doc.actors.user.attributes.active).toEqual({ kind: "primitive", type: "boolean" });
    expect(doc.resources.document.attributes.title).toEqual({ kind: "primitive", type: "string" });
    expect(doc.resources.document.attributes.count).toEqual({ kind: "primitive", type: "number" });
    expect(doc.resources.document.attributes.enabled).toEqual({ kind: "primitive", type: "boolean" });
  });
});