// T089: Orchestrate running test cases against a policy

import { Toride } from "../engine.js";
import { createMockResolver } from "./mock-resolver.js";
import type { Policy, TestCase } from "../types.js";

/** Result of a single test case execution. */
export interface TestResult {
  name: string;
  passed: boolean;
  expected: "allow" | "deny";
  actual: "allow" | "deny";
}

/**
 * Run a set of test cases against a policy.
 * Creates a fresh engine per test case for isolation.
 * Global roles are derived from actor attributes -- never mocked.
 */
export async function runTestCases(
  policy: Policy,
  tests: TestCase[],
): Promise<TestResult[]> {
  const results: TestResult[] = [];

  for (const tc of tests) {
    const resolver = createMockResolver(tc);
    const engine = new Toride({ policy, resolver });

    const allowed = await engine.can(tc.actor, tc.action, tc.resource);
    const actual: "allow" | "deny" = allowed ? "allow" : "deny";

    results.push({
      name: tc.name,
      passed: actual === tc.expected,
      expected: tc.expected,
      actual,
    });
  }

  return results;
}
