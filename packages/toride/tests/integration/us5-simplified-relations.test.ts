// T030: Integration tests for US5 — Simplified Relation Declarations
// Tests the 2 acceptance scenarios from spec.md US5:
// 1. Simplified syntax (org: Organization) works end-to-end
// 2. Old syntax ({ resource: Organization, cardinality: one }) is rejected with clear error

import { describe, it, expect, vi } from "vitest";
import type {
  ActorRef,
  ResourceRef,
  Policy,
  Resolvers,
  ResourceResolver,
} from "../../src/types.js";
import { ValidationError } from "../../src/types.js";
import { loadYaml, loadJson } from "../../src/policy/parser.js";
import { createToride } from "../../src/engine.js";

// ─── Acceptance Scenario 1: Simplified syntax works e2e ─────────────

describe("US5: Simplified Relation Declarations", () => {
  describe("Acceptance Scenario 1: simplified syntax works end-to-end", () => {
    it("parses a policy with simplified relation syntax (org: Organization)", async () => {
      const yaml = `
version: "1"
actors:
  User:
    attributes:
      id: string
resources:
  Document:
    roles: [viewer]
    permissions: [read]
    relations:
      org: Organization
    grants:
      viewer: [read]
  Organization:
    roles: [member]
    permissions: [read]
    grants:
      member: [read]
`;
      const policy = await loadYaml(yaml);
      expect(policy.resources.Document.relations).toBeDefined();
      expect(policy.resources.Document.relations!.org).toBe("Organization");
    });

    it("evaluates a policy with simplified relation syntax correctly", async () => {
      const policy: Policy = {
        version: "1",
        actors: {
          User: { attributes: { id: "string" } },
        },
        resources: {
          Document: {
            roles: ["viewer"],
            permissions: ["read"],
            relations: {
              org: "Organization",
            },
            grants: {
              viewer: ["read"],
            },
            rules: [
              {
                effect: "permit",
                permissions: ["read"],
                when: {
                  "$resource.org.plan": "enterprise",
                },
              },
            ],
          },
          Organization: {
            roles: ["member"],
            permissions: ["read"],
            grants: {
              member: ["read"],
            },
          },
        },
      };

      const resolvers: Resolvers = {
        Organization: async (ref) => ({ plan: "enterprise" }),
      };

      const toride = createToride({ policy, resolvers });
      const actor: ActorRef = { type: "User", id: "u1", attributes: { id: "u1" } };
      const resource: ResourceRef = {
        type: "Document",
        id: "doc1",
        attributes: {
          org: { type: "Organization", id: "org1" },
        },
      };

      const result = await toride.can(actor, "read", resource);
      expect(result).toBe(true);
    });

    it("handles multiple simplified relations on a single resource", async () => {
      const yaml = `
version: "1"
actors:
  User:
    attributes:
      id: string
resources:
  Task:
    roles: [viewer]
    permissions: [read]
    relations:
      project: Project
      assignee: User
    grants:
      viewer: [read]
    derived_roles:
      - role: viewer
        from_relation: assignee
  Project:
    roles: [member]
    permissions: [read]
    grants:
      member: [read]
`;
      const policy = await loadYaml(yaml);
      expect(policy.resources.Task.relations!.project).toBe("Project");
      expect(policy.resources.Task.relations!.assignee).toBe("User");
    });
  });

  // ─── Acceptance Scenario 2: Old syntax rejected ─────────────────────

  describe("Acceptance Scenario 2: old syntax rejected with clear error", () => {
    it("rejects old object syntax { resource: ..., cardinality: ... } with migration message", async () => {
      const yaml = `
version: "1"
actors:
  User:
    attributes:
      id: string
resources:
  Document:
    roles: [viewer]
    permissions: [read]
    relations:
      org:
        resource: Organization
        cardinality: one
    grants:
      viewer: [read]
  Organization:
    roles: [member]
    permissions: [read]
    grants:
      member: [read]
`;
      await expect(loadYaml(yaml)).rejects.toThrow(ValidationError);
      try {
        await loadYaml(yaml);
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        const msg = (e as ValidationError).message;
        // Should contain a migration hint
        expect(msg).toContain("org");
        expect(msg).toMatch(/org:\s*Organization/);
      }
    });

    it("rejects old object syntax with cardinality: many", async () => {
      const yaml = `
version: "1"
actors:
  User:
    attributes:
      id: string
resources:
  Document:
    roles: [viewer]
    permissions: [read]
    relations:
      tags:
        resource: Tag
        cardinality: many
    grants:
      viewer: [read]
  Tag:
    roles: [viewer]
    permissions: [read]
    grants:
      viewer: [read]
`;
      await expect(loadYaml(yaml)).rejects.toThrow(ValidationError);
      try {
        await loadYaml(yaml);
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        const msg = (e as ValidationError).message;
        expect(msg).toContain("tags");
        expect(msg).toMatch(/tags:\s*Tag/);
      }
    });

    it("rejects old object syntax via JSON input", async () => {
      const json = JSON.stringify({
        version: "1",
        actors: {
          User: { attributes: { id: "string" } },
        },
        resources: {
          Document: {
            roles: ["viewer"],
            permissions: ["read"],
            relations: {
              org: { resource: "Organization", cardinality: "one" },
            },
            grants: { viewer: ["read"] },
          },
          Organization: {
            roles: ["member"],
            permissions: ["read"],
            grants: { member: ["read"] },
          },
        },
      });
      await expect(loadJson(json)).rejects.toThrow(ValidationError);
      try {
        await loadJson(json);
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        const msg = (e as ValidationError).message;
        expect(msg).toContain("org");
        expect(msg).toMatch(/org:\s*Organization/);
      }
    });

    it("rejects old object syntax even with only resource field (no cardinality)", async () => {
      const yaml = `
version: "1"
actors:
  User:
    attributes:
      id: string
resources:
  Document:
    roles: [viewer]
    permissions: [read]
    relations:
      org:
        resource: Organization
    grants:
      viewer: [read]
  Organization:
    roles: [member]
    permissions: [read]
    grants:
      member: [read]
`;
      await expect(loadYaml(yaml)).rejects.toThrow(ValidationError);
    });
  });
});
