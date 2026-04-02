import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const isMain = fileURLToPath(import.meta.url) === resolve(process.argv[1]);

const METADATA = {
  version: { title: "Policy Version", description: "The version of the policy format (must be '1')" },
  actors: { title: "Actors", description: "Define actor types and their attributes that can perform actions" },
  resources: { title: "Resources", description: "Define resource types, roles, permissions, and access rules" },
  global_roles: { title: "Global Roles", description: "Define roles that apply based on actor attributes without requiring resource context" },
  tests: { title: "Tests", description: "Inline test cases to verify policy behavior" },
  roles: { title: "Roles", description: "List of roles defined for this resource" },
  permissions: { title: "Permissions", description: "List of permissions available for this resource" },
  attributes: { title: "Attributes", description: "Attribute definitions for this actor or resource type" },
  relations: { title: "Relations", description: "Define relations to other resource types for role derivation" },
  grants: { title: "Grants", description: "Map roles to permissions (or 'all' for all permissions)" },
  derived_roles: { title: "Derived Roles", description: "Define roles derived from global roles, other roles, or relations" },
  rules: { title: "Rules", description: "Access rules that can override grants with conditions" },
  field_access: { title: "Field Access", description: "Define field-level access controls" },
  role: { title: "Role", description: "The role name" },
  effect: { title: "Effect", description: "The effect of the rule (allow or forbid)" },
  when: { title: "Condition", description: "Condition expression that must evaluate to true for the rule to apply" },
  name: { title: "Name", description: "Name identifier" },
  actor: { title: "Actor", description: "The actor performing the action" },
  action: { title: "Action", description: "The action being performed" },
  resource: { title: "Resource", description: "The resource being accessed" },
  expected: { title: "Expected", description: "Expected result (allow or deny)" },
};

const CONDITION_EXPRESSION_SCHEMA = {
  anyOf: [
    {
      type: "object",
      properties: {
        any: {
          type: "array",
          items: { $ref: "#/$defs/ConditionExpression" },
        },
      },
      required: ["any"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        all: {
          type: "array",
          items: { $ref: "#/$defs/ConditionExpression" },
        },
      },
      required: ["all"],
      additionalProperties: false,
    },
    {
      type: "object",
      additionalProperties: {
        anyOf: [
          { type: "string" },
          { type: "number" },
          { type: "boolean" },
          {
            anyOf: [
              { type: "object", properties: { eq: {} }, required: ["eq"], additionalProperties: false },
              { type: "object", properties: { neq: {} }, required: ["neq"], additionalProperties: false },
              { type: "object", properties: { gt: {} }, required: ["gt"], additionalProperties: false },
              { type: "object", properties: { gte: {} }, required: ["gte"], additionalProperties: false },
              { type: "object", properties: { lt: {} }, required: ["lt"], additionalProperties: false },
              { type: "object", properties: { lte: {} }, required: ["lte"], additionalProperties: false },
              { type: "object", properties: { in: { anyOf: [{ type: "array", items: {} }, { type: "string" }] } }, required: ["in"], additionalProperties: false },
              { type: "object", properties: { includes: {} }, required: ["includes"], additionalProperties: false },
              { type: "object", properties: { exists: { type: "boolean" } }, required: ["exists"], additionalProperties: false },
              { type: "object", properties: { startsWith: { type: "string" } }, required: ["startsWith"], additionalProperties: false },
              { type: "object", properties: { endsWith: { type: "string" } }, required: ["endsWith"], additionalProperties: false },
              { type: "object", properties: { contains: { type: "string" } }, required: ["contains"], additionalProperties: false },
              { type: "object", properties: { custom: { type: "string" } }, required: ["custom"], additionalProperties: false },
            ],
          },
        ],
      },
    },
  ],
};

const ATTRIBUTE_SCHEMA_SCHEMA = {
  anyOf: [
    { type: "object", properties: { kind: { const: "primitive" }, type: { enum: ["string", "number", "boolean"] } }, required: ["kind", "type"], additionalProperties: false },
    { type: "object", properties: { kind: { const: "object" }, fields: { type: "object", additionalProperties: { $ref: "#/$defs/AttributeSchema" } } }, required: ["kind", "fields"], additionalProperties: false },
    { type: "object", properties: { kind: { const: "array" }, items: { $ref: "#/$defs/AttributeSchema" } }, required: ["kind", "items"], additionalProperties: false },
  ],
};

function detectLazyType(lazySchema) {
  try {
    if (typeof lazySchema.getter !== "function") {
      return "ConditionExpression";
    }
    const schema = lazySchema.getter();
    if (schema && schema.type === "union" && schema.options && schema.options.length > 0) {
      const firstOption = schema.options[0];
      if (firstOption && firstOption.type === "object" && firstOption.entries) {
        const kindEntry = firstOption.entries.kind;
        if (kindEntry && kindEntry.type === "literal" && kindEntry.literal === "primitive") {
          return "AttributeSchema";
        }
      }
    }
  } catch (e) {
  }
  return "ConditionExpression";
}

export function convertSchema(schema, name = "", defs = {}, processed = new Set()) {
  if (!schema || typeof schema !== "object") {
    return {};
  }

  const type = schema.type;

  switch (type) {
    case "string":
      return { type: "string" };

    case "number":
      return { type: "number" };

    case "boolean":
      return { type: "boolean" };

    case "literal":
      return { const: schema.literal };

    case "picklist":
      return { enum: schema.options };

    case "array": {
      const item = schema.item;
      if (!item) {
        return { type: "array" };
      }
      return {
        type: "array",
        items: convertSchema(item, "", defs, processed),
      };
    }

    case "record": {
      const key = schema.key;
      const value = schema.value;

      if (!value) {
        return { type: "object" };
      }

      if (key && key.type === "literal") {
        return {
          type: "object",
          properties: {
            [key.literal]: convertSchema(value, "", defs, processed),
          },
          additionalProperties: false,
        };
      }

      return {
        type: "object",
        additionalProperties: convertSchema(value, "", defs, processed),
      };
    }

    case "object": {
      const entries = schema.entries || {};
      const properties = {};
      const required = [];

      for (const [keyName, valueSchema] of Object.entries(entries)) {
        if (!valueSchema || typeof valueSchema !== "object") {
          properties[keyName] = {};
          continue;
        }

        const isOptional = valueSchema.type === "optional";
        const actualSchema = isOptional ? valueSchema.wrapped : valueSchema;

        if (!isOptional) {
          required.push(keyName);
        }

        if (actualSchema && actualSchema.type === "lazy") {
          const lazyDefName = detectLazyType(actualSchema);
          if (!defs[lazyDefName]) {
            if (lazyDefName === "AttributeSchema") {
              defs[lazyDefName] = ATTRIBUTE_SCHEMA_SCHEMA;
            } else {
              defs[lazyDefName] = CONDITION_EXPRESSION_SCHEMA;
            }
          }
          properties[keyName] = { $ref: `#/$defs/${lazyDefName}` };
        } else {
          const converted = convertSchema(actualSchema, keyName, defs, processed);
          if (METADATA[keyName]) {
            properties[keyName] = { ...converted, ...METADATA[keyName] };
          } else {
            properties[keyName] = converted;
          }
        }
      }

      return {
        type: "object",
        properties,
        required: required.length > 0 ? required : undefined,
        additionalProperties: false,
      };
    }

    case "union": {
      const options = schema.options || [];
      const anyOf = options
        .filter(opt => opt && typeof opt === "object")
        .map(opt => convertSchema(opt, name, defs, processed));

      return { anyOf: anyOf.length > 0 ? anyOf : undefined };
    }

    case "optional": {
      const wrapped = schema.wrapped;
      if (!wrapped) return {};
      return convertSchema(wrapped, name, defs, processed);
    }

    case "lazy": {
      const lazyDefName = detectLazyType(schema);
      if (!defs[lazyDefName]) {
        if (lazyDefName === "AttributeSchema") {
          defs[lazyDefName] = ATTRIBUTE_SCHEMA_SCHEMA;
        } else {
          defs[lazyDefName] = CONDITION_EXPRESSION_SCHEMA;
        }
      }
      return { $ref: `#/$defs/${lazyDefName}` };
    }

    case "unknown":
      return {};

    default:
      return {};
  }
}

export async function generatePolicySchema() {
  const { PolicySchema } = await import("../dist/index.js");

  const defs = {};

  const jsonSchema = convertSchema(PolicySchema, "Policy", defs);

  const fullSchema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://toride-auth.github.io/toride/schema/policy.schema.json",
    title: "Toride Policy",
    description: "Schema for toride authorization policy files (YAML or JSON)",
    ...jsonSchema,
    $defs: defs,
  };

  return fullSchema;
}

async function main() {
  try {
    const jsonSchema = await generatePolicySchema();

    const outputPath = resolve(__dirname, "../schema/policy.schema.json");
    writeFileSync(outputPath, JSON.stringify(jsonSchema, null, 2));

    console.log(`Generated JSON Schema at ${outputPath}`);
  } catch (error) {
    console.error("Failed to generate schema:", error);
    process.exit(1);
  }
}

if (isMain) {
  main();
}