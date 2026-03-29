import { Hono } from "hono";
import { TorideClient } from "toride";
import { prisma } from "../db.js";
import { engine, adapter } from "../engine.js";
import { toActorRef } from "../types.js";
import type { AppEnv, AppSchema } from "../types.js";
import { Layout } from "../components/Layout.js";
import { ProjectList } from "../components/ProjectList.js";
import { ProjectDetail } from "../components/ProjectDetail.js";
import { TaskItem } from "../components/TaskItem.js";

const app = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// PATTERN: Authorization-filtered list queries with buildConstraints()
//
// For list pages, we push authorization filtering down to the database so we
// only fetch rows the user is allowed to see. buildConstraints() produces an
// abstract constraint AST (or "unrestricted"/"forbidden" signals) based on
// the policy. translateConstraints() converts the AST into a Prisma WHERE
// clause via the adapter.
//
// This replaces the manual superadmin check + hand-built WHERE clause with
// a single, policy-driven query filter that stays in sync with policy.yaml.
// ---------------------------------------------------------------------------

app.get("/", async (c) => {
  const user = c.get("currentUser");
  const allUsers = c.get("allUsers");
  const actor = toActorRef(user);

  type ProjectRow = {
    id: string;
    name: string;
    department: string;
    status: string;
    archived: boolean;
  };
  let projects: ProjectRow[] = [];

  // ---------------------------------------------------------------------------
  // Step 1: Use buildConstraints() to determine the actor's access level.
  //
  // buildConstraints() evaluates the policy for the given actor+action+resource
  // type and returns a ConstraintResult<"Project"> discriminated union:
  //   - { unrestricted: true }  → actor can read all resources of this type
  //   - { forbidden: true }     → actor cannot read any resources
  //   - { constraints: ... }    → partial access, pass to translateConstraints()
  //
  // translateConstraints() accepts the narrowed ConstraintResult directly and
  // converts the constraint AST into a Prisma WHERE clause via the adapter.
  // ---------------------------------------------------------------------------
  const result = await engine.buildConstraints(actor, "read", "Project");

  if ("forbidden" in result) {
    projects = [];
  } else if ("unrestricted" in result) {
    projects = await prisma.project.findMany({ orderBy: { name: "asc" } });
  } else {
    const where = engine.translateConstraints(result, adapter);
    projects = await prisma.project.findMany({ where, orderBy: { name: "asc" } });
  }

  // ---------------------------------------------------------------------------
  // PATTERN: snapshot() + TorideClient for batched permission checks
  //
  // Instead of calling permittedActions() per resource in a loop, snapshot()
  // batches all calls and returns a PermissionSnapshot map. TorideClient wraps
  // the snapshot for synchronous lookups with full type safety.
  //
  // This is more efficient for list views and demonstrates the snapshot/client
  // pattern intended for server-to-client permission transport.
  // ---------------------------------------------------------------------------
  const snap = await engine.snapshot(
    actor,
    projects.map((p) => ({ type: "Project" as const, id: p.id })),
  );
  const client = new TorideClient<AppSchema>(snap);

  const projectsWithActions = projects.map((project) => ({
    ...project,
    permittedActions: client.permittedActions({ type: "Project", id: project.id }),
  }));

  return c.html(
    <Layout currentUser={user} users={allUsers}>
      <ProjectList projects={projectsWithActions} />
    </Layout>,
  );
});

// ---------------------------------------------------------------------------
// PATTERN: can() for single-resource access control
//
// For detail pages and mutations, use can(actor, action, resourceRef) to check
// whether the actor is allowed to perform a specific action on a specific
// resource instance. This is the simplest authorization check — it returns
// a boolean.
//
// The flow here is: verify the resource exists, then check can("read", ...),
// and return 403 if denied. This is the standard guard pattern for detail pages.
// ---------------------------------------------------------------------------

app.get("/:id", async (c) => {
  const user = c.get("currentUser");
  const allUsers = c.get("allUsers");
  const actor = toActorRef(user);
  const projectId = c.req.param("id");

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

  const tasks = await prisma.task.findMany({
    where: { projectId },
    include: { assignee: { select: { name: true } } },
    orderBy: { title: "asc" },
  });

  const projectRef = { type: "Project" as const, id: projectId };
  const taskRefs = tasks.map((t) => ({ type: "Task" as const, id: t.id }));

  const snap = await engine.snapshot(actor, [projectRef, ...taskRefs]);
  const client = new TorideClient<AppSchema>(snap);

  const projectActions = client.permittedActions(projectRef);

  const tasksWithActions = tasks.map((task) => ({
    task,
    permittedActions: client.permittedActions({
      type: "Task" as const,
      id: task.id,
    }),
  }));

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