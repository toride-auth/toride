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

// ---------------------------------------------------------------------------
// PATTERN: buildConstraints → translateConstraints (list filtering)
//
// For list pages, we don't check permissions on each row individually.
// Instead, buildConstraints() evaluates the policy and returns one of three
// discriminated results:
//
//   { forbidden: true }      — actor has zero access; skip the query entirely
//   { unrestricted: true }   — actor can see everything; query without a filter
//   { constraints: [...] }   — partial access; pass constraints through
//                               translateConstraints() to get a Prisma WHERE
//
// This pushes authorization filtering down to the database, so you only fetch
// rows the user is allowed to see. The policy's "forbid" rules (e.g., archived
// projects) are folded into the constraints automatically.
// ---------------------------------------------------------------------------

app.get("/", async (c) => {
  const user = c.get("currentUser");
  const allUsers = c.get("allUsers");
  const actor = toActorRef(user);

  // ---------------------------------------------------------------------------
  // Step 1: Build authorization constraints for reading Projects.
  // The engine evaluates all role derivations, grants, and forbid rules from
  // policy.yaml to determine what this actor can read. For example:
  //   - Alice (viewer on Alpha only) gets constraints scoping to Alpha
  //   - Charlie (superadmin) gets { unrestricted: true }
  //   - Archived projects are excluded by the forbid rule
  // ---------------------------------------------------------------------------
  const result = await engine.buildConstraints(actor, "read", "Project");

  type ProjectRow = {
    id: string;
    name: string;
    department: string;
    status: string;
    archived: boolean;
  };
  let projects: ProjectRow[] = [];

  // ---------------------------------------------------------------------------
  // Step 2: Handle the three-way discriminated union result.
  // The constraint result is a tagged union — use "in" narrowing to branch.
  // This pattern ensures you handle all cases and keeps the TypeScript types
  // correct without casts.
  //
  // buildConstraints evaluates derived roles and policy rules to produce a
  // WHERE clause, but it does NOT cover explicit role assignments stored in
  // the RoleAssignment table. To include those, we build an additional OR
  // clause that checks for direct role assignments granting read access.
  // ---------------------------------------------------------------------------

  // Roles that grant "read" access (from the policy's grants section)
  const readRoles = ["viewer", "editor", "admin"];

  // Direct role assignment filter: projects where the actor has an explicit
  // role assignment that grants read access AND the project is not archived
  const directRoleFilter = {
    AND: [
      {
        roleAssignments: {
          some: { userId: actor.id, role: { in: readRoles } },
        },
      },
      { archived: { not: true } },
    ],
  };

  if ("forbidden" in result) {
    // No derived-role access, but the actor might still have direct role
    // assignments granting read access (e.g., Alice as explicit viewer)
    projects = await prisma.project.findMany({
      where: directRoleFilter,
      orderBy: { name: "asc" },
    });
  } else if ("unrestricted" in result) {
    // Actor can read all projects — no WHERE clause needed
    projects = await prisma.project.findMany({ orderBy: { name: "asc" } });
  } else {
    // Partial access from derived roles — combine with direct role assignments
    // using OR so the actor sees projects from BOTH access paths
    const derivedWhere = engine.translateConstraints(
      result.constraints,
      adapter,
    );
    projects = await prisma.project.findMany({
      where: { OR: [derivedWhere, directRoleFilter] },
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
