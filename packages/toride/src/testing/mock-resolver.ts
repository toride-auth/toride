// T011: Construct a Resolvers map from a TestCase's resolvers field

import type { ResourceRef, Resolvers, TestCase } from "../types.js";

/**
 * Constructs a Resolvers map from test case mock data.
 * Uses "Type:id" format as keys in the TestCase.resolvers map.
 * Each entry maps to an attribute object that the mock resolver returns.
 *
 * Example TestCase.resolvers:
 *   { "Document:doc1": { status: "draft", owner_id: "u1" },
 *     "Organization:org1": { plan: "enterprise" } }
 *
 * This produces a Resolvers map where each resource type has a resolver
 * that looks up the attributes by "Type:id" key.
 */
export function createMockResolver(testCase: TestCase): Resolvers {
  const { resolvers: mockData } = testCase;
  if (!mockData) return {};

  // Collect all resource types from the mock data keys
  const typeSet = new Set<string>();
  for (const key of Object.keys(mockData)) {
    const colonIndex = key.indexOf(":");
    if (colonIndex > 0) {
      typeSet.add(key.substring(0, colonIndex));
    }
  }

  // Build a per-type resolver that looks up by "Type:id"
  const resolvers: Resolvers = {};
  for (const type of typeSet) {
    resolvers[type] = async (ref: ResourceRef): Promise<Record<string, unknown>> => {
      const key = `${ref.type}:${ref.id}`;
      return mockData[key] ?? {};
    };
  }

  return resolvers;
}
