// T085: Unit tests for mock resolver construction from test case data

import { describe, it, expect } from "vitest";
import { createMockResolver } from "../../../src/testing/mock-resolver.js";
import type { TestCase } from "../../../src/types.js";

describe("createMockResolver", () => {
  const baseTestCase: TestCase = {
    name: "base test",
    actor: { type: "User", id: "u1", attributes: {} },
    action: "read",
    resource: { type: "Task", id: "42" },
    expected: "allow",
  };

  describe("getRoles", () => {
    it("returns mocked roles for a matching Type:id key", async () => {
      const tc: TestCase = {
        ...baseTestCase,
        roles: { "Task:42": ["editor", "viewer"] },
      };
      const resolver = createMockResolver(tc);
      const roles = await resolver.getRoles(
        { type: "User", id: "u1", attributes: {} },
        { type: "Task", id: "42" },
      );
      expect(roles).toEqual(["editor", "viewer"]);
    });

    it("returns empty array for unmocked resources", async () => {
      const tc: TestCase = {
        ...baseTestCase,
        roles: { "Task:42": ["editor"] },
      };
      const resolver = createMockResolver(tc);
      const roles = await resolver.getRoles(
        { type: "User", id: "u1", attributes: {} },
        { type: "Task", id: "99" },
      );
      expect(roles).toEqual([]);
    });

    it("returns empty array when roles map is undefined", async () => {
      const resolver = createMockResolver(baseTestCase);
      const roles = await resolver.getRoles(
        { type: "User", id: "u1", attributes: {} },
        { type: "Task", id: "42" },
      );
      expect(roles).toEqual([]);
    });
  });

  describe("getRelated", () => {
    it("returns mocked single relation for a matching Type:id and relation name", async () => {
      const tc: TestCase = {
        ...baseTestCase,
        relations: {
          "Task:42": {
            project: { type: "Project", id: "p1" },
          },
        },
      };
      const resolver = createMockResolver(tc);
      const related = await resolver.getRelated(
        { type: "Task", id: "42" },
        "project",
      );
      expect(related).toEqual({ type: "Project", id: "p1" });
    });

    it("returns mocked array of relations for cardinality many", async () => {
      const tc: TestCase = {
        ...baseTestCase,
        relations: {
          "Task:42": {
            tags: [
              { type: "Tag", id: "t1" },
              { type: "Tag", id: "t2" },
            ],
          },
        },
      };
      const resolver = createMockResolver(tc);
      const related = await resolver.getRelated(
        { type: "Task", id: "42" },
        "tags",
      );
      expect(related).toEqual([
        { type: "Tag", id: "t1" },
        { type: "Tag", id: "t2" },
      ]);
    });

    it("returns empty array for unmocked resource relation", async () => {
      const tc: TestCase = {
        ...baseTestCase,
        relations: {
          "Task:42": {
            project: { type: "Project", id: "p1" },
          },
        },
      };
      const resolver = createMockResolver(tc);
      const related = await resolver.getRelated(
        { type: "Task", id: "99" },
        "project",
      );
      expect(related).toEqual([]);
    });

    it("returns empty array for unmocked relation name", async () => {
      const tc: TestCase = {
        ...baseTestCase,
        relations: {
          "Task:42": {
            project: { type: "Project", id: "p1" },
          },
        },
      };
      const resolver = createMockResolver(tc);
      const related = await resolver.getRelated(
        { type: "Task", id: "42" },
        "assignee",
      );
      expect(related).toEqual([]);
    });

    it("returns empty array when relations map is undefined", async () => {
      const resolver = createMockResolver(baseTestCase);
      const related = await resolver.getRelated(
        { type: "Task", id: "42" },
        "project",
      );
      expect(related).toEqual([]);
    });
  });

  describe("getAttributes", () => {
    it("returns mocked attributes for a matching Type:id key", async () => {
      const tc: TestCase = {
        ...baseTestCase,
        attributes: {
          "Task:42": { isPublic: true, status: "open" },
        },
      };
      const resolver = createMockResolver(tc);
      const attrs = await resolver.getAttributes({ type: "Task", id: "42" });
      expect(attrs).toEqual({ isPublic: true, status: "open" });
    });

    it("returns empty object for unmocked resources", async () => {
      const tc: TestCase = {
        ...baseTestCase,
        attributes: {
          "Task:42": { isPublic: true },
        },
      };
      const resolver = createMockResolver(tc);
      const attrs = await resolver.getAttributes({ type: "Task", id: "99" });
      expect(attrs).toEqual({});
    });

    it("returns empty object when attributes map is undefined", async () => {
      const resolver = createMockResolver(baseTestCase);
      const attrs = await resolver.getAttributes({ type: "Task", id: "42" });
      expect(attrs).toEqual({});
    });
  });

  describe("combined mocks", () => {
    it("handles a test case with roles, relations, and attributes together", async () => {
      const tc: TestCase = {
        ...baseTestCase,
        roles: { "Task:42": ["editor"] },
        relations: {
          "Task:42": {
            project: { type: "Project", id: "p1" },
          },
        },
        attributes: {
          "Task:42": { status: "open" },
          "Project:p1": { archived: false },
        },
      };
      const resolver = createMockResolver(tc);

      const roles = await resolver.getRoles(
        { type: "User", id: "u1", attributes: {} },
        { type: "Task", id: "42" },
      );
      expect(roles).toEqual(["editor"]);

      const related = await resolver.getRelated(
        { type: "Task", id: "42" },
        "project",
      );
      expect(related).toEqual({ type: "Project", id: "p1" });

      const taskAttrs = await resolver.getAttributes({ type: "Task", id: "42" });
      expect(taskAttrs).toEqual({ status: "open" });

      const projAttrs = await resolver.getAttributes({ type: "Project", id: "p1" });
      expect(projAttrs).toEqual({ archived: false });
    });
  });
});
