// T055: Unit tests for constraint translation and simplification

import { describe, it, expect } from "vitest";
import type { Constraint } from "./constraint-types.js";
import { translateConstraints } from "./translator.js";
import { simplify } from "./constraint-builder.js";
import { makeStringAdapter } from "../testing/test-adapter.js";

// ---- translateConstraints Tests ----

describe("translateConstraints", () => {
  const adapter = makeStringAdapter();

  it("translates field_eq leaf", () => {
    const c: Constraint = { type: "field_eq", field: "status", value: "active" };
    expect(translateConstraints({ ...c, rootResourceType: "Task" }, adapter)).toBe('status = "active"');
  });

  it("translates field_neq leaf", () => {
    const c: Constraint = { type: "field_neq", field: "status", value: "deleted" };
    expect(translateConstraints({ ...c, rootResourceType: "Task" }, adapter)).toBe('status != "deleted"');
  });

  it("translates field_gt leaf", () => {
    const c: Constraint = { type: "field_gt", field: "priority", value: 5 };
    expect(translateConstraints({ ...c, rootResourceType: "Task" }, adapter)).toBe("priority > 5");
  });

  it("translates field_in leaf", () => {
    const c: Constraint = { type: "field_in", field: "status", values: ["a", "b"] };
    expect(translateConstraints({ ...c, rootResourceType: "Task" }, adapter)).toBe('status IN ["a","b"]');
  });

  it("translates field_exists leaf", () => {
    const c: Constraint = { type: "field_exists", field: "deletedAt", exists: false };
    expect(translateConstraints({ ...c, rootResourceType: "Task" }, adapter)).toBe("deletedAt IS NULL");
  });

  it("translates and combinator", () => {
    const c: Constraint = {
      type: "and",
      children: [
        { type: "field_eq", field: "a", value: 1 },
        { type: "field_eq", field: "b", value: 2 },
      ],
    };
    expect(translateConstraints({ ...c, rootResourceType: "Task" }, adapter)).toBe("(a = 1 AND b = 2)");
  });

  it("translates or combinator", () => {
    const c: Constraint = {
      type: "or",
      children: [
        { type: "field_eq", field: "a", value: 1 },
        { type: "field_eq", field: "b", value: 2 },
      ],
    };
    expect(translateConstraints({ ...c, rootResourceType: "Task" }, adapter)).toBe("(a = 1 OR b = 2)");
  });

  it("translates not combinator", () => {
    const c: Constraint = {
      type: "not",
      child: { type: "field_eq", field: "archived", value: true },
    };
    expect(translateConstraints({ ...c, rootResourceType: "Task" }, adapter)).toBe("NOT(archived = true)");
  });

  it("translates relation constraint", () => {
    const c: Constraint = {
      type: "relation",
      quantifier: "any",
      field: "projectId",
      resourceType: "Project",
      constraint: { type: "field_eq", field: "active", value: true },
    };
    expect(translateConstraints({ ...c, rootResourceType: "Task" }, adapter)).toBe("projectId -> Project(active = true)");
  });

  it("rejects legacy role-assignment constraints", () => {
    const c: Constraint = {
      type: "has_role",
      actorId: "u1",
      actorType: "User",
      role: "admin",
    };
    expect(() => translateConstraints({ ...c, rootResourceType: "Task" }, adapter)).toThrow(/legacy has_role/);
  });

  it("rejects unknown custom constraints", () => {
    const c: Constraint = { type: "unknown", name: "businessHours" };
    expect(() => translateConstraints({ ...c, rootResourceType: "Task" }, adapter)).toThrow(/businessHours/);
  });

  it("translates nested structure", () => {
    const c: Constraint = {
      type: "and",
      children: [
        {
          type: "or",
          children: [
            { type: "field_eq", field: "public", value: true },
            { type: "field_eq", field: "viewer", value: true },
          ],
        },
        {
          type: "not",
          child: { type: "field_eq", field: "deleted", value: true },
        },
      ],
    };
    expect(translateConstraints({ ...c, rootResourceType: "Task" }, adapter)).toBe(
      '((public = true OR viewer = true) AND NOT(deleted = true))',
    );
  });

  it("translates constant nodes", () => {
    const always: Constraint = { type: "always" };
    const never: Constraint = { type: "never" };
    expect(translateConstraints({ ...always, rootResourceType: "Task" }, adapter)).toBe("TRUE");
    expect(translateConstraints({ ...never, rootResourceType: "Task" }, adapter)).toBe("FALSE");
  });

  it("throws on excessively deep constraint ASTs (Finding 10)", () => {
    // Build a deeply nested NOT chain beyond the depth limit
    let c: Constraint = { type: "field_eq", field: "a", value: 1 };
    for (let i = 0; i < 150; i++) {
      c = { type: "not", child: c };
    }
    expect(() => translateConstraints({ ...c, rootResourceType: "Task" }, adapter)).toThrow(/maximum constraint depth/);
  });
});

// ---- Simplification Tests ----

describe("simplify", () => {
  it("returns always as-is", () => {
    expect(simplify({ type: "always" })).toEqual({ type: "always" });
  });

  it("returns never as-is", () => {
    expect(simplify({ type: "never" })).toEqual({ type: "never" });
  });

  it("simplifies and([always, X]) to X", () => {
    const result = simplify({
      type: "and",
      children: [
        { type: "always" },
        { type: "field_eq", field: "a", value: 1 },
      ],
    });
    expect(result).toEqual({ type: "field_eq", field: "a", value: 1 });
  });

  it("simplifies and([X, always]) to X", () => {
    const result = simplify({
      type: "and",
      children: [
        { type: "field_eq", field: "a", value: 1 },
        { type: "always" },
      ],
    });
    expect(result).toEqual({ type: "field_eq", field: "a", value: 1 });
  });

  it("simplifies and([never, X]) to never", () => {
    const result = simplify({
      type: "and",
      children: [
        { type: "never" },
        { type: "field_eq", field: "a", value: 1 },
      ],
    });
    expect(result).toEqual({ type: "never" });
  });

  it("simplifies or([never, X]) to X", () => {
    const result = simplify({
      type: "or",
      children: [
        { type: "never" },
        { type: "field_eq", field: "a", value: 1 },
      ],
    });
    expect(result).toEqual({ type: "field_eq", field: "a", value: 1 });
  });

  it("simplifies or([X, never]) to X", () => {
    const result = simplify({
      type: "or",
      children: [
        { type: "field_eq", field: "a", value: 1 },
        { type: "never" },
      ],
    });
    expect(result).toEqual({ type: "field_eq", field: "a", value: 1 });
  });

  it("simplifies or([always, X]) to always", () => {
    const result = simplify({
      type: "or",
      children: [
        { type: "always" },
        { type: "field_eq", field: "a", value: 1 },
      ],
    });
    expect(result).toEqual({ type: "always" });
  });

  it("simplifies not(always) to never", () => {
    expect(simplify({ type: "not", child: { type: "always" } })).toEqual({ type: "never" });
  });

  it("simplifies not(never) to always", () => {
    expect(simplify({ type: "not", child: { type: "never" } })).toEqual({ type: "always" });
  });

  it("simplifies not(not(X)) to X", () => {
    const result = simplify({
      type: "not",
      child: { type: "not", child: { type: "field_eq", field: "a", value: 1 } },
    });
    expect(result).toEqual({ type: "field_eq", field: "a", value: 1 });
  });

  it("simplifies and with single child to child", () => {
    const result = simplify({
      type: "and",
      children: [{ type: "field_eq", field: "a", value: 1 }],
    });
    expect(result).toEqual({ type: "field_eq", field: "a", value: 1 });
  });

  it("simplifies or with single child to child", () => {
    const result = simplify({
      type: "or",
      children: [{ type: "field_eq", field: "a", value: 1 }],
    });
    expect(result).toEqual({ type: "field_eq", field: "a", value: 1 });
  });

  it("simplifies and with empty children to always", () => {
    expect(simplify({ type: "and", children: [] })).toEqual({ type: "always" });
  });

  it("simplifies or with empty children to never", () => {
    expect(simplify({ type: "or", children: [] })).toEqual({ type: "never" });
  });

  it("recursively simplifies nested structures", () => {
    const result = simplify({
      type: "and",
      children: [
        { type: "always" },
        {
          type: "or",
          children: [
            { type: "never" },
            { type: "field_eq", field: "a", value: 1 },
          ],
        },
      ],
    });
    expect(result).toEqual({ type: "field_eq", field: "a", value: 1 });
  });
});
