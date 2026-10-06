import { expect, it } from "vitest";
import { Toride } from "../index.js";
import type { ConstraintAdapter, ConditionExpression, Policy, ResourceBlock } from "../index.js";

type Row = Record<string, unknown>;
type Predicate = (row: Row) => boolean;
const adapter: ConstraintAdapter<Record<string, Predicate>> = {
  translate: leaf => row => {
    const value = row[leaf.field];
    if (leaf.type === "field_exists") return (value !== null && value !== undefined) === leaf.exists;
    if (value === null || value === undefined) return false;
    switch (leaf.type) {
      case "field_eq": return value === leaf.value;
      case "field_neq": return value !== leaf.value;
      case "field_in": return leaf.values.includes(value);
      case "field_nin": return !leaf.values.includes(value);
      case "field_includes": return Array.isArray(value) && value.includes(leaf.value);
      case "field_contains": return typeof value === "string" && value.includes(leaf.value);
      case "field_starts_with": return typeof value === "string" && value.startsWith(leaf.value);
      case "field_ends_with": return typeof value === "string" && value.endsWith(leaf.value);
      default: throw new Error(`Unsupported test operator ${leaf.type}`);
    }
  },
  relation: (field, _type, predicate) => row => {
    const value = row[field];
    if (value === null || value === undefined) return false;
    const rows = Array.isArray(value) ? value : [value];
    return rows.some(child => predicate(child as Row));
  },
  and: predicates => row => predicates.every(predicate => predicate(row)),
  or: predicates => row => predicates.some(predicate => predicate(row)),
  not: predicate => row => !predicate(row),
  always: () => () => true,
  never: () => () => false,
};
const actor = { type: "User", id: "u1", attributes: { enabled: true, value: "needle" } };
const permit = (when: ConditionExpression = {}) => ({ effect: "permit" as const, permissions: ["read"], when });
function policy(block: Partial<ResourceBlock>, project?: Partial<ResourceBlock>): Policy {
  return { version: "1", actors: { User: { attributes: {} } }, resources: { Document: { roles: ["viewer", "blocked"], permissions: ["read"], ...block }, Project: { roles: ["viewer"], permissions: ["read"], ...project } } };
}
async function selected(engine: Toride, rows: (Row & { id: string })[]): Promise<string[]> {
  const result = await engine.buildConstraints(actor, "read", "Document");
  if (!result.ok) return [];
  const predicate = result.constraint ? engine.translateConstraints(result.constraint, adapter) : () => true;
  return rows.filter(predicate).map(row => row.id);
}

it.each([
  { name: "equal permit", rules: [permit({ "$resource.status": "blocked" })], expected: ["blocked"] },
  { name: "unequal permit", rules: [permit({ "$resource.status": { neq: "blocked" } })], expected: ["clear"] },
  { name: "equal forbid", rules: [permit(), { effect: "forbid" as const, permissions: ["read"], when: { "$resource.status": "blocked" } }], expected: ["null", "clear"] },
  { name: "unequal forbid", rules: [permit(), { effect: "forbid" as const, permissions: ["read"], when: { "$resource.status": { neq: "blocked" } } }], expected: ["null", "blocked"] },
])("matches literal null membership for $name", async ({ rules, expected }) => {
  const rows = [{ id: "null", status: null }, { id: "clear", status: "clear" }, { id: "blocked", status: "blocked" }];
  const engine = new Toride({ policy: policy({ rules }) });
  const runtime = [];
  for (const row of rows) if (await engine.can(actor, "read", { type: "Document", id: row.id, attributes: row })) runtime.push(row.id);
  expect(runtime).toEqual(expected);
  expect(await selected(engine, rows)).toEqual(expected);
});

it("keeps false condition rows when a forbid role guard is unavailable", async () => {
  const engine = new Toride({ policy: policy({ derived_roles: [{ role: "blocked", when: { "$actor.missing": true } }], rules: [permit(), { effect: "forbid", roles: ["blocked"], permissions: ["read"], when: { "$resource.blocked": true } }] }) });
  const rows = [{ id: "null", blocked: null }, { id: "clear", blocked: false }, { id: "blocked", blocked: true }];
  expect(await selected(engine, rows)).toEqual(["null", "clear"]);
  expect(await Promise.all(rows.map(row => engine.can(actor, "read", { type: "Document", id: row.id, attributes: row })))).toEqual([true, true, false]);
});

it("separates independent ANY predicates from one related role condition", async () => {
  const rows = [
    { id: "empty", projects: [] },
    { id: "split", projects: [{ id: "a", approved: true, enabled: false }, { id: "b", approved: false, enabled: true }] },
    { id: "both", projects: [{ id: "c", approved: true, enabled: true }] },
  ];
  const independent = new Toride({ policy: policy({ relations: { projects: "Project" }, rules: [permit({ "$resource.projects.approved": true, "$resource.projects.enabled": true })] }) });
  const sameRow = new Toride({ policy: policy({ relations: { projects: "Project" }, grants: { viewer: ["read"] }, derived_roles: [{ role: "viewer", from_role: "viewer", on_relation: "projects" }] }, { derived_roles: [{ role: "viewer", when: { "$resource.approved": true, "$resource.enabled": true } }] }) });
  expect(await selected(independent, rows)).toEqual(["split", "both"]);
  expect(await selected(sameRow, rows)).toEqual(["both"]);
  const refs = rows.map(row => ({ type: "Document", id: row.id, attributes: { projects: row.projects.map(child => ({ type: "Project", id: child.id, attributes: child })) } }));
  expect(await Promise.all(refs.map(ref => independent.can(actor, "read", ref)))).toEqual([false, true, true]);
  expect(await Promise.all(refs.map(ref => sameRow.can(actor, "read", ref)))).toEqual([false, false, true]);
});

it("keeps explicit relation absence when the static comparison operand is unavailable", async () => {
  const engine = new Toride({ policy: policy({ relations: { projects: "Project" }, rules: [permit(), { effect: "forbid", permissions: ["read"], when: { "$resource.projects.tenant": "$env.missing" } }] }) });
  const rows = [{ id: "empty", projects: [] }, { id: "present", projects: [{ id: "p1", tenant: "a" }] }];
  expect(await selected(engine, rows)).toEqual(["empty"]);
  expect(await engine.can(actor, "read", { type: "Document", id: "empty", attributes: { projects: [] } })).toBe(true);
  expect(await engine.can(actor, "read", { type: "Document", id: "present", attributes: { projects: [{ type: "Project", id: "p1", attributes: { tenant: "a" } }] } })).toBe(false);
});

it("rejects traversal on the right-hand resource operand", async () => {
  const engine = new Toride({ policy: policy({ relations: { projects: "Project" }, rules: [permit({ "$actor.value": "$resource.projects.value" })] }) });
  const result = await engine.buildConstraints(actor, "read", "Document");
  if (!result.ok || !result.constraint) throw new Error("expected an explicit unsupported constraint");
  expect(() => engine.translateConstraints(result.constraint!, adapter)).toThrow(/Unsupported constraint/);
});
