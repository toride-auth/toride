import { expect, it, vi } from "vitest";
import { Toride } from "../index.js";
import type { Policy } from "../index.js";

const actor = { type: "User", id: "u1", attributes: { enabled: true } };
const document = { type: "Document", id: "d1" };

it("denies access when a resource identity getter fails", async () => {
  const policy: Policy = { version: "1", actors: { User: { attributes: {} } }, resources: {
    Document: { roles: [], permissions: ["read"], rules: [{ effect: "permit", permissions: ["read"], when: {} }] },
  } };
  const engine = new Toride({ policy });
  const inaccessible = { type: "Document", get id(): string { throw new Error("unavailable identity"); } };
  expect(await engine.can(actor, "read", inaccessible)).toBe(false);
  const explanation = await engine.explain(actor, "read", inaccessible);
  expect(explanation.allowed).toBe(false);
  expect(explanation.diagnostics).toContainEqual({ code: "evaluation_error", path: "Document" });
});

it("denies access when a long primitive identity cannot be serialized", async () => {
  const policy: Policy = { version: "1", actors: { User: { attributes: {} } }, resources: {
    Document: { roles: ["unused"], permissions: ["read"], rules: [{ effect: "permit", permissions: ["read"], when: {} }] },
  } };
  const longId = "\0".repeat(2048);
  const stringify = JSON.stringify;
  let injected = 0;
  // Fault injection exercises the native maximum-string-size error path cheaply.
  // The actual native limit is verified separately without allocating it per worker.
  const serializer = vi.spyOn(JSON, "stringify").mockImplementation(value => {
    if (Array.isArray(value) && value.length === 2 && value[0] === "Document" && value[1] === longId) {
      injected++;
      throw new RangeError("Injected identity serializer failure");
    }
    return stringify(value);
  });
  try {
    for (const method of ["can", "explain"] as const) {
      let reads = 0;
      injected = 0;
      const resource = { type: "Document", get id(): string { return ++reads === 2 ? longId : "d1"; } };
      const engine = new Toride({ policy });
      if (method === "can") expect(await engine.can(actor, "read", resource)).toBe(false);
      else {
        const explanation = await engine.explain(actor, "read", resource);
        expect(explanation.allowed).toBe(false);
        expect(explanation.diagnostics).toContainEqual({ code: "evaluation_error", path: "Document" });
      }
      expect(injected).toBe(1);
      expect(reads).toBe(2);
    }
  } finally {
    serializer.mockRestore();
  }
});

function afterMicrotasks(remaining: number, action: () => void): void {
  queueMicrotask(() => remaining === 0 ? action() : afterMicrotasks(remaining - 1, action));
}

it("denies when a later related identity fails after an earlier match", async () => {
  const policy: Policy = { version: "1", actors: { User: { attributes: {} } }, resources: {
    Document: { roles: ["owner"], permissions: ["read"], relations: { owners: "User" },
      derived_roles: [{ role: "owner", from_relation: "owners" }], grants: { owner: ["read"] } },
  } };
  for (const method of ["can", "explain"] as const) {
    let firstReads = 0;
    let laterReads = 0;
    const first = { type: "User", get id(): string { firstReads++; return "u1"; } };
    const later = { type: "User", get id(): string {
      // Three reads validate/build the role; the fourth is its deferred absence read.
      if (++laterReads === 4) throw new Error("later identity unavailable");
      return "u2";
    } };
    const resource = { type: "Document", id: "d1", attributes: { owners: [first, later] } };
    const engine = new Toride({ policy });
    if (method === "can") expect(await engine.can(actor, "read", resource)).toBe(false);
    else {
      const explanation = await engine.explain(actor, "read", resource);
      expect(explanation.allowed).toBe(false);
      expect(explanation.diagnostics).toContainEqual({ code: "evaluation_error", path: "Document" });
    }
    expect(firstReads).toBe(5);
    expect(laterReads).toBe(4);
  }
});

it.each(["rule", "role"] as const)("preserves delayed custom observations before a forbid %s", async scope => {
  const policy: Policy = { version: "1", actors: { User: { attributes: {} } }, resources: {
    Document: scope === "rule" ? {
      roles: [], permissions: ["read"], rules: [
        { effect: "permit", permissions: ["read"], when: { "$resource.value": { custom: "schedule" } } },
        { effect: "forbid", permissions: ["read"], when: { "$env.blocked": true } },
      ],
    } : {
      roles: ["warm", "blocked"], permissions: ["read"],
      derived_roles: [
        { role: "warm", when: { "$resource.value": { custom: "schedule" } } },
        { role: "blocked", when: { "$env.blocked": true } },
      ],
      rules: [{ effect: "permit", permissions: ["read"], when: {} }, { effect: "forbid", permissions: ["read"], roles: ["blocked"], when: {} }],
    },
  } };
  const engine = new Toride({ policy, customEvaluators: { schedule: async (_actor, _resource, env) => { afterMicrotasks(scope === "rule" ? 4 : 5, () => { env.blocked = true; }); return true; } } });
  expect(await engine.can(actor, "read", document, { env: { blocked: false } })).toBe(false);
  const explanation = await engine.explain(actor, "read", document, { env: { blocked: false } });
  expect(explanation.allowed).toBe(false);
  expect(explanation.matchedRules[1].outcome).toBe("true");
});

it("preserves operand observation order beside a custom condition", async () => {
  const policy: Policy = { version: "1", actors: { User: { attributes: {} } }, resources: {
    Document: { roles: [], permissions: ["read"], rules: [{ effect: "permit", permissions: ["read"], when: { all: [
      { "$actor.enabled": "$env.ready" },
      { "$resource.value": { custom: "markReady" } },
    ] } }] },
  } };
  const engine = new Toride({ policy, customEvaluators: { markReady: async (_actor, _resource, env) => { env.ready = true; return true; } } });
  expect(await engine.can(actor, "read", document, { env: { ready: false } })).toBe(true);
});

it("preserves comparison order for mutable operands beside an async custom condition", async () => {
  const policy: Policy = { version: "1", actors: { User: { attributes: {} } }, resources: {
    Document: { roles: [], permissions: ["read"], rules: [{ effect: "permit", permissions: ["read"], when: { all: [
      { "$actor.enabled": { in: "$env.allowed" } },
      { "$resource.value": { custom: "allowLater" } },
    ] } }] },
  } };
  const engine = new Toride({ policy, customEvaluators: { allowLater: async (_actor, _resource, env) => { await Promise.resolve(); (env.allowed as boolean[]).push(true); return true; } } });
  expect(await engine.can(actor, "read", document, { env: { allowed: [] } })).toBe(true);
});

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
