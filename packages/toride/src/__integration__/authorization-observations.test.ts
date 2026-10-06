import { expect, it } from "vitest";
import { Toride } from "../index.js";
import type { ConditionExpression, Policy, ResourceBlock, Resolvers } from "../index.js";
import { makeStringAdapter } from "../testing/test-adapter.js";

const actor = { type: "User", id: "u1", attributes: { enabled: true } };
const document = { type: "Document", id: "d1" };
const permit = (when: ConditionExpression = {}) => ({ effect: "permit" as const, permissions: ["read"], when });
function policy(block: Partial<ResourceBlock>, project?: Partial<ResourceBlock>): Policy {
  return { version: "1", actors: { User: { attributes: {} } }, resources: {
    Document: { roles: ["viewer", "blocked"], permissions: ["read"], ...block },
    Project: { roles: ["viewer"], permissions: ["read"], ...project },
  } };
}

it("keeps a known permit when a separate permit is unavailable", async () => {
  const engine = new Toride({ policy: policy({ rules: [permit(), permit({ "$resource.missing": true })] }) });
  expect(await engine.can(actor, "read", document)).toBe(true);
  expect(await engine.buildConstraints(actor, "read", "Document")).toEqual({ ok: true, constraint: null });
});

it.each([true, false])("evaluates an unavailable forbid guard with condition %s", async condition => {
  const engine = new Toride({ policy: policy({ derived_roles: [{ role: "blocked", when: { "$actor.missing": true } }], rules: [permit(), { effect: "forbid", permissions: ["read"], roles: ["blocked"], when: { "$actor.enabled": condition } }] }) });
  expect(await engine.can(actor, "read", document)).toBe(!condition);
  expect(await engine.buildConstraints(actor, "read", "Document")).toEqual(condition ? { ok: false } : { ok: true, constraint: null });
});

it("reports resolver diagnostics without copying private error payloads", async () => {
  const engine = new Toride({ policy: policy({ rules: [permit(), { effect: "forbid", permissions: ["read"], when: { "$resource.blocked": true } }] }), resolvers: { Document: async () => { throw new Error("private storage credentials"); } } });
  const result = await engine.explain(actor, "read", document);
  expect(result.allowed).toBe(false);
  expect(result.diagnostics).toContainEqual({ code: "resolver_error", path: "Document:d1" });
  expect(result.matchedRules[1].outcome).toBe("indeterminate");
  expect(JSON.stringify(result)).not.toContain("private storage credentials");
});

it("uses custom evaluators and env through related local roles", async () => {
  const engine = new Toride({ policy: policy({ relations: { project: "Project" }, grants: { viewer: ["read"] }, derived_roles: [{ role: "viewer", from_role: "viewer", on_relation: "project" }] }, { derived_roles: [{ role: "viewer", when: { all: [{ "$env.enabled": true }, { "$resource.value": { custom: "allowed" } }] } }] }), customEvaluators: { allowed: async (_actor, resource, env) => resource.type === "Project" && env.custom === true }, resolvers: { Document: async () => ({ project: { type: "Project", id: "p1" } }) } });
  expect(await engine.can(actor, "read", document, { env: { enabled: true, custom: true } })).toBe(true);
  expect(await engine.can(actor, "read", document, { env: { enabled: true, custom: false } })).toBe(false);
});

it("rejects custom, resource comparisons, and relevant recursive roles in translation", async () => {
  const blocks: Partial<ResourceBlock>[] = [
    { rules: [permit({ "$resource.value": { custom: "allow" } })] },
    { rules: [permit({ "$resource.owner": "$resource.editor" })] },
    { relations: { parent: "Document" }, grants: { viewer: ["read"] }, derived_roles: [{ role: "viewer", from_role: "viewer", on_relation: "parent" }] },
  ];
  for (const block of blocks) {
    const engine = new Toride({ policy: policy(block) });
    const result = await engine.buildConstraints(actor, "read", "Document");
    expect(result.ok).toBe(true);
    if (!result.ok || !result.constraint) throw new Error("expected a relevant unsupported constraint");
    expect(() => engine.translateConstraints(result.constraint!, makeStringAdapter())).toThrow(/Unsupported constraint/);
  }
});

it("rejects conflicting observations within one decision and snapshot", async () => {
  const engine = new Toride({ policy: policy({ relations: { project: "Project", alternate: "Project" }, derived_roles: [{ role: "viewer", from_role: "viewer", on_relation: "project" }, { role: "viewer", from_role: "viewer", on_relation: "alternate" }], grants: { viewer: ["read"] } }, { derived_roles: [{ role: "viewer", when: { "$resource.public": true } }] }) });
  const ref = { ...document, attributes: { project: { type: "Project", id: "p1", attributes: { public: true } }, alternate: { type: "Project", id: "p1", attributes: { public: false } } } };
  const decision = await engine.explain(actor, "read", ref);
  expect(decision.allowed).toBe(false);
  expect(decision.diagnostics).toContainEqual({ code: "conflicting_observation", path: "Project:p1.public" });
  await expect(engine.snapshot(actor, [{ ...document, attributes: { public: true } }, { ...document, attributes: { public: false } }])).rejects.toThrow(/conflicting_observation/);
});

it("uses one resource decision for field guards", async () => {
  let reads = 0;
  const resolvers: Resolvers = { Document: async () => ({ allowed: ++reads === 1 }) };
  const engine = new Toride({ policy: policy({ derived_roles: [{ role: "viewer", when: { "$resource.allowed": true } }], grants: { viewer: ["read"] }, field_access: { secret: { read: ["viewer"] } } }), resolvers });
  expect(await engine.canField(actor, "read", document, "secret")).toBe(true);
  expect(reads).toBe(1);
});

it("never grants an observed absent root or related resource", async () => {
  const absent = new Toride({ policy: policy({ rules: [permit({ "$resource.value": { exists: false } })] }), resolvers: { Document: async () => null } });
  expect(await absent.can(actor, "read", document)).toBe(false);
  const related = new Toride({ policy: policy({ relations: { project: "Project" }, grants: { viewer: ["read"] }, derived_roles: [{ role: "viewer", from_role: "viewer", on_relation: "project" }] }, { derived_roles: [{ role: "viewer", when: { "$resource.value": { exists: false } } }] }), resolvers: { Document: async () => ({ project: { type: "Project", id: "gone" } }), Project: async () => null } });
  expect(await related.can(actor, "read", document)).toBe(false);
});

it.each([
  { projects: [], expected: true },
  { projects: [{ type: "Project", id: "a", attributes: { value: null } }], expected: true },
  { projects: [{ type: "Project", id: "a", attributes: { value: null } }, { type: "Project", id: "b", attributes: { value: "present" } }], expected: false },
  { projects: [{ type: "Project", id: "a", attributes: {} }], expected: false },
])("evaluates traversed absence for $projects", async ({ projects, expected }) => {
  const engine = new Toride({ policy: policy({ relations: { projects: "Project" }, rules: [permit({ "$resource.projects.value": { exists: false } })] }) });
  expect(await engine.can(actor, "read", { ...document, attributes: { projects } })).toBe(expected);
});

it("treats an empty scalar array as present", async () => {
  const engine = new Toride({ policy: policy({ rules: [permit({ "$resource.values": { exists: true } })] }) });
  expect(await engine.can(actor, "read", { ...document, attributes: { values: [] } })).toBe(true);
});

it.each(["permit", "forbid"] as const)("keeps custom condition depth in %s compilation", async effect => {
  const p = policy({ relations: { project: "Project" }, rules: [...(effect === "forbid" ? [permit()] : []), { effect, permissions: ["read"], when: { "$resource.project.parent.value": true } }] }, { relations: { parent: "Project" } });
  const reference = { ...document, attributes: { project: { type: "Project", id: "p1", attributes: { parent: { type: "Project", id: "p2", attributes: { value: true } } } } } };
  const shallow = new Toride({ policy: p, maxConditionDepth: 1 });
  expect(await shallow.can(actor, "read", reference)).toBe(false);
  const result = await shallow.buildConstraints(actor, "read", "Document");
  if (effect === "permit") expect(result).toEqual({ ok: false });
  else {
    expect(result.ok).toBe(true);
    expect(JSON.stringify(result)).not.toContain("field_eq");
  }
  const deep = new Toride({ policy: p, maxConditionDepth: 2 });
  expect(await deep.can(actor, "read", reference)).toBe(effect === "permit");
});

it("invalidates an earlier related role when a later condition observes the target is absent", async () => {
  const engine = new Toride({ policy: policy({ relations: { project: "Project" }, grants: { viewer: ["read"] }, derived_roles: [{ role: "viewer", from_role: "viewer", on_relation: "project" }], rules: [{ effect: "forbid", permissions: ["read"], when: { "$resource.project.blocked": true } }] }, { derived_roles: [{ role: "viewer", when: {} }] }), resolvers: { Document: async () => ({ project: { type: "Project", id: "gone" } }), Project: async () => null } });
  const result = await engine.explain(actor, "read", document);
  expect(result.allowed).toBe(false);
  expect(result.resolvedRoles.derived).toEqual([]);
});

it("evaluates duplicate snapshot refs once before recording their permissions", async () => {
  let reads = 0;
  const engine = new Toride({ policy: policy({ rules: [permit({ "$resource.allowed": true })] }), resolvers: { Document: async () => ({ allowed: ++reads === 1 }) } });
  expect(await engine.snapshot(actor, [document, document])).toEqual({ "Document:d1": ["read"] });
  expect(reads).toBe(1);
});
