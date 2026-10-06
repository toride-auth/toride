import { expect, it } from "vitest";
import { Toride } from "../index.js";
import type { Policy } from "../index.js";

const actor = { type: "User", id: "u1", attributes: { enabled: true } };
const document = { type: "Document", id: "d1" };

it.each([
  { effect: "permit", roles: ["warm", "viewer"] },
  { effect: "permit", roles: ["viewer", "warm"] },
  { effect: "forbid", roles: ["warm", "viewer"] },
  { effect: "forbid", roles: ["viewer", "warm"] },
] as const)("preserves derived-role depth for $effect with role order $roles", async ({ effect, roles }) => {
  const policy: Policy = { version: "1", actors: { User: { attributes: {} } }, resources: {
    Document: {
      roles: [...roles], permissions: ["read"], relations: { fast: "Member", middle: "Bridge" },
      derived_roles: [{ role: "warm", from_role: "member", on_relation: "fast" }, { role: "viewer", from_role: "bridge", on_relation: "middle" }],
      ...(effect === "permit" ? { grants: { viewer: ["read"] } } : { rules: [{ effect: "permit", permissions: ["read"], when: {} }, { effect: "forbid", permissions: ["read"], roles: ["viewer"], when: {} }] }),
    },
    Bridge: { roles: ["bridge"], permissions: ["read"], relations: { member: "Member" }, derived_roles: [{ role: "bridge", from_role: "member", on_relation: "member" }] },
    Member: { roles: ["member"], permissions: ["read"], relations: { tail: "Tail" }, derived_roles: [{ role: "member", from_role: "tail", on_relation: "tail" }] },
    Tail: { roles: ["tail"], permissions: ["read"], derived_roles: [{ role: "tail", when: { "$actor.enabled": effect === "permit" } }] },
  } };
  const resolvers = {
    Document: async () => ({ fast: { type: "Member", id: "m1" }, middle: { type: "Bridge", id: "b1" } }),
    Bridge: async () => ({ member: { type: "Member", id: "m1" } }),
    Member: async () => ({ tail: { type: "Tail", id: "t1" } }),
  };
  const shallow = new Toride({ policy, resolvers, maxDerivedRoleDepth: 2 });
  const explanation = await shallow.explain(actor, "read", document);
  expect(explanation.allowed).toBe(false);
  expect(explanation.diagnostics).toContainEqual({ code: "depth_limit", path: "Tail.tail" });
  expect(await shallow.can(actor, "read", document)).toBe(false);
  const deep = new Toride({ policy, resolvers, maxDerivedRoleDepth: 3 });
  expect(await deep.can(actor, "read", document)).toBe(true);
});

it.each([["warm", "viewer"], ["viewer", "warm"]])("keeps role cycle assumptions within their branch with role order %s, %s", async (first, second) => {
  const policy: Policy = { version: "1", actors: { User: { attributes: {} } }, resources: {
    Document: { roles: [first, second], permissions: ["read"], relations: { a: "A", b: "B" }, derived_roles: [{ role: "warm", from_role: "member", on_relation: "a" }, { role: "viewer", from_role: "member", on_relation: "b" }], grants: { viewer: ["read"] } },
    A: { roles: ["member"], permissions: ["read"], relations: { target: "Target" }, derived_roles: [{ role: "member", from_role: "member", on_relation: "target" }, { role: "member", when: {} }] },
    B: { roles: ["member"], permissions: ["read"], relations: { target: "Target" }, derived_roles: [{ role: "member", from_role: "member", on_relation: "target" }] },
    Target: { roles: ["member"], permissions: ["read"], relations: { a: "A" }, derived_roles: [{ role: "member", from_role: "member", on_relation: "a" }] },
  } };
  const engine = new Toride({ policy, resolvers: {
    Document: async () => ({ a: { type: "A", id: "a1" }, b: { type: "B", id: "b1" } }),
    A: async () => ({ target: { type: "Target", id: "t1" } }),
    B: async () => ({ target: { type: "Target", id: "t1" } }),
    Target: async () => ({ a: { type: "A", id: "a1" } }),
  } });
  expect(await engine.can(actor, "read", document)).toBe(true);
});

it.each([
  { permissions: ["inspect", "read"], absent: true },
  { permissions: ["read", "inspect"], absent: true },
  { permissions: ["inspect", "read"], absent: false },
  { permissions: ["read", "inspect"], absent: false },
])("isolates action observations with permissions $permissions and absent=$absent", async ({ permissions, absent }) => {
  const policy: Policy = { version: "1", actors: { User: { attributes: {} } }, resources: {
    Document: {
      roles: ["viewer"], permissions, relations: { project: "Project" },
      derived_roles: [{ role: "viewer", from_role: "viewer", on_relation: "project" }],
      rules: [
        { effect: "permit", permissions: ["inspect"], when: { "$resource.project.value": { exists: false } } },
        { effect: "permit", permissions: ["read"], when: {} },
        { effect: "forbid", permissions: ["read"], roles: ["viewer"], when: {} },
      ],
    },
    Project: { roles: ["viewer"], permissions: ["read"], derived_roles: [{ role: "viewer", when: {} }] },
  } };
  const engine = new Toride({ policy, resolvers: { Document: async () => ({ project: { type: "Project", id: "p1" } }), Project: async () => absent ? null : { value: null } } });
  expect(await engine.can(actor, "inspect", document)).toBe(true);
  expect(await engine.can(actor, "read", document)).toBe(false);
  expect(await engine.permittedActions(actor, document)).toEqual(["inspect"]);
  expect(await engine.snapshot(actor, [document])).toEqual({ "Document:d1": ["inspect"] });
});
