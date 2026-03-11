import { Hono } from "hono";
import { prisma } from "../db.js";
import { engine } from "../engine.js";
import { toActorRef } from "../types.js";
import type { AppEnv } from "../types.js";
import { Layout } from "../components/Layout.js";
import { ProjectList } from "../components/ProjectList.js";
import { ProjectDetail } from "../components/ProjectDetail.js";
import { TaskItem } from "../components/TaskItem.js";

const app = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// PATTERN: Authorization-filtered list queries
//
// For list pages, we push authorization filtering down to the database so we
// only fetch rows the user is allowed to see. This app's policy combines
// multiple access paths:
//
//   1. Superadmin global role → access all non-archived projects
//   2. Department-based derived role → $actor.department == $resource.department
//   3. Direct role assignments → viewer/editor/admin via RoleAssignment table
//   4. Forbid rule → archived projects are excluded for everyone
//
// We check the superadmin case first (no WHERE filter needed beyond archived),
// then build a combined OR clause covering department match and direct role
// assignments. The forbid rule (archived) is applied in all cases.
//
// NOTE: buildConstraints() can also be used here for simpler policies where
// all access paths map to real database columns. This app uses a hybrid
// approach because the policy includes virtual attributes (viewer_ids, etc.)
// that exist in the resolver but not in the database schema. See engine.ts
// for details on the resolver design.
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
  // Step 1: Determine the actor's access level and build the query filter.
  //
  // Superadmins (identified by the isSuperAdmin attribute) get admin role on
  // all projects via the global_roles + derived_roles policy rules. They can
  // read everything except archived projects (the forbid rule still applies).
  //
  // For other users, we build a WHERE clause combining two access paths:
  //   Path 1: Direct role assignments from the RoleAssignment table
  //   Path 2: Department-based derived role ($actor.department == $resource.department)
  // Both paths exclude archived projects per the policy's forbid rule.
  // ---------------------------------------------------------------------------

  if (actor.attributes?.isSuperAdmin) {
    // Superadmin: can read all projects, but the policy's forbid rule still
    // excludes archived projects. We apply that filter here to stay consistent.
    projects = await prisma.project.findMany({
      where: { archived: { not: true } },
      orderBy: { name: "asc" },
    });
  } else {
    // Non-superadmin: combine direct role assignments + department match
    const readRoles = ["viewer", "editor", "admin"];
    projects = await prisma.project.findMany({
      where: {
        AND: [
          { archived: { not: true } },
          {
            OR: [
              // Path 1: Actor has an explicit role assignment granting read
              {
                roleAssignments: {
                  some: { userId: actor.id, role: { in: readRoles } },
                },
              },
              // Path 2: Actor's department matches the project's department
              // (derived editor role from policy.yaml)
              ...(actor.attributes?.department
                ? [{ department: actor.attributes.department as string }]
                : []),
            ],
          },
        ],
      },
      orderBy: { name: "asc" },
    });
  }

  // ---------------------------------------------------------------------------
  // PATTERN: permittedActions (UI action visibility)
  //
  // After fetching the filtered list, we call permittedActions() for each
  // resource to determine which actions the actor can perform. This returns
  // an array of action strings (e.g., ["read", "update", "create_task"]).
  //
  // Components use this to conditionally render edit/delete buttons and
  // create-task forms, so users only see controls they're authorized to use.
  // This is a UI convenience — actual enforcement happens in the mutation
  // routes (see tasks.tsx).
  // ---------------------------------------------------------------------------
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

  // Verify the project exists (this is a data check, not authorization)
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

  // ---------------------------------------------------------------------------
  // PATTERN: can() guard — check before rendering
  //
  // can() resolves the actor's roles on this Project (explicit roles from
  // RoleAssignment, derived roles from department match or superadmin status),
  // applies grants and forbid rules, and returns true/false.
  //
  // For archived Project Gamma, can("read") returns false for everyone because
  // the policy forbids all permissions when $resource.archived is true.
  // ---------------------------------------------------------------------------
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

  // permittedActions on the project determines whether the "create task" form
  // is shown — it checks if "create_task" is in the returned actions array
  const projectActions = await engine.permittedActions(actor, {
    type: "Project",
    id: projectId,
  });

  // ---------------------------------------------------------------------------
  // Task loading strategy:
  //
  // Since we already verified the user can read the parent Project via can(),
  // and the Task policy derives all read roles from the Project relation
  // (viewer->viewer, editor->editor), we know the user can read all tasks
  // in this project. We simply fetch all tasks scoped to the project.
  //
  // This avoids a second buildConstraints call for Task, which would be
  // redundant when the parent project access has already been verified.
  // ---------------------------------------------------------------------------
  const tasks = await prisma.task.findMany({
    where: { projectId },
    include: { assignee: { select: { name: true } } },
    orderBy: { title: "asc" },
  });

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
