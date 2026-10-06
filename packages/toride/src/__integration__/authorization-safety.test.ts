import { describe, expect, it } from "vitest";
import { loadJson, Toride } from "../index.js";
import type { ResourceRef } from "../index.js";

const actor = {
  type: "User",
  id: "u1",
  attributes: { enabled: true, level: 3 },
};

const document = { type: "Document", id: "doc1" };

describe("authorization safety through the public API", () => {
  it("denies a permit when an applicable forbid cannot resolve its condition", async () => {
    const policy = await loadJson(JSON.stringify({
      version: "1",
      actors: { User: { attributes: { enabled: "boolean" } } },
      resources: {
        Document: {
          roles: ["viewer"],
          permissions: ["read"],
          attributes: { blocked: "boolean" },
          rules: [
            { effect: "permit", permissions: ["read"], when: { "$actor.enabled": true } },
            { effect: "forbid", permissions: ["read"], when: { "$resource.blocked": true } },
          ],
        },
      },
    }));
    const clear = new Toride({ policy, resolvers: { Document: async () => ({ blocked: false }) } });
    const blocked = new Toride({ policy, resolvers: { Document: async () => ({ blocked: true }) } });
    const unavailable = new Toride({
      policy,
      resolvers: { Document: async () => { throw new Error("document storage unavailable"); } },
    });

    expect(await Promise.all([
      clear.can(actor, "read", document),
      blocked.can(actor, "read", document),
      unavailable.can(actor, "read", document),
    ])).toEqual([true, false, false]);
  });

  it("denies a granted role when its role-scoped forbid cannot resolve its condition", async () => {
    const policy = await loadJson(JSON.stringify({
      version: "1",
      actors: { User: { attributes: { enabled: "boolean" } } },
      resources: {
        Document: {
          roles: ["viewer"],
          permissions: ["read"],
          attributes: { blocked: "boolean" },
          grants: { viewer: ["read"] },
          derived_roles: [{ role: "viewer", when: { "$actor.enabled": true } }],
          rules: [{
            effect: "forbid",
            roles: ["viewer"],
            permissions: ["read"],
            when: { "$resource.blocked": true },
          }],
        },
      },
    }));
    const clear = new Toride({ policy, resolvers: { Document: async () => ({ blocked: false }) } });
    const blocked = new Toride({ policy, resolvers: { Document: async () => ({ blocked: true }) } });
    const unavailable = new Toride({
      policy,
      resolvers: { Document: async () => { throw new Error("document storage unavailable"); } },
    });

    expect(await Promise.all([
      clear.can(actor, "read", document),
      blocked.can(actor, "read", document),
      unavailable.can(actor, "read", document),
    ])).toEqual([true, false, false]);
  });

  describe("known absence and unavailable attributes", () => {
    const cases = [
      { name: "explicit null", attributes: { reviewer: null }, expected: true },
      { name: "present value", attributes: { reviewer: "u2" }, expected: false },
      { name: "omitted partial field", attributes: {}, expected: false },
    ];

    it.each(cases)("evaluates exists:false for $name as $expected", async ({ attributes, expected }) => {
      const policy = await loadJson(JSON.stringify({
        version: "1",
        actors: { User: { attributes: {} } },
        resources: {
          Document: {
            roles: ["viewer"],
            permissions: ["read"],
            attributes: { reviewer: "string" },
            rules: [{
              effect: "permit",
              permissions: ["read"],
              when: { "$resource.reviewer": { exists: false } },
            }],
          },
        },
      }));
      const engine = new Toride({ policy, resolvers: { Document: async () => attributes } });

      expect(await engine.can(actor, "read", document)).toBe(expected);
    });

    it("denies exists:false when the resolver throws", async () => {
      const policy = await loadJson(JSON.stringify({
        version: "1",
        actors: { User: { attributes: {} } },
        resources: {
          Document: {
            roles: ["viewer"],
            permissions: ["read"],
            attributes: { reviewer: "string" },
            rules: [{
              effect: "permit",
              permissions: ["read"],
              when: { "$resource.reviewer": { exists: false } },
            }],
          },
        },
      }));
      const engine = new Toride({
        policy,
        resolvers: { Document: async () => { throw new Error("document storage unavailable"); } },
      });

      expect(await engine.can(actor, "read", document)).toBe(false);
    });
  });

  it("denies a relation with the wrong target type even when that target grants the required role", async () => {
    const policy = await loadJson(JSON.stringify({
      version: "1",
      actors: { User: { attributes: { enabled: "boolean" } } },
      resources: {
        Document: {
          roles: ["viewer"],
          permissions: ["read"],
          relations: { org: "Organization" },
          grants: { viewer: ["read"] },
          derived_roles: [{ role: "viewer", from_role: "member", on_relation: "org" }],
        },
        Organization: {
          roles: ["member"],
          permissions: ["read"],
          attributes: { isPublic: "boolean" },
          grants: { member: ["read"] },
          derived_roles: [{ role: "member", when: { "$resource.isPublic": true } }],
        },
        Workspace: {
          roles: ["member"],
          permissions: ["read"],
          grants: { member: ["read"] },
          derived_roles: [{ role: "member", when: { "$actor.enabled": true } }],
        },
      },
    }));
    const organizations: Record<string, ResourceRef> = {
      allowed: { type: "Organization", id: "public" },
      denied: { type: "Organization", id: "private" },
      wrong: { type: "Workspace", id: "public" },
    };
    const engine = new Toride({
      policy,
      resolvers: {
        Document: async ({ id }) => ({ org: organizations[id] }),
        Organization: async ({ id }) => ({ isPublic: id === "public" }),
      },
    });

    expect(await Promise.all([
      engine.can(actor, "read", { type: "Document", id: "allowed" }),
      engine.can(actor, "read", { type: "Document", id: "denied" }),
      engine.can(actor, "read", { type: "Document", id: "wrong" }),
    ])).toEqual([true, false, false]);
  });

  it("denies declared field read access when resource read is forbidden", async () => {
    const policy = await loadJson(JSON.stringify({
      version: "1",
      actors: { User: { attributes: { enabled: "boolean" } } },
      resources: {
        Document: {
          roles: ["viewer"],
          permissions: ["read"],
          attributes: { blocked: "boolean", secret: "string" },
          grants: { viewer: ["read"] },
          derived_roles: [{ role: "viewer", when: { "$actor.enabled": true } }],
          rules: [{ effect: "forbid", permissions: ["read"], when: { "$resource.blocked": true } }],
          field_access: { secret: { read: ["viewer"] } },
        },
      },
    }));
    const engine = new Toride({ policy });
    const clear = { ...document, attributes: { blocked: false } };
    const blocked = { ...document, attributes: { blocked: true } };

    expect(await Promise.all([
      engine.can(actor, "read", clear),
      engine.canField(actor, "read", clear, "secret"),
      engine.can(actor, "read", blocked),
      engine.canField(actor, "read", blocked, "secret"),
    ])).toEqual([true, true, false, false]);
  });

  it.each([
    { name: "condition-only role", derivation: { role: "viewer", when: { "$env.featureEnabled": true } } },
    { name: "actor-type role", derivation: { role: "viewer", actor_type: "User", when: { "$env.featureEnabled": true } } },
  ])("uses supplied environment values in a $name", async ({ derivation }) => {
    const policy = await loadJson(JSON.stringify({
      version: "1",
      actors: { User: { attributes: {} } },
      resources: {
        Document: {
          roles: ["viewer"],
          permissions: ["read"],
          grants: { viewer: ["read"] },
          derived_roles: [derivation],
        },
      },
    }));
    const engine = new Toride({ policy });

    expect(await Promise.all([
      engine.can(actor, "read", document, { env: { featureEnabled: true } }),
      engine.can(actor, "read", document, { env: { featureEnabled: false } }),
      engine.can(actor, "read", document),
    ])).toEqual([true, false, false]);
  });

  it("applies the same actor operator in global and local role conditions", async () => {
    const policy = await loadJson(JSON.stringify({
      version: "1",
      actors: { User: { attributes: { level: "number" } } },
      global_roles: { qualified: { actor_type: "User", when: { "$actor.level": { gte: 2 } } } },
      resources: {
        Document: {
          roles: ["global_reader", "local_reader"],
          permissions: ["read_global", "read_local"],
          grants: { global_reader: ["read_global"], local_reader: ["read_local"] },
          derived_roles: [
            { role: "global_reader", from_global_role: "qualified" },
            { role: "local_reader", when: { "$actor.level": { gte: 2 } } },
          ],
        },
      },
    }));
    const engine = new Toride({ policy });
    const belowThreshold = { ...actor, attributes: { level: 1 } };

    expect(await Promise.all([
      engine.can(actor, "read_global", document),
      engine.can(actor, "read_local", document),
      engine.can(belowThreshold, "read_global", document),
      engine.can(belowThreshold, "read_local", document),
    ])).toEqual([true, true, false, false]);
  });
});
