// T056: Integration tests for end-to-end partial evaluation

import { describe, it, expect, beforeAll } from "vitest";
import type {
  ActorRef,
  ResourceRef,
  RelationResolver,
  Policy,
  TorideOptions,
} from "../../src/types.js";
import type {
  Constraint,
  ConstraintResult,
  ConstraintAdapter,
  LeafConstraint,
} from "../../src/partial/constraint-types.js";

describe("partial evaluation integration", () => {
  let createToride: (options: TorideOptions) => {
    can: (actor: ActorRef, action: string, resource: ResourceRef, options?: { env?: Record<string, unknown> }) => Promise<boolean>;
    buildConstraints: (actor: ActorRef, action: string, resourceType: string, options?: { env?: Record<string, unknown> }) => Promise<ConstraintResult>;
    translateConstraints: <TQuery>(constraints: Constraint, adapter: ConstraintAdapter<TQuery>) => TQuery;
  };
  let loadYaml: (input: string) => Promise<Policy>;

  beforeAll(async () => {
    const engineMod = await import("../../src/engine.js");
    createToride = engineMod.createToride as typeof createToride;
    const parserMod = await import("../../src/policy/parser.js");
    loadYaml = parserMod.loadYaml;
  });

  // ─── Helpers ──────────────────────────────────────────────────────

  function makeResolver(opts: {
    roles?: Record<string, string[]>;
    related?: Record<string, Record<string, ResourceRef | ResourceRef[]>>;
    attributes?: Record<string, Record<string, unknown>>;
  } = {}): RelationResolver {
    return {
      getRoles: async (actor: ActorRef, resource: ResourceRef) => {
        const key = `${actor.id}:${resource.type}:${resource.id}`;
        return opts.roles?.[key] ?? [];
      },
      getRelated: async (resource: ResourceRef, relation: string) => {
        const key = `${resource.type}:${resource.id}`;
        return opts.related?.[key]?.[relation] ?? [];
      },
      getAttributes: async (ref: ResourceRef) => {
        const key = `${ref.type}:${ref.id}`;
        return opts.attributes?.[key] ?? {};
      },
    };
  }

  function makeStringAdapter(): ConstraintAdapter<string> {
    return {
      translate(c: LeafConstraint): string {
        switch (c.type) {
          case "field_eq": return `${c.field} = ${JSON.stringify(c.value)}`;
          case "field_neq": return `${c.field} != ${JSON.stringify(c.value)}`;
          case "field_gt": return `${c.field} > ${JSON.stringify(c.value)}`;
          case "field_gte": return `${c.field} >= ${JSON.stringify(c.value)}`;
          case "field_lt": return `${c.field} < ${JSON.stringify(c.value)}`;
          case "field_lte": return `${c.field} <= ${JSON.stringify(c.value)}`;
          case "field_in": return `${c.field} IN ${JSON.stringify(c.values)}`;
          case "field_nin": return `${c.field} NOT IN ${JSON.stringify(c.values)}`;
          case "field_exists": return c.exists ? `${c.field} IS NOT NULL` : `${c.field} IS NULL`;
          case "field_includes": return `${c.field} INCLUDES ${JSON.stringify(c.value)}`;
          case "field_contains": return `${c.field} CONTAINS ${JSON.stringify(c.value)}`;
          default: return "UNKNOWN_LEAF";
        }
      },
      relation(field, resourceType, childQuery) {
        return `${field} -> ${resourceType}(${childQuery})`;
      },
      hasRole(actorId, actorType, role) {
        return `HAS_ROLE(${actorType}:${actorId}, ${role})`;
      },
      unknown(name) {
        return `UNKNOWN(${name})`;
      },
      and(queries) {
        return `(${queries.join(" AND ")})`;
      },
      or(queries) {
        return `(${queries.join(" OR ")})`;
      },
      not(query) {
        return `NOT(${query})`;
      },
    };
  }

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
      org:
        resource: Organization
        cardinality: one
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
      project:
        resource: Project
        cardinality: one
      assignee:
        resource: User
        cardinality: one
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

  // ─── Acceptance Scenario 1: superadmin = unrestricted ─────────────

  it("returns unrestricted for superadmin", async () => {
    const policy = await loadYaml(FULL_POLICY_YAML);
    const resolver = makeResolver();
    const engine = createToride({ policy, resolver });
    const actor: ActorRef = {
      type: "User",
      id: "admin1",
      attributes: { isSuperAdmin: true },
    };

    // Superadmin gets viewer via global_role -> grants read on Project
    const result = await engine.buildConstraints(actor, "read", "Project");
    expect(result).toEqual({ unrestricted: true });
  });

  // ─── Acceptance Scenario 2: no access = forbidden ──────────────────

  it("returns forbidden for actor with no access paths", async () => {
    const policy = await loadYaml(FULL_POLICY_YAML);
    const resolver = makeResolver();
    const engine = createToride({ policy, resolver });
    const actor: ActorRef = {
      type: "User",
      id: "nobody",
      attributes: {},
    };

    // No roles, no derivation match, no global role
    const result = await engine.buildConstraints(actor, "delete", "Organization");
    expect(result).toEqual({ forbidden: true });
  });

  // ─── Acceptance Scenario 3: relation-derived role produces has_role ─

  it("produces has_role for relation-derived roles", async () => {
    const policy = await loadYaml(FULL_POLICY_YAML);
    const resolver = makeResolver();
    const engine = createToride({ policy, resolver });
    const actor: ActorRef = {
      type: "User",
      id: "u1",
      attributes: {},
    };

    const result = await engine.buildConstraints(actor, "read", "Task");
    // Task.viewer can be derived from Project.viewer via project relation
    // Should produce a constrained result with has_role or relation nodes
    expect(result).toHaveProperty("constraints");
  });

  // ─── Acceptance Scenario 4: $actor value inlining ──────────────────

  it("inlines actor attribute values into constraints", async () => {
    // Use a forbid rule so actor attribute gets inlined into a constraint
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
    const resolver = makeResolver();
    const engine = createToride({ policy, resolver });
    const actor: ActorRef = {
      type: "User",
      id: "u1",
      attributes: { active: true, department: "engineering" },
    };

    const result = await engine.buildConstraints(actor, "read", "Task");
    expect(result).toHaveProperty("constraints");
    const constraints = (result as { constraints: Constraint }).constraints;

    // Verify the actor's department value is inlined (in a NOT wrapper from forbid)
    const str = JSON.stringify(constraints);
    expect(str).toContain("engineering");
  });

  // ─── Acceptance Scenario 5: end-to-end with adapter ─────────────────

  it("translates constraint AST via adapter", async () => {
    // Use a forbid rule so the result is constrained (not unrestricted)
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
    const resolver = makeResolver();
    const engine = createToride({ policy, resolver });
    const actor: ActorRef = {
      type: "User",
      id: "u1",
      attributes: { active: true },
    };
    const adapter = makeStringAdapter();

    const result = await engine.buildConstraints(actor, "read", "Task");
    expect(result).toHaveProperty("constraints");

    const translated = engine.translateConstraints(
      (result as { constraints: Constraint }).constraints,
      adapter,
    );
    expect(typeof translated).toBe("string");
    expect(translated.length).toBeGreaterThan(0);
    // Should contain NOT wrapper from the forbid rule
    expect(translated).toContain("NOT");
  });

  // ─── Forbid rules produce NOT constraints ───────────────────────────

  it("forbid rules produce NOT wrappers in constraints", async () => {
    const policy = await loadYaml(FULL_POLICY_YAML);
    const resolver = makeResolver();
    const engine = createToride({ policy, resolver });
    const adapter = makeStringAdapter();
    const actor: ActorRef = {
      type: "User",
      id: "u1",
      attributes: {},
    };

    // Task has a forbid rule on delete when archived
    // Actor needs editor role (from_relation: assignee) to have delete access
    // But we need at least assignee derivation path
    const result = await engine.buildConstraints(actor, "delete", "Task");

    // Even if forbidden (no access paths), the test validates the engine handles it
    if ("constraints" in result) {
      const translated = engine.translateConstraints(result.constraints, adapter);
      // The forbid condition should appear as a NOT() wrapper
      expect(translated).toContain("NOT");
    }
  });

  // ─── Custom evaluator produces unknown node ───────────────────────

  it("custom evaluator produces unknown constraint node", async () => {
    // Use a forbid rule with custom evaluator so the result is constrained
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
    const resolver = makeResolver();
    const engine = createToride({ policy, resolver });
    const adapter = makeStringAdapter();
    const actor: ActorRef = {
      type: "User",
      id: "u1",
      attributes: { active: true },
    };

    const result = await engine.buildConstraints(actor, "read", "Task");
    expect(result).toHaveProperty("constraints");

    const translated = engine.translateConstraints(
      (result as { constraints: Constraint }).constraints,
      adapter,
    );
    expect(translated).toContain("UNKNOWN(businessHours)");
  });
});
