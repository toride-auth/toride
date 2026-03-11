import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Toride, loadYaml } from "toride";
import { createPrismaAdapter, createPrismaResolver } from "@toride/prisma";
import { prisma } from "./db.js";

// ---------------------------------------------------------------------------
// 1. POLICY LOADING
//
// toride policies are defined in YAML and describe your authorization model:
// actors, global roles, resources, permissions, derived roles, and forbid rules.
// loadYaml() parses the YAML string into a validated Policy object that the
// engine consumes. See policy.yaml for the full definition used by this app.
//
// Keeping the policy in a separate YAML file makes it easy to review and
// modify authorization rules without touching application code.
// ---------------------------------------------------------------------------
const policyPath = resolve(import.meta.dirname, "..", "policy.yaml");
const policyYaml = readFileSync(policyPath, "utf-8");
const policy = await loadYaml(policyYaml);

// ---------------------------------------------------------------------------
// 2. PRISMA CONSTRAINT ADAPTER
//
// createPrismaAdapter() returns a translator that converts toride's abstract
// constraint AST into Prisma-compatible WHERE clause objects. This is what
// makes buildConstraints() useful in practice: the engine produces abstract
// constraints (e.g., "department == engineering AND archived != true"), and
// the adapter turns them into { department: "engineering", archived: { not: true } }.
//
// The adapter is stateless and reusable across all resource types.
// ---------------------------------------------------------------------------
export const adapter = createPrismaAdapter();

// ---------------------------------------------------------------------------
// 3. RESOURCE RESOLVERS
//
// Resolvers tell the engine how to fetch resource attributes when it needs to
// evaluate a policy rule against a specific resource instance. The engine calls
// a resolver whenever you use can(), permittedActions(), or when derived roles
// require attribute checks (e.g., "$actor.department == $resource.department").
//
// createPrismaResolver(prisma, "project") generates a standard resolver that
// maps a ResourceRef { type: "Project", id: "..." } to the Prisma model's
// fields automatically. This works for flat models with no relation-based
// policy rules.
// ---------------------------------------------------------------------------
const projectResolver = createPrismaResolver(prisma, "project");

// ---------------------------------------------------------------------------
// 4. CUSTOM TASK RESOLVER
//
// When a resource has relations referenced in the policy (like Task's "project"
// and "assignee" relations in policy.yaml), the resolver must return those
// relations as ResourceRef objects ({ type, id }) so the engine can follow
// them during evaluation.
//
// For example, the Task policy derives viewer/editor roles from the parent
// Project via "on_relation: project", and derives editor from the assignee
// via "from_relation: assignee". The engine traverses these refs to check
// whether the actor holds the required role on the related resource.
//
// Prisma stores these as foreign key columns (projectId, assigneeId), so we
// manually map them to ResourceRef objects here.
// ---------------------------------------------------------------------------
const taskResolver = async (ref: { type: string; id: string }) => {
  const task = await prisma.task.findUnique({ where: { id: ref.id } });
  if (!task) return {};
  return {
    title: task.title,
    description: task.description,
    status: task.status,
    project: { type: "Project", id: task.projectId },
    assignee: task.assigneeId
      ? { type: "User", id: task.assigneeId }
      : null,
  };
};

// ---------------------------------------------------------------------------
// 5. ENGINE CONSTRUCTION
//
// The Toride constructor wires everything together: it takes the parsed policy
// and a map of resolvers keyed by resource type name. Once created, the engine
// exposes four main methods used throughout the app:
//
//   - can(actor, action, resource)         -> boolean (single permission check)
//   - buildConstraints(actor, action, type) -> constraint AST or forbidden/unrestricted
//   - translateConstraints(constraints, adapter) -> Prisma WHERE clause
//   - permittedActions(actor, resource)    -> string[] (UI-driven action visibility)
//
// The engine is stateless per request; it resolves attributes on demand via
// the registered resolvers.
// ---------------------------------------------------------------------------
export const engine = new Toride({
  policy,
  resolvers: {
    Project: projectResolver,
    Task: taskResolver,
  },
});
