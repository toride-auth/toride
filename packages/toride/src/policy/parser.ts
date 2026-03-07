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
 * Internal helper: validate a raw object against the Valibot schema,
 * then run cross-reference semantic validation.
 */
function parsePolicy(raw: unknown): Policy {
  // Pre-pass: detect old relation syntax before schema validation
  detectOldRelationSyntax(raw);

  // Pass 1: Structural validation via Valibot
  const result = v.safeParse(PolicySchema, raw);
  if (!result.success) {
    const issue = result.issues[0];
    const path = issue?.path
      ?.map((p) => String(p.key))
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
  return parsePolicy(raw);
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
  return parsePolicy(raw);
}
