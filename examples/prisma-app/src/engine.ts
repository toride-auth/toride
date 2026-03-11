import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Toride, loadYaml } from "toride";
import { createPrismaAdapter, createPrismaResolver } from "@toride/prisma";
import { prisma } from "./db.js";

// Load and parse the YAML policy file
const policyPath = resolve(import.meta.dirname, "..", "policy.yaml");
const policyYaml = readFileSync(policyPath, "utf-8");
const policy = await loadYaml(policyYaml);

// Create the Prisma constraint adapter for translating constraints into WHERE clauses
export const adapter = createPrismaAdapter();

// Create resolvers for each resource type
const projectResolver = createPrismaResolver(prisma, "project");

// Task needs a custom resolver to transform FK fields into ResourceRef objects
// that the engine can follow when traversing relations
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

// Create the toride engine with the policy and resolvers
export const engine = new Toride({
  policy,
  resolvers: {
    Project: projectResolver,
    Task: taskResolver,
  },
});
