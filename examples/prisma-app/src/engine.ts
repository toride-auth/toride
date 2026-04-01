import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ResourceRef } from "toride";
import { Toride, loadYaml } from "toride";
import { createPrismaAdapter } from "@toride/prisma";
import { prisma } from "./db.js";
import type { AppSchema } from "./types.js";

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
//
// virtualFields maps the virtual array fields (viewer_ids, editor_ids, admin_ids)
// used in policy conditions to their underlying roleAssignments relation,
// translating { field_includes: { field: "viewer_ids", value: actorId } } into
// { roleAssignments: { some: { userId: actorId, role: "viewer" } } }.
// ---------------------------------------------------------------------------
export const adapter = createPrismaAdapter({
  virtualFields: {
    viewer_ids: { relation: "roleAssignments", matchField: "userId", filter: { role: "viewer" } },
    editor_ids: { relation: "roleAssignments", matchField: "userId", filter: { role: "editor" } },
    admin_ids: { relation: "roleAssignments", matchField: "userId", filter: { role: "admin" } },
  },
});

// ---------------------------------------------------------------------------
// 3. RESOURCE RESOLVERS
//
// Resolvers tell the engine how to fetch resource attributes when it needs to
// evaluate a policy rule against a specific resource instance. The engine calls
// a resolver whenever you use can(), permittedActions(), or when derived roles
// require attribute checks (e.g., "$actor.department == $resource.department").
//
// For simple models, createPrismaResolver(prisma, "model") generates a
// standard resolver automatically. However, when you need to include related
// data (like role assignments) in the resource attributes for policy evaluation,
// a custom resolver is required.
//
// The Project resolver below includes each user's role assignments as arrays
// of user IDs (viewer_ids, editor_ids, admin_ids). This allows the policy to
// use "$actor.id: { in: $resource.viewer_ids }" to check direct role
// assignments during can() and permittedActions() evaluation.
// ---------------------------------------------------------------------------
const projectResolver = async (ref: ResourceRef<AppSchema, "Project">) => {
  const project = await prisma.project.findUnique({
    where: { id: ref.id },
    include: {
      roleAssignments: { select: { userId: true, role: true } },
    },
  });
  if (!project) return {};
  // Build per-role user ID arrays for policy condition checks
  const viewerIds: string[] = [];
  const editorIds: string[] = [];
  const adminIds: string[] = [];
  for (const ra of project.roleAssignments) {
    if (ra.role === "viewer") viewerIds.push(ra.userId);
    if (ra.role === "editor") editorIds.push(ra.userId);
    if (ra.role === "admin") adminIds.push(ra.userId);
  }
  return {
    name: project.name,
    department: project.department,
    status: project.status,
    archived: project.archived,
    viewer_ids: viewerIds,
    editor_ids: editorIds,
    admin_ids: adminIds,
  };
};

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
const taskResolver = async (ref: ResourceRef<AppSchema, "Task">) => {
  const task = await prisma.task.findUnique({ where: { id: ref.id } });
  if (!task) return {};
  return {
    title: task.title,
    description: task.description,
    status: task.status,
    project: { type: "Project" as const, id: task.projectId },
    assignee: task.assigneeId
      ? { type: "User" as const, id: task.assigneeId }
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
//   - snapshot(actor, resources)           -> PermissionSnapshot (batched permissions)
//
// Parameterizing with AppSchema enables compile-time type checking on all
// engine calls: action strings, resource types, and actor types are validated.
// ---------------------------------------------------------------------------
export const engine = new Toride<AppSchema>({
  policy,
  resolvers: {
    Project: projectResolver,
    Task: taskResolver,
  },
});