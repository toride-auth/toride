// T020: YAML/JSON parser with two-pass validation

import * as YAML from "yaml";
import * as v from "valibot";
import { PolicySchema } from "./schema.js";
import { validatePolicy } from "./validator.js";
import { ValidationError } from "../types.js";
import type { Policy } from "../types.js";

/**
 * Pre-schema check: detect old relation object syntax and throw a
 * migration-specific error before Valibot gives a cryptic type error.
 *
 * Old syntax: `relations: { org: { resource: Organization, cardinality: one } }`
 * New syntax: `relations: { org: Organization }`
 */
function detectOldRelationSyntax(raw: unknown): void {
  if (typeof raw !== "object" || raw === null) return;
  const obj = raw as Record<string, unknown>;
  const resources = obj.resources;
  if (typeof resources !== "object" || resources === null) return;

  for (const [resName, resDef] of Object.entries(
    resources as Record<string, unknown>,
  )) {
    if (typeof resDef !== "object" || resDef === null) continue;
    const relations = (resDef as Record<string, unknown>).relations;
    if (typeof relations !== "object" || relations === null) continue;

    for (const [relName, relDef] of Object.entries(
      relations as Record<string, unknown>,
    )) {
      if (typeof relDef === "object" && relDef !== null) {
        const relObj = relDef as Record<string, unknown>;
        if ("resource" in relObj) {
          const targetType = String(relObj.resource ?? relName);
          throw new ValidationError(
            `Relation "${relName}" on resource "${resName}" uses the old object syntax ` +
              `({ resource: ..., cardinality: ... }). ` +
              `Relations must now be a plain type name. ` +
              `Change to: ${relName}: ${targetType}`,
            `resources.${resName}.relations.${relName}`,
          );
        }
      }
    }
  }
}

/**
 * Normalize a single attribute value to canonical AttributeSchema form.
 * Handles:
 * - Flat strings ("string", "number", "boolean") → { kind: "primitive", type }
 * - Shorthand arrays ("string[]", "number[]", "boolean[]") → { kind: "array", items: { kind: "primitive", type } }
 * - Nested objects (key-value pairs) → { kind: "object", fields: { ... } }
 * - Array declaration (type: array + items) → { kind: "array", items: ... }
 * - Max nesting depth: 3
 *
 * @param format - "yaml" enables string[] shorthand expansion; "json" rejects shorthand
 */
function normalizeAttributeValue(
  raw: unknown,
  depth: number = 0,
  format: "yaml" | "json" = "yaml",
): unknown {
  if (raw === null || raw === undefined) return raw;

  if (typeof raw === "string") {
    if (["string", "number", "boolean"].includes(raw)) {
      return { kind: "primitive" as const, type: raw };
    }

    if (format === "yaml" && raw.endsWith("[]")) {
      const baseType = raw.slice(0, -2);
      if (["string", "number", "boolean"].includes(baseType)) {
        return {
          kind: "array" as const,
          items: { kind: "primitive" as const, type: baseType },
        };
      }
    }
  }

  if (typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;

    const isCanonical =
      (obj.kind === "primitive" && "type" in obj) ||
      (obj.kind === "object" && "fields" in obj) ||
      (obj.kind === "array" && "items" in obj);

    if (isCanonical) {
      if (obj.kind === "object" && typeof obj.fields === "object" && obj.fields !== null) {
        const normalizedFields: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj.fields as Record<string, unknown>)) {
          normalizedFields[key] = normalizeAttributeValue(value, depth, format);
        }
        return { ...obj, fields: normalizedFields };
      }
      if (obj.kind === "array" && "items" in obj) {
        return { ...obj, items: normalizeAttributeValue(obj.items, depth, format) };
      }
      return obj;
    }

    if (obj.type === "array" && "items" in obj) {
      return {
        kind: "array" as const,
        items: normalizeAttributeValue(obj.items, depth, format),
      };
    }

    if (depth > 3) {
      throw new ValidationError(
        "Attribute nesting depth exceeds maximum of 3",
        "attributes",
      );
    }

    const normalized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      normalized[key] = normalizeAttributeValue(value, depth + 1, format);
    }
    return { kind: "object" as const, fields: normalized };
  }

  if (Array.isArray(raw)) {
    return raw.map((item) => normalizeAttributeValue(item, depth, format));
  }

  return raw;
}

/**
 * Normalize an attribute record (Record<string, unknown>) by normalizing each value.
 */
function normalizeAttributeRecord(
  attrs: Record<string, unknown>,
  format: "yaml" | "json",
): Record<string, unknown> {
  const normalizedAttrs: Record<string, unknown> = {};
  for (const [attrKey, attrValue] of Object.entries(attrs)) {
    normalizedAttrs[attrKey] = normalizeAttributeValue(attrValue, 0, format);
  }
  return normalizedAttrs;
}

/**
 * Normalize attribute declarations: convert flat strings to canonical
 * AttributeSchema form for backward compatibility.
 *
 * Only targets actors.<name>.attributes and resources.<name>.attributes subtrees.
 * Leaves all other policy data untouched.
 *
 * @param format - "yaml" enables string[] shorthand expansion; "json" rejects shorthand
 */
function normalizeAttributes(
  raw: unknown,
  format: "yaml" | "json",
): unknown {
  if (raw === null || raw === undefined || typeof raw !== "object" || Array.isArray(raw)) {
    return raw;
  }

  const obj = raw as Record<string, unknown>;
  const normalized: Record<string, unknown> = { ...obj };

  if ("actors" in normalized && typeof normalized.actors === "object" && normalized.actors !== null) {
    const actors = normalized.actors as Record<string, unknown>;
    const normalizedActors: Record<string, unknown> = {};
    for (const [actorName, actorDef] of Object.entries(actors)) {
      if (typeof actorDef === "object" && actorDef !== null) {
        const actor = actorDef as Record<string, unknown>;
        const normalizedActor: Record<string, unknown> = { ...actor };
        if ("attributes" in normalizedActor && typeof normalizedActor.attributes === "object" && normalizedActor.attributes !== null) {
          normalizedActor.attributes = normalizeAttributeRecord(normalizedActor.attributes as Record<string, unknown>, format);
        }
        normalizedActors[actorName] = normalizedActor;
      } else {
        normalizedActors[actorName] = actorDef;
      }
    }
    normalized.actors = normalizedActors;
  }

  if ("resources" in normalized && typeof normalized.resources === "object" && normalized.resources !== null) {
    const resources = normalized.resources as Record<string, unknown>;
    const normalizedResources: Record<string, unknown> = {};
    for (const [resName, resDef] of Object.entries(resources)) {
      if (typeof resDef === "object" && resDef !== null) {
        const resource = resDef as Record<string, unknown>;
        const normalizedResource: Record<string, unknown> = { ...resource };
        if ("attributes" in normalizedResource && typeof normalizedResource.attributes === "object" && normalizedResource.attributes !== null) {
          normalizedResource.attributes = normalizeAttributeRecord(normalizedResource.attributes as Record<string, unknown>, format);
        }
        normalizedResources[resName] = normalizedResource;
      } else {
        normalizedResources[resName] = resDef;
      }
    }
    normalized.resources = normalizedResources;
  }

  return normalized;
}

/**
 * Internal helper: validate a raw object against the Valibot schema,
 * then run cross-reference semantic validation.
 */
function parsePolicy(raw: unknown, format: "yaml" | "json"): Policy {
  // Pre-pass: detect old relation syntax before schema validation
  detectOldRelationSyntax(raw);

  // Pre-pass: normalize attributes to canonical form (backward compat)
  const normalizedRaw = normalizeAttributes(raw, format);

  // Pass 1: Structural validation via Valibot
  const result = v.safeParse(PolicySchema, normalizedRaw);
  if (!result.success) {
    const issue = result.issues[0];
    const path = issue?.path
      ?.map((p: { key: string | number }) => String(p.key))
      .join(".") ?? "";
    throw new ValidationError(
      `Policy validation failed: ${issue?.message ?? "unknown error"}${path ? ` at ${path}` : ""}`,
      path,
    );
  }

  // The Valibot output is structurally valid - cast to our Policy type
  const policy = result.output as unknown as Policy;

  // Pass 2: Cross-reference semantic validation
  validatePolicy(policy);

  return policy;
}

/**
 * Parse and validate a YAML string into a typed Policy object.
 * Uses the `yaml` package with pretty errors.
 */
export async function loadYaml(input: string): Promise<Policy> {
  let raw: unknown;
  try {
    raw = YAML.parse(input, { prettyErrors: true });
  } catch (err) {
    throw new ValidationError(
      `YAML parse error: ${err instanceof Error ? err.message : String(err)}`,
      "",
    );
  }
  return parsePolicy(raw, "yaml");
}

/**
 * Parse and validate a JSON string into a typed Policy object.
 */
export async function loadJson(input: string): Promise<Policy> {
  let raw: unknown;
  try {
    raw = JSON.parse(input);
  } catch (err) {
    throw new ValidationError(
      `JSON parse error: ${err instanceof Error ? err.message : String(err)}`,
      "",
    );
  }
  return parsePolicy(raw, "json");
}
