import { expect, it } from "vitest";
import { Toride } from "../engine.js";

it("resolves declared roles without implicit direct assignments", async () => {
  const engine = new Toride({ policy: { version: "1", actors: { User: { attributes: {} } }, resources: { Document: { roles: ["viewer"], permissions: ["read"], derived_roles: [{ role: "viewer", when: { "$actor.enabled": true } }] } } } });
  expect(await engine.resolvedRoles({ type: "User", id: "u1", attributes: { enabled: true } }, { type: "Document", id: "d1" })).toEqual(["viewer"]);
  expect(await engine.resolvedRoles({ type: "User", id: "u1", attributes: { enabled: false } }, { type: "Document", id: "d1" })).toEqual([]);
});
