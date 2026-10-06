import { expect, it } from "vitest";
import { Toride } from "../index.js";
import type { ConditionExpression, Policy, ResourceBlock } from "../types.js";

const actor = { type: "User", id: "u1", attributes: { enabled: true } };
function engine(block: Partial<ResourceBlock>) {
  const policy: Policy = { version: "1", actors: { User: { attributes: {} } }, resources: {
    Document: { roles: ["viewer", "blocked"], permissions: ["read"], ...block },
    Project: { roles: ["reader"], permissions: ["read"], derived_roles: [{ role: "reader", when: {} }] },
  } };
  return new Toride({ policy });
}
const permit = (when: ConditionExpression = {}) => ({ effect: "permit" as const, permissions: ["read"], when });

it("compiles an unscoped permit without a static grant", async () => {
  expect(await engine({ rules: [permit()] }).buildConstraints(actor, "read", "Document")).toEqual({ ok: true, constraint: null });
});

it.each(["$actor.missing", "$env.missing"])("keeps missing %s in static conjunctions", async (path) => {
  expect(await engine({ rules: [permit({ all: [{ [path]: true }, {}] })] }).buildConstraints(actor, "read", "Document")).toEqual({ ok: false });
});

it("does not allow a missing static forbid operand", async () => {
  expect(await engine({ rules: [permit(), { effect: "forbid", permissions: ["read"], when: { "$resource.tenant": "$env.tenant" } }] }).buildConstraints(actor, "read", "Document")).toEqual({ ok: false });
});

it("retains a forbid role guard", async () => {
  expect(await engine({ rules: [permit(), { effect: "forbid", roles: ["blocked"], permissions: ["read"], when: {} }] }).buildConstraints(actor, "read", "Document")).toEqual({ ok: true, constraint: null });
});

it("compiles public related roles as related policy existence", async () => {
  const result = await engine({ relations: { project: "Project" }, grants: { viewer: ["read"] }, derived_roles: [{ role: "viewer", from_role: "reader", on_relation: "project" }] }).buildConstraints(actor, "read", "Document");
  expect(result).toEqual({ ok: true, constraint: { type: "relation", field: "project", resourceType: "Project", quantifier: "any", constraint: { type: "always" }, rootResourceType: "Document" } });
});

it.each([["startsWith", "field_starts_with"], ["endsWith", "field_ends_with"], ["contains", "field_contains"]])("preserves %s", async (operator, type) => {
  const result = await engine({ rules: [permit({ "$resource.title": { [operator]: "x" } } as ConditionExpression)] }).buildConstraints(actor, "read", "Document");
  expect(result).toEqual({ ok: true, constraint: { type, field: "title", value: "x", rootResourceType: "Document" } });
});

it("isolates batch refs even when the resolver depends on inline data", async () => {
  const base = engine({ rules: [permit({ "$resource.result": true })] });
  const policy = (base as unknown as { policy: Policy }).policy;
  const toride = new Toride({ policy, resolvers: { Document: async ref => ({ result: ref.attributes?.input }) } });
  const checks = [true, false].map(input => ({ action: "read", resource: { type: "Document", id: "same", attributes: { input } } }));
  expect(await toride.canBatch(actor, checks)).toEqual([true, false]);
  expect(await toride.canBatch(actor, [...checks].reverse())).toEqual([false, true]);
});
