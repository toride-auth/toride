#!/usr/bin/env node
// T078: toride validate CLI command
// T090: toride test CLI command with glob pattern support

import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import * as YAML from "yaml";
import * as v from "valibot";
import { PolicySchema } from "./policy/schema.js";
import { validatePolicyResult, validatePolicyStrict } from "./policy/validator.js";
import { ValidationError } from "./types.js";
import type { Policy } from "./types.js";
import { parseInlineTests, parseTestFile } from "./testing/test-parser.js";
import { runTestCases } from "./testing/test-runner.js";
import type { TestResult } from "./testing/test-runner.js";

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

/**
 * T090: Expand a glob-like pattern to matching file paths.
 * Simple recursive readdir with path matching for zero additional dependencies.
 * Supports ** for recursive directory matching and * for filename matching.
 */
function expandGlob(pattern: string): string[] {
  const absPattern = resolve(pattern);

  // If no glob characters, return as-is (single file)
  if (!pattern.includes("*")) {
    return [absPattern];
  }

  // Find the base directory (part before first glob character)
  const parts = absPattern.split("/");
  const baseParts: string[] = [];
  for (const part of parts) {
    if (part.includes("*")) break;
    baseParts.push(part);
  }
  const baseDir = baseParts.join("/") || "/";

  // Convert glob pattern to regex
  const regexStr = absPattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "___GLOBSTAR___")
    .replace(/\*/g, "[^/]*")
    .replace(/___GLOBSTAR___/g, ".*");
  const regex = new RegExp(`^${regexStr}$`);

  // Recursively find matching files
  const results: string[] = [];
  function walkDir(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          walkDir(fullPath);
        } else if (regex.test(fullPath)) {
          results.push(fullPath);
        }
      } catch {
        // Skip inaccessible entries
      }
    }
  }

  walkDir(baseDir);
  return results.sort();
}

/**
 * T090: Run declarative tests from a file.
 * Detects whether file is a policy (with inline tests) or a separate .test.yaml file.
 */
async function runTestFile(filePath: string): Promise<{ results: TestResult[]; file: string }> {
  const absPath = resolve(filePath);
  const content = readFileSync(absPath, "utf-8");

  if (absPath.endsWith(".test.yaml") || absPath.endsWith(".test.yml")) {
    // Separate test file: parse it, load referenced policy
    const testFile = parseTestFile(content);
    const policyPath = resolve(dirname(absPath), testFile.policyPath);
    const policy = loadPolicyFile(policyPath);
    const results = await runTestCases(policy, testFile.tests);
    return { results, file: absPath };
  } else {
    // Policy file with inline tests
    const policy = loadPolicyFile(absPath);
    const { tests } = parseInlineTests(policy);
    if (tests.length === 0) {
      return { results: [], file: absPath };
    }
    const results = await runTestCases(policy, tests);
    return { results, file: absPath };
  }
}

/** Main CLI entry point. */
export async function main(args: string[] = process.argv.slice(2)): Promise<number> {
  const command = args[0];

  if (command !== "validate" && command !== "test") {
    console.error(`Usage: toride <validate|test> [options] <file(s)>`);
    return 1;
  }

  if (command === "test") {
    return handleTestCommand(args.slice(1));
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

/**
 * T090: Handle 'toride test' command with glob pattern support.
 */
async function handleTestCommand(args: string[]): Promise<number> {
  const fileArgs = args.filter((a) => !a.startsWith("-"));

  if (fileArgs.length === 0) {
    console.error("Error: No test file(s) specified");
    console.error("Usage: toride test <file-or-glob> [...]");
    return 1;
  }

  // Expand all file arguments (may contain glob patterns)
  const allFiles: string[] = [];
  for (const arg of fileArgs) {
    const expanded = expandGlob(arg);
    if (expanded.length === 0) {
      console.error(`Warning: No files matched pattern "${arg}"`);
    }
    allFiles.push(...expanded);
  }

  if (allFiles.length === 0) {
    console.error("Error: No test files found");
    return 1;
  }

  let totalPassed = 0;
  let totalFailed = 0;

  for (const file of allFiles) {
    try {
      const { results } = await runTestFile(file);
      for (const result of results) {
        if (result.passed) {
          console.log(`  \u2713 ${result.name}`);
          totalPassed++;
        } else {
          console.log(`  \u2717 ${result.name}`);
          console.log(`    Expected: ${result.expected}`);
          console.log(`    Got: ${result.actual}`);
          totalFailed++;
        }
      }
    } catch (err) {
      console.error(`Error processing ${file}: ${err instanceof Error ? err.message : String(err)}`);
      totalFailed++;
    }
  }

  console.log("");
  if (totalFailed === 0) {
    console.log(`${totalPassed} tests passed`);
    return 0;
  } else {
    console.log(`${totalPassed} passed, ${totalFailed} failed`);
    return 1;
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
