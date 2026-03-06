// T087: Parse both inline tests: from a Policy object and separate .test.yaml files

import * as YAML from "yaml";
import * as v from "valibot";
import { TestFileSchema } from "../policy/schema.js";
import type { Policy, TestCase } from "../types.js";

/** Result of parsing a separate .test.yaml file. */
export interface TestFileResult {
  policyPath: string;
  tests: TestCase[];
}

/**
 * Extract inline tests from a loaded Policy object.
 * Returns the policy (unchanged) and the test cases (or empty array if none).
 */
export function parseInlineTests(policy: Policy): { policy: Policy; tests: TestCase[] } {
  return {
    policy,
    tests: (policy.tests ?? []) as TestCase[],
  };
}

/**
 * Parse a separate .test.yaml file content string.
 * Returns the path to the policy file and the test cases.
 */
export function parseTestFile(yamlContent: string): TestFileResult {
  let raw: unknown;
  try {
    raw = YAML.parse(yamlContent, { prettyErrors: true });
  } catch (err) {
    throw new Error(
      `YAML parse error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const result = v.safeParse(TestFileSchema, raw);
  if (!result.success) {
    const issue = result.issues[0];
    const path = issue?.path?.map((p) => String(p.key)).join(".") ?? "";
    throw new Error(
      `Test file validation failed: ${issue?.message ?? "unknown error"}${path ? ` at ${path}` : ""}`,
    );
  }

  return {
    policyPath: result.output.policy,
    tests: result.output.tests as unknown as TestCase[],
  };
}
