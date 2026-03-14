// T056: Integration tests for end-to-end partial evaluation
// Updated for Resolvers map / AttributeCache (Phase 3)

import { describe, it, expect, beforeAll } from "vitest";
import type {
  ActorRef,
  ResourceRef,
  Policy,
  TorideOptions,
} from "../types.js";
import type {
  Constraint,
  ConstraintResult,
  ConstraintAdapter,
} from "../partial/constraint-types.js";
import { makeStringAdapter, makeResolver } from "../testing/test-adapter.js";

describe("partial evaluation integration", () => {
  let createToride: (options: TorideOptions) => {
    can: (actor: ActorRef, action: string, resource: ResourceRef, options?: { env?: Record<string, unknown> }) => Promise<boolean>;
    buildConstraints: (actor: ActorRef, action: string, resourceType: string, options?: { env?: Record<string, unknown> }) => Promise<ConstraintResult>;
    translateConstraints: <R extends string, TQueryMap extends Record<string, unknown>>(constraint: Constraint, adapter: ConstraintAdapter<TQueryMap>) => TQueryMap[R];
  };
  let loadYaml: (input: string) => Promise<Policy>;

  beforeAll(async () => {
    const engineMod = await import("../../src/engine.js");
    createToride = engineMod.createToride as typeof createToride;
    const parserMod = await import("../../src/policy/parser.js");
    loadYaml = parserMod.loadYaml;
  });

  const FULL_POLICY_YAML = `
version: "1"
actors:
  User:
    attributes:
      isSuperAdmin: boolean
      department: string
      active: boolean
global_roles:
  superadmin:
    actor_type: User
    when:
      $actor.isSuperAdmin: true
resources:
  Organization:
    roles: [admin, member]
    permissions: [read, update, delete]
    grants:
      admin: [all]
      member: [read]
  Project:
    roles: [viewer, editor, admin]
    permissions: [read, update, delete, create_task]
    relations:
      org: Organization
    grants:
      viewer: [read]
      editor: [read, update, create_task]
      admin: [all]
    derived_roles:
      - role: admin
        from_role: admin
        on_relation: org
      - role: viewer
        from_global_role: superadmin
  Task:
    roles: [viewer, editor]
    permissions: [read, update, delete]
    relations:
      project: Project
      assignee: User
    grants:
      viewer: [read]
      editor: [read, update]
    derived_roles:
      - role: editor
        from_relation: assignee
      - role: viewer
        from_role: viewer
        on_relation: project
    rules:
      - effect: forbid
        permissions: [delete]
        when:
          $resource.archived: true
      - effect: permit
        permissions: [read]
        when:
          $resource.isPublic: true
`;

  // ---- Acceptance Scenario 1: superadmin = unrestricted ----

  it("returns ok:true, constraint:null for superadmin", async () => {
    const policy = await loadYaml(FULL_POLICY_YAML);
    const cache = makeResolver();
    const engine = createToride({ policy });
    const actor: ActorRef = {
      type: "User",
      id: "admin1",
      attributes: { isSuperAdmin: true },
    };

    // Superadmin gets viewer via global_role -> grants read on Project
    const result = await engine.buildConstraints(actor, "read", "Project");
    expect(result).toEqual({ ok: true, constraint: null });
  });

  // ---- Acceptance Scenario 2: no access = forbidden ----

  it("returns ok:false for actor with no access paths", async () => {
    const policy = await loadYaml(FULL_POLICY_YAML);
    const engine = createToride({ policy });
    const actor: ActorRef = {
      type: "User",
      id: "nobody",
      attributes: {},
    };

    // No roles, no derivation match, no global role
    const result = await engine.buildConstraints(actor, "delete", "Organization");
    expect(result).toEqual({ ok: false });
  });

  // ---- Acceptance Scenario 3: relation-derived role produces has_role ----

  it("produces relation -> has_role structure for relation-derived roles", async () => {
    const policy = await loadYaml(FULL_POLICY_YAML);
    const engine = createToride({ policy });
    const actor: ActorRef = {
      type: "User",
      id: "u1",
      attributes: {},
    };

    const result = await engine.buildConstraints(actor, "read", "Task");
    // Task.viewer can be derived from Project.viewer via project relation
    // Task.editor from assignee relation (identity check)
    expect(result.ok).toBe(true);
    expect(result.constraint).not.toBeNull();

    const constraint = (result as { ok: true; constraint: Constraint }).constraint;
    // Verify structural content -- should contain relation and/or has_role nodes
    const str = JSON.stringify(constraint);
    expect(str).toContain('"type":"relation"');
  });

  // ---- Acceptance Scenario 4: $actor value inlining ----

  it("inlines actor attribute values into constraints", async () => {
    const policyYaml = `
version: "1"
actors:
  User:
    attributes:
      department: string
      active: boolean
resources:
  Task:
    roles: [viewer]
    permissions: [read]
    grants:
      viewer: [read]
    derived_roles:
      - role: viewer
        when:
          $actor.active: true
    rules:
      - effect: forbid
        permissions: [read]
        when:
          $resource.department: $actor.department
`;
    const policy = await loadYaml(policyYaml);
    const engine = createToride({ policy });
    const actor: ActorRef = {
      type: "User",
      id: "u1",
      attributes: { active: true, department: "engineering" },
    };

    const result = await engine.buildConstraints(actor, "read", "Task");
    expect(result.ok).toBe(true);
    expect(result.constraint).not.toBeNull();
    const constraint = (result as { ok: true; constraint: Constraint }).constraint;

    // Verify exact structure: NOT(field_eq(department, "engineering"))
    expect(constraint).toEqual({
      type: "not",
      child: {
        type: "field_eq",
        field: "department",
        value: "engineering",
      },
    });
  });

  // ---- Acceptance Scenario 5: end-to-end with adapter ----

  it("translates constraint AST via adapter", async () => {
    const policyYaml = `
version: "1"
actors:
  User:
    attributes:
      active: boolean
resources:
  Task:
    roles: [viewer]
    permissions: [read]
    grants:
      viewer: [read]
    derived_roles:
      - role: viewer
        when:
          $actor.active: true
    rules:
      - effect: forbid
        permissions: [read]
        when:
          $resource.deleted: true
`;
    const policy = await loadYaml(policyYaml);
    const engine = createToride({ policy });
    const actor: ActorRef = {
      type: "User",
      id: "u1",
      attributes: { active: true },
    };
    const adapter = makeStringAdapter();

    const result = await engine.buildConstraints(actor, "read", "Task");
    expect(result.ok).toBe(true);
    expect(result.constraint).not.toBeNull();

    const constraint = (result as { ok: true; constraint: Constraint }).constraint;
    const translated = engine.translateConstraints(constraint, adapter);
    // Verify exact translation output
    expect(translated).toBe('NOT(deleted = true)');
  });

  // ---- Finding 8: Forbid rules produce NOT constraints (meaningful assertion) ----

  it("forbid rules produce NOT wrappers in constraints for an actor with access", async () => {
    // Use a policy where the actor CAN derive a role, and a forbid rule applies
    const policyYaml = `
version: "1"
actors:
  User:
    attributes:
      active: boolean
resources:
  Task:
    roles: [editor]
    permissions: [read, update, delete]
    grants:
      editor: [read, update, delete]
    derived_roles:
      - role: editor
        when:
          $actor.active: true
    rules:
      - effect: forbid
        permissions: [delete]
        when:
          $resource.archived: true
`;
    const policy = await loadYaml(policyYaml);
    const engine = createToride({ policy });
    const adapter = makeStringAdapter();
    const actor: ActorRef = {
      type: "User",
      id: "u1",
      attributes: { active: true },
    };

    const result = await engine.buildConstraints(actor, "delete", "Task");
    // The actor has access (editor role) but a forbid rule restricts deletes on archived items
    // Result MUST be constrained (not forbidden)
    expect(result.ok).toBe(true);
    expect(result.constraint).not.toBeNull();

    const constraint = (result as { ok: true; constraint: Constraint }).constraint;
    // Verify exact structure: NOT(field_eq(archived, true))
    expect(constraint).toEqual({
      type: "not",
      child: {
        type: "field_eq",
        field: "archived",
        value: true,
      },
    });

    const translated = engine.translateConstraints(constraint, adapter);
    expect(translated).toBe("NOT(archived = true)");
  });

  // ---- Custom evaluator produces unknown node ----

  it("custom evaluator produces unknown constraint node", async () => {
    const policyYaml = `
version: "1"
actors:
  User:
    attributes:
      active: boolean
resources:
  Task:
    roles: [viewer]
    permissions: [read]
    grants:
      viewer: [read]
    derived_roles:
      - role: viewer
        when:
          $actor.active: true
    rules:
      - effect: forbid
        permissions: [read]
        when:
          $resource.status:
            custom: businessHours
`;
    const policy = await loadYaml(policyYaml);
    const engine = createToride({ policy });
    const adapter = makeStringAdapter();
    const actor: ActorRef = {
      type: "User",
      id: "u1",
      attributes: { active: true },
    };

    const result = await engine.buildConstraints(actor, "read", "Task");
    expect(result.ok).toBe(true);
    expect(result.constraint).not.toBeNull();

    const constraint = (result as { ok: true; constraint: Constraint }).constraint;
    // Verify exact structure: NOT(unknown("businessHours"))
    expect(constraint).toEqual({
      type: "not",
      child: {
        type: "unknown",
        name: "businessHours",
      },
    });

    const translated = engine.translateConstraints(constraint, adapter);
    expect(translated).toBe("NOT(UNKNOWN(businessHours))");
  });
});
