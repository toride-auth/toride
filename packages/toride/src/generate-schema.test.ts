import { describe, it, expect } from "vitest";
import { convertSchema, generatePolicySchema } from "../scripts/generate-schema.mjs";

describe("generate-schema", () => {
  describe("valibot type mappings", () => {
    it("converts string type", () => {
      const result = convertSchema({ type: "string" });
      expect(result).toEqual({ type: "string" });
    });

    it("converts number type", () => {
      const result = convertSchema({ type: "number" });
      expect(result).toEqual({ type: "number" });
    });

    it("converts boolean type", () => {
      const result = convertSchema({ type: "boolean" });
      expect(result).toEqual({ type: "boolean" });
    });

    it("converts literal type", () => {
      const result = convertSchema({ type: "literal", literal: "1" });
      expect(result).toEqual({ const: "1" });
    });

    it("converts picklist type to enum", () => {
      const result = convertSchema({ type: "picklist", options: ["read", "write", "delete"] });
      expect(result).toEqual({ enum: ["read", "write", "delete"] });
    });

    it("converts array type", () => {
      const result = convertSchema({ type: "array", item: { type: "string" } });
      expect(result).toEqual({ type: "array", items: { type: "string" } });
    });

    it("converts array type without item", () => {
      const result = convertSchema({ type: "array" });
      expect(result).toEqual({ type: "array" });
    });

    it("converts record type with additionalProperties", () => {
      const result = convertSchema({ type: "record", value: { type: "string" } });
      expect(result).toEqual({ type: "object", additionalProperties: { type: "string" } });
    });

    it("converts record type with literal key to properties", () => {
      const result = convertSchema({
        type: "record",
        key: { type: "literal", literal: "admin" },
        value: { type: "string" }
      });
      expect(result).toEqual({
        type: "object",
        properties: { admin: { type: "string" } },
        additionalProperties: false,
      });
    });

    it("converts optional type", () => {
      const result = convertSchema({ type: "optional", wrapped: { type: "string" } });
      expect(result).toEqual({ type: "string" });
    });

    it("converts optional type without wrapped", () => {
      const result = convertSchema({ type: "optional" });
      expect(result).toEqual({});
    });

    it("converts union type to anyOf", () => {
      const result = convertSchema({
        type: "union",
        options: [{ type: "string" }, { type: "number" }]
      });
      expect(result).toEqual({ anyOf: [{ type: "string" }, { type: "number" }] });
    });

    it("converts unknown type to empty object", () => {
      const result = convertSchema({ type: "unknown" });
      expect(result).toEqual({});
    });

    it("handles unknown schema type gracefully", () => {
      const result = convertSchema({ type: "unknown_type" });
      expect(result).toEqual({});
    });

    it("handles non-object schema gracefully", () => {
      expect(convertSchema(null)).toEqual({});
      expect(convertSchema(undefined)).toEqual({});
      expect(convertSchema("string")).toEqual({});
    });
  });

  describe("object type with required/optional", () => {
    it("includes required keys in required array", () => {
      const result = convertSchema({
        type: "object",
        entries: {
          name: { type: "string" },
          age: { type: "number" },
        },
      });
      expect(result.required).toContain("name");
      expect(result.required).toContain("age");
    });

    it("excludes optional keys from required array", () => {
      const result = convertSchema({
        type: "object",
        entries: {
          requiredField: { type: "string" },
          optionalField: { type: "optional", wrapped: { type: "string" } },
        },
      });
      expect(result.required).toContain("requiredField");
      expect(result.required).not.toContain("optionalField");
    });
  });

  describe("lazy type and $defs", () => {
    it("creates $defs entry for lazy type", () => {
      const defs = {};
      const result = convertSchema(
        {
          type: "lazy",
          getter: () => ({ type: "string" }),
        },
        "ConditionExpression",
        defs
      );

      expect(result).toEqual({ $ref: "#/$defs/ConditionExpression" });
      expect(defs.ConditionExpression).toBeDefined();
      expect(defs.ConditionExpression.anyOf).toBeDefined();
    });

    it("reuses existing $defs entry", () => {
      const defs = { ConditionExpression: { anyOf: [] } };
      convertSchema({ type: "lazy", getter: () => ({ type: "string" }) }, "ConditionExpression", defs);
      
      const defsCount = Object.keys(defs).length;
      expect(defsCount).toBe(1);
    });
  });

  describe("full PolicySchema snapshot", () => {
    it("produces valid JSON Schema output for PolicySchema", async () => {
      const defs = {};
      const { PolicySchema } = await import("../dist/index.js");
      const result = convertSchema(PolicySchema, "Policy", defs);

      expect(result).toBeDefined();
      expect(result.type).toBe("object");
      expect(result.properties).toBeDefined();
      expect(defs.ConditionExpression).toBeDefined();
    });

    it("has correct required top-level fields", async () => {
      const defs = {};
      const { PolicySchema } = await import("../dist/index.js");
      const result = convertSchema(PolicySchema, "Policy", defs);

      expect(result.required).toContain("version");
      expect(result.required).toContain("actors");
      expect(result.required).toContain("resources");
    });

    it("includes ConditionExpression in $defs", async () => {
      const defs = {};
      const { PolicySchema } = await import("../dist/index.js");
      convertSchema(PolicySchema, "Policy", defs);

      expect(defs.ConditionExpression).toBeDefined();
      expect(defs.ConditionExpression.anyOf).toBeDefined();
    });

    it("generates full policy schema with all expected top-level properties", async () => {
      const fullSchema = await generatePolicySchema();

      expect(fullSchema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
      expect(fullSchema.$id).toBe("https://toride-auth.github.io/toride/schema/policy.schema.json");
      expect(fullSchema.title).toBe("Toride Policy");
      expect(fullSchema.description).toBeDefined();
      expect(fullSchema.type).toBe("object");
      expect(fullSchema.required).toEqual(["version", "actors", "resources"]);
      expect(fullSchema.properties.version).toEqual({ const: "1", title: "Policy Version", description: "The version of the policy format (must be '1')" });
      expect(fullSchema.properties.actors).toBeDefined();
      expect(fullSchema.properties.resources).toBeDefined();
      expect(fullSchema.properties.global_roles).toBeDefined();
      expect(fullSchema.properties.tests).toBeDefined();
      expect(fullSchema.$defs).toBeDefined();
      expect(fullSchema.$defs.ConditionExpression).toBeDefined();
    });

    it("matches generated schema snapshot", async () => {
      const fullSchema = await generatePolicySchema();
      const jsonOutput = JSON.stringify(fullSchema, null, 2);

      expect(jsonOutput).toMatchSnapshot();
    });
  });
});
