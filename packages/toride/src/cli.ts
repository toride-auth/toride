#!/usr/bin/env node
// T078: toride validate CLI command

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as YAML from "yaml";
import * as v from "valibot";
import { PolicySchema } from "./policy/schema.js";
import { validatePolicyResult, validatePolicyStrict } from "./policy/validator.js";
import { ValidationError } from "./types.js";
import type { Policy } from "./types.js";

/** Parse a policy file (YAML or JSON) into a raw Policy object. */
function loadPolicyFile(filePath: string): Policy {
  const absPath = resolve(filePath);
  let content: string;
  try {
    content = readFileSync(absPath, "utf-8");
  } catch {
    throw new Error(`Cannot read file: ${absPath}`);
  }

  let raw: unknown;
  if (absPath.endsWith(".json")) {
    try {
      raw = JSON.parse(content);
    } catch (err) {
      throw new ValidationError(
        `JSON parse error: ${err instanceof Error ? err.message : String(err)}`,
        "",
      );
    }
  } else {
    try {
      raw = YAML.parse(content, { prettyErrors: true });
    } catch (err) {
      throw new ValidationError(
        `YAML parse error: ${err instanceof Error ? err.message : String(err)}`,
        "",
      );
    }
  }

  // Structural validation via Valibot
  const result = v.safeParse(PolicySchema, raw);
  if (!result.success) {
    const issue = result.issues[0];
    const path =
      issue?.path?.map((p) => String(p.key)).join(".") ?? "";
    throw new ValidationError(
      `Policy validation failed: ${issue?.message ?? "unknown error"}${path ? ` at ${path}` : ""}`,
      path,
    );
  }

  return result.output as unknown as Policy;
}

/** Main CLI entry point. */
export async function main(args: string[] = process.argv.slice(2)): Promise<number> {
  const command = args[0];

  if (command !== "validate") {
    console.error(`Usage: toride validate [--strict] <policy-file>`);
    return 1;
  }

  const isStrict = args.includes("--strict");
  const fileArg = args.filter((a) => a !== "validate" && a !== "--strict")[0];

  if (!fileArg) {
    console.error("Error: No policy file specified");
    console.error("Usage: toride validate [--strict] <policy-file>");
    return 1;
  }

  let policy: Policy;
  try {
    policy = loadPolicyFile(fileArg);
  } catch (err) {
    if (err instanceof ValidationError) {
      console.error(`Error: ${err.message}`);
    } else if (err instanceof Error) {
      console.error(`Error: ${err.message}`);
    }
    return 1;
  }

  if (isStrict) {
    const result = validatePolicyStrict(policy);

    for (const error of result.errors) {
      console.error(`Error: ${error.message}`);
    }
    for (const warning of result.warnings) {
      console.warn(`Warning: ${warning.message}`);
    }

    if (result.errors.length > 0) {
      return 1;
    }

    if (result.errors.length === 0 && result.warnings.length === 0) {
      console.log("Policy is valid.");
    } else {
      console.log("Policy is valid (with warnings).");
    }
    return 0;
  } else {
    const result = validatePolicyResult(policy);

    for (const error of result.errors) {
      console.error(`Error: ${error.message}`);
    }

    if (result.errors.length > 0) {
      return 1;
    }

    console.log("Policy is valid.");
    return 0;
  }
}

// Run CLI when executed directly
const isDirectExecution =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("/cli.js") || process.argv[1].endsWith("/cli.mjs"));

if (isDirectExecution) {
  main().then((code) => process.exit(code));
}
