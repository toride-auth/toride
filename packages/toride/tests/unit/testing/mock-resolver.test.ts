// T085: Unit tests for mock resolver construction from test case data
// Updated for new Resolvers map (Phase 3)

import { describe, it, expect } from "vitest";
import { createMockResolver } from "../../../src/testing/mock-resolver.js";
import type { TestCase, Resolvers } from "../../../src/types.js";

describe("createMockResolver", () => {
  const baseTestCase: TestCase = {
    name: "base test",
    actor: { type: "User", id: "u1", attributes: {} },
    action: "read",
    resource: { type: "Task", id: "42" },
    expected: "allow",
  };

  it("returns empty Resolvers when no resolvers data provided", () => {
    const resolvers = createMockResolver(baseTestCase);
    expect(Object.keys(resolvers)).toHaveLength(0);
  });

  it("creates per-type resolvers from resolvers map", () => {
    const tc: TestCase = {
      ...baseTestCase,
      resolvers: {
        "Task:42": { status: "open", priority: 1 },
        "Project:p1": { archived: false },
      },
    };
    const resolvers = createMockResolver(tc);
    expect(resolvers).toHaveProperty("Task");
    expect(resolvers).toHaveProperty("Project");
  });

  it("resolves attributes for matching Type:id key", async () => {
    const tc: TestCase = {
      ...baseTestCase,
      resolvers: {
        "Task:42": { status: "open", priority: 1 },
      },
    };
    const resolvers = createMockResolver(tc);
    const attrs = await resolvers["Task"]!({ type: "Task", id: "42" });
    expect(attrs).toEqual({ status: "open", priority: 1 });
  });

  it("returns empty object for unmocked resource id", async () => {
    const tc: TestCase = {
      ...baseTestCase,
      resolvers: {
        "Task:42": { status: "open" },
      },
    };
    const resolvers = createMockResolver(tc);
    const attrs = await resolvers["Task"]!({ type: "Task", id: "99" });
    expect(attrs).toEqual({});
  });

  it("handles multiple resource types independently", async () => {
    const tc: TestCase = {
      ...baseTestCase,
      resolvers: {
        "Task:42": { status: "open" },
        "Project:p1": { archived: false },
      },
    };
    const resolvers = createMockResolver(tc);

    const taskAttrs = await resolvers["Task"]!({ type: "Task", id: "42" });
    expect(taskAttrs).toEqual({ status: "open" });

    const projAttrs = await resolvers["Project"]!({ type: "Project", id: "p1" });
    expect(projAttrs).toEqual({ archived: false });
  });

  it("resolves relation targets as ResourceRef values in attributes", async () => {
    const tc: TestCase = {
      ...baseTestCase,
      resolvers: {
        "Task:42": {
          status: "open",
          org: { type: "Organization", id: "org1" },
        },
        "Organization:org1": { plan: "enterprise" },
      },
    };
    const resolvers = createMockResolver(tc);

    const taskAttrs = await resolvers["Task"]!({ type: "Task", id: "42" });
    expect(taskAttrs).toEqual({
      status: "open",
      org: { type: "Organization", id: "org1" },
    });

    const orgAttrs = await resolvers["Organization"]!({ type: "Organization", id: "org1" });
    expect(orgAttrs).toEqual({ plan: "enterprise" });
  });
});
