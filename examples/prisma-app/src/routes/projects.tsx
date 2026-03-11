import { Hono } from "hono";
import { prisma } from "../db.js";
import { engine, adapter } from "../engine.js";
import { toActorRef } from "../types.js";
import type { AppEnv } from "../types.js";
import { Layout } from "../components/Layout.js";
import { ProjectList } from "../components/ProjectList.js";
import { ProjectDetail } from "../components/ProjectDetail.js";
import { TaskItem } from "../components/TaskItem.js";

const app = new Hono<AppEnv>();

/**
 * GET /projects — List all projects the current user can read.
 * Uses buildConstraints() to generate a Prisma WHERE clause that
 * filters projects at the database level based on the user's roles.
 */
app.get("/", async (c) => {
  const user = c.get("currentUser");
  const allUsers = c.get("allUsers");
  const actor = toActorRef(user);

  // Build authorization constraints for reading Projects
  const result = await engine.buildConstraints(actor, "read", "Project");

  let projects: Array<{
    id: string;
    name: string;
    department: string;
    status: string;
    archived: boolean;
  }> = [];

  if ("forbidden" in result && result.forbidden) {
    // Actor cannot read any projects
    projects = [];
  } else if ("unrestricted" in result && result.unrestricted) {
    // Actor can read all projects
    projects = await prisma.project.findMany({ orderBy: { name: "asc" } });
  } else {
    // Translate constraint AST into a Prisma WHERE clause
    const where = engine.translateConstraints(result.constraints, adapter);
    projects = await prisma.project.findMany({
      where,
      orderBy: { name: "asc" },
    });
  }

  // Determine permitted actions for each project
  const projectsWithActions = await Promise.all(
    projects.map(async (project) => {
      const actions = await engine.permittedActions(actor, {
        type: "Project",
        id: project.id,
      });
      return { ...project, permittedActions: actions };
    }),
  );

  return c.html(
    <Layout currentUser={user} users={allUsers}>
      <ProjectList projects={projectsWithActions} />
    </Layout>,
  );
});

/**
 * GET /projects/:id — Project detail page with task list.
 * First checks if the user can read the project, then builds
 * constraints for reading tasks scoped to this project.
 */
app.get("/:id", async (c) => {
  const user = c.get("currentUser");
  const allUsers = c.get("allUsers");
  const actor = toActorRef(user);
  const projectId = c.req.param("id");

  // Verify the project exists
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    return c.html(
      <Layout currentUser={user} users={allUsers}>
        <div class="error">Project not found.</div>
      </Layout>,
      404,
    );
  }

  // Check if the user can read this project
  const canRead = await engine.can(actor, "read", {
    type: "Project",
    id: projectId,
  });

  if (!canRead) {
    return c.html(
      <Layout currentUser={user} users={allUsers}>
        <div class="error">You do not have permission to view this project.</div>
      </Layout>,
      403,
    );
  }

  // Get permitted actions on the project (for showing create task form, etc.)
  const projectActions = await engine.permittedActions(actor, {
    type: "Project",
    id: projectId,
  });

  // Build constraints for reading Tasks, then add projectId filter
  const taskResult = await engine.buildConstraints(actor, "read", "Task");

  let tasks: Array<{
    id: string;
    title: string;
    status: string;
    description: string | null;
    projectId: string;
    assigneeId: string | null;
    assignee: { name: string } | null;
  }> = [];

  if ("forbidden" in taskResult && taskResult.forbidden) {
    tasks = [];
  } else if ("unrestricted" in taskResult && taskResult.unrestricted) {
    tasks = await prisma.task.findMany({
      where: { projectId },
      include: { assignee: { select: { name: true } } },
      orderBy: { title: "asc" },
    });
  } else {
    const taskWhere = engine.translateConstraints(
      taskResult.constraints,
      adapter,
    );
    tasks = await prisma.task.findMany({
      where: { AND: [taskWhere, { projectId }] },
      include: { assignee: { select: { name: true } } },
      orderBy: { title: "asc" },
    });
  }

  // Determine permitted actions for each task
  const tasksWithActions = await Promise.all(
    tasks.map(async (task) => {
      const actions = await engine.permittedActions(actor, {
        type: "Task",
        id: task.id,
      });
      return { task, permittedActions: actions };
    }),
  );

  return c.html(
    <Layout currentUser={user} users={allUsers}>
      <ProjectDetail project={project} permittedActions={projectActions}>
        {tasksWithActions.map(({ task, permittedActions }) => (
          <TaskItem
            task={{
              id: task.id,
              title: task.title,
              status: task.status,
              assignee: task.assignee,
            }}
            permittedActions={permittedActions}
          />
        ))}
        {tasksWithActions.length === 0 && (
          <li class="empty">No tasks in this project.</li>
        )}
      </ProjectDetail>
    </Layout>,
  );
});

export default app;
