// T020: YAML/JSON parser with two-pass validation

import * as YAML from "yaml";
import * as v from "valibot";
import { PolicySchema } from "./schema.js";
import { validatePolicy } from "./validator.js";
import { ValidationError } from "../types.js";
import type { Policy } from "../types.js";

/**
 * Internal helper: validate a raw object against the Valibot schema,
 * then run cross-reference semantic validation.
 */
function parsePolicy(raw: unknown): Policy {
  // Pass 1: Structural validation via Valibot
  const result = v.safeParse(PolicySchema, raw);
  if (!result.success) {
    const issue = result.issues[0];
    const path = issue?.path
      ?.map((p) => {
        if (typeof p.key === "string" || typeof p.key === "number") {
          return String(p.key);
        }
        return String(p.key);
      })
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
