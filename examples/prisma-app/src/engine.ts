import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ResourceResolver } from "toride";
import { Toride, loadYaml } from "toride";
import { createPrismaAdapter } from "@toride/prisma";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db.js";
import type { AppSchema } from "./types.js";

const policyPath = resolve(import.meta.dirname, "..", "policy.yaml");
const policy = await loadYaml(readFileSync(policyPath, "utf-8"));

type ModelMap = {
  Project: Prisma.$ProjectPayload;
  Task: Prisma.$TaskPayload;
  User: Prisma.$UserPayload;
};
type QueryMap = {
  Project: Prisma.ProjectWhereInput;
  Task: Prisma.TaskWhereInput;
};

// These mappings assert correspondence with the complete resolver data below.
export const adapter = createPrismaAdapter<AppSchema, ModelMap, QueryMap>({
  fields: {
    Project: {
      id: { field: "id", type: "string", nullable: false, stringComparison: "binary" },
      name: { field: "name", type: "string", nullable: false, stringComparison: "binary" },
      department: { field: "department", type: "string", nullable: false, stringComparison: "binary" },
      status: { field: "status", type: "string", nullable: false, stringComparison: "binary" },
      archived: { field: "archived", type: "boolean", nullable: false },
    },
    Task: {
      id: { field: "id", type: "string", nullable: false, stringComparison: "binary" },
      title: { field: "title", type: "string", nullable: false, stringComparison: "binary" },
      description: { field: "description", type: "string", nullable: true, stringComparison: "binary" },
      status: { field: "status", type: "string", nullable: false, stringComparison: "binary" },
    },
    User: {
      id: { field: "id", type: "string", nullable: false, stringComparison: "binary" },
    },
  },
  relations: {
    Task: {
      project: { field: "project", resourceType: "Project", cardinality: "one" },
      assignee: { field: "assignee", resourceType: "User", cardinality: "one" },
    },
  },
  virtualFields: {
    Project: {
      viewer_ids: {
        relation: "roleAssignments", matchField: "userId", filter: { role: "viewer" },
        cardinality: "many", valueType: "string", stringComparison: "binary",
      },
      editor_ids: {
        relation: "roleAssignments", matchField: "userId", filter: { role: "editor" },
        cardinality: "many", valueType: "string", stringComparison: "binary",
      },
      admin_ids: {
        relation: "roleAssignments", matchField: "userId", filter: { role: "admin" },
        cardinality: "many", valueType: "string", stringComparison: "binary",
      },
    },
  },
});

const projectResolver: ResourceResolver<AppSchema, "Project"> = async (ref) => {
  const project = await prisma.project.findUnique({
    where: { id: ref.id },
    include: { roleAssignments: { select: { userId: true, role: true } } },
  });
  if (!project) return null;
  const viewerIds: string[] = [];
  const editorIds: string[] = [];
  const adminIds: string[] = [];
  for (const assignment of project.roleAssignments) {
    if (assignment.role === "viewer") viewerIds.push(assignment.userId);
    if (assignment.role === "editor") editorIds.push(assignment.userId);
    if (assignment.role === "admin") adminIds.push(assignment.userId);
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

const taskResolver: ResourceResolver<AppSchema, "Task"> = async (ref) => {
  const task = await prisma.task.findUnique({ where: { id: ref.id } });
  if (!task) return null;
  return {
    title: task.title,
    description: task.description,
    status: task.status,
    project: { type: "Project", id: task.projectId },
    assignee: task.assigneeId ? { type: "User", id: task.assigneeId } : null,
  };
};

export const engine = new Toride<AppSchema>({
  policy,
  resolvers: { Project: projectResolver, Task: taskResolver },
});
